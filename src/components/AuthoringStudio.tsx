import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Captions,
  CheckSquare,
  Crosshair,
  Download,
  FileVideo,
  GripHorizontal,
  HelpCircle,
  ImagePlus,
  Info,
  Link2,
  ListOrdered,
  Pause,
  Play,
  Plus,
  Redo2,
  Settings2,
  Sliders,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import {
  CourseProject,
  DisplayMode,
  InteractionItem,
  InteractionType,
  ScormVersion,
  SubtitleCue,
} from '../types/course';
import {
  buildDragWordBank,
  extractYouTubeId,
  formatTime,
  formatTimePrecise,
  getInteractionTypeLabel,
  getVideoBlob,
  parseFillBlankParts,
  parseSubtitleFile,
  saveVideoBlob,
} from '../utils/storage';
import { BuiltInVideoCanvas } from './BuiltInVideoCanvas';
import { YouTubePlayerEmbed, YouTubePlayerHandle } from './YouTubePlayerEmbed';

interface AuthoringStudioProps {
  course: CourseProject;
  onUpdateCourse: (updated: CourseProject) => void;
  onSwitchToPreview: () => void;
}

type InspectorTab = 'interaction' | 'video' | 'subtitles' | 'settings';

export const AuthoringStudio: React.FC<AuthoringStudioProps> = ({
  course,
  onUpdateCourse,
  onSwitchToPreview,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<YouTubePlayerHandle>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);

  const [objectVideoUrl, setObjectVideoUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(course.duration || 60);
  const [selectedId, setSelectedId] = useState<string | null>(
    course.interactions[0]?.id || null
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('interaction');
  const [videoUrlInput, setVideoUrlInput] = useState(course.videoUrl || '');
  const [urlFeedback, setUrlFeedback] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [subtitleFeedback, setSubtitleFeedback] = useState<string | null>(null);

  // Undo / Redo stacks
  const [past, setPast] = useState<CourseProject[]>([]);
  const [future, setFuture] = useState<CourseProject[]>([]);
  const courseRef = useRef(course);
  courseRef.current = course;

  const commitCourseEdit = useCallback(
    (updated: CourseProject, recordHistory = true) => {
      if (recordHistory) {
        setPast((prev) => [...prev.slice(-24), courseRef.current]);
        setFuture([]);
      }
      onUpdateCourse(updated);
    },
    [onUpdateCourse]
  );

  const handleUndo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setFuture((f) => [courseRef.current, ...f]);
      onUpdateCourse(previous);
      return prev.slice(0, -1);
    });
  }, [onUpdateCourse]);

  const handleRedo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      setPast((p) => [...p, courseRef.current]);
      onUpdateCourse(next);
      return prev.slice(1);
    });
  }, [onUpdateCourse]);

  // Reset history when switching courses
  useEffect(() => {
    setPast([]);
    setFuture([]);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(course.duration || 60);
    setSelectedId(course.interactions[0]?.id || null);
    setVideoUrlInput(course.videoUrl || '');
    setUrlFeedback(null);

    let revoked = '';
    if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
      getVideoBlob(course.uploadedVideoKey).then((blob) => {
        if (blob) {
          revoked = URL.createObjectURL(blob);
          setObjectVideoUrl(revoked);
        } else {
          setObjectVideoUrl('');
        }
      });
    } else {
      setObjectVideoUrl('');
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [course.id, course.videoSourceType, course.uploadedVideoKey, course.duration]);

  // Keyboard Undo / Redo (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Built-in playback loop inside Authoring Studio
  useEffect(() => {
    if (course.videoSourceType !== 'builtin' || !isPlaying) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });
    }, 60);
    return () => window.clearInterval(timer);
  }, [course.videoSourceType, isPlaying, duration]);

  const sortedInteractions = useMemo(
    () => [...course.interactions].sort((a, b) => a.timestamp - b.timestamp),
    [course.interactions]
  );

  const selectedItem = useMemo(
    () => course.interactions.find((i) => i.id === selectedId) || null,
    [course.interactions, selectedId]
  );

  const activeSubtitle = useMemo(() => {
    if (course.subtitlesEnabledByDefault === false || !course.subtitles?.length) return null;
    return (
      course.subtitles.find(
        (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime
      ) || null
    );
  }, [course.subtitles, course.subtitlesEnabledByDefault, currentTime]);

  // Detect overlapping timestamps within 1.5 seconds
  const collisionPairs = useMemo(() => {
    const warnings: string[] = [];
    for (let i = 0; i < sortedInteractions.length - 1; i++) {
      const a = sortedInteractions[i];
      const b = sortedInteractions[i + 1];
      if (Math.abs(b.timestamp - a.timestamp) < 1.5) {
        warnings.push(
          `"${a.title}" (${formatTimePrecise(a.timestamp)}) và "${b.title}" (${formatTimePrecise(b.timestamp)}) quá gần nhau`
        );
      }
    }
    return warnings;
  }, [sortedInteractions]);

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentTime(clamped);
    if (course.videoSourceType === 'youtube') {
      ytRef.current?.seekTo(clamped);
    } else if (course.videoSourceType !== 'builtin' && videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (course.videoSourceType === 'youtube') ytRef.current?.pause();
      else if (course.videoSourceType !== 'builtin' && videoRef.current) videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTime >= duration - 0.2) seekTo(0);
      if (course.videoSourceType === 'youtube') ytRef.current?.play();
      else if (course.videoSourceType !== 'builtin' && videoRef.current) videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleAddInteraction = (type: InteractionType) => {
    setIsPlaying(false);
    if (course.videoSourceType === 'youtube') ytRef.current?.pause();
    else if (course.videoSourceType !== 'builtin' && videoRef.current) videoRef.current.pause();

    const id = `int-${Date.now()}`;
    const base: InteractionItem = {
      id,
      type,
      timestamp: Number(currentTime.toFixed(1)),
      duration: 6,
      title: `Điểm tương tác mới (${getInteractionTypeLabel(type)})`,
      prompt:
        type === InteractionType.INFO
          ? 'Ghi chú quan trọng cho học viên'
          : type === InteractionType.HOTSPOT
          ? 'Nhấp vào khu vực mục tiêu trên video.'
          : type === InteractionType.FILL_BLANK
          ? 'Điền từ còn thiếu vào các chỗ trống bên dưới:'
          : type === InteractionType.DRAG_TEXT
          ? 'Kéo hoặc bấm chọn từ thích hợp bên dưới để điền vào chỗ trống:'
          : type === InteractionType.ORDERING
          ? 'Sắp xếp các bước sau theo đúng trình tự:'
          : 'Nhập câu hỏi kiểm tra kiến thức tại thời điểm này:',
      displayMode: type === InteractionType.INFO ? 'button' : 'poster',
      pauseVideo: true,
      points: type === InteractionType.INFO ? 0 : 20,
      position: { x: 50, y: 50 },
      explanation: 'Giải thích đáp án đúng cho học viên sau khi kiểm tra.',
    };

    if (type === InteractionType.MULTIPLE_CHOICE || type === InteractionType.MULTI_SELECT) {
      base.options = [
        { id: `${id}-a`, text: 'Phương án A (Đáp án đúng)', isCorrect: true },
        { id: `${id}-b`, text: 'Phương án B', isCorrect: false },
        { id: `${id}-c`, text: 'Phương án C', isCorrect: false },
      ];
    } else if (type === InteractionType.TRUE_FALSE) {
      base.options = [
        { id: `${id}-t`, text: 'Đúng', isCorrect: true },
        { id: `${id}-f`, text: 'Sai', isCorrect: false },
      ];
    } else if (type === InteractionType.FILL_BLANK) {
      base.blankSentence = 'Quy trình an toàn yêu cầu ngắt *nguồn điện* trước khi *bảo trì* thiết bị.';
      base.caseSensitive = false;
    } else if (type === InteractionType.DRAG_TEXT) {
      base.blankSentence = 'Quy trình an toàn yêu cầu ngắt *nguồn điện* trước khi *bảo trì* thiết bị.';
      base.distractorWords = ['tăng tốc', 'khởi động', 'bỏ qua'];
      base.caseSensitive = false;
    } else if (type === InteractionType.HOTSPOT) {
      base.hotspot = { x: 35, y: 30, width: 24, height: 26 };
    } else if (type === InteractionType.ORDERING) {
      base.orderingItems = [
        'Bước 1: Chuẩn bị và kiểm tra khu vực',
        'Bước 2: Thực hiện thao tác chính',
        'Bước 3: Nghiệm thu và bàn giao',
      ];
    } else if (type === InteractionType.INFO) {
      base.infoBody = 'Nhập nội dung tóm tắt, ghi chú hoặc lưu ý chuyên môn tại đây.';
    }

    commitCourseEdit({
      ...course,
      interactions: [...course.interactions, base],
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setSelectedId(id);
    setInspectorTab('interaction');
  };

  const updateSelectedItem = (patch: Partial<InteractionItem>, recordHistory = true) => {
    if (!selectedItem) return;
    commitCourseEdit(
      {
        ...courseRef.current,
        interactions: courseRef.current.interactions.map((item) =>
          item.id === selectedItem.id ? { ...item, ...patch } : item
        ),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      recordHistory
    );
  };

  const deleteSelectedItem = () => {
    if (!selectedItem) return;
    const remaining = course.interactions.filter((i) => i.id !== selectedItem.id);
    commitCourseEdit({
      ...course,
      interactions: remaining,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setSelectedId(remaining[0]?.id || null);
  };

  // Drag Hotspot Move / Resize or Pin Drag directly on 16:9 stage
  const startStageDrag = (
    e: React.MouseEvent,
    mode: 'hotspot-move' | 'hotspot-resize' | 'pin-move'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedItem || !stageContainerRef.current) return;

    const stageRect = stageContainerRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initHotspot = selectedItem.hotspot ? { ...selectedItem.hotspot } : null;
    const initPos = { ...selectedItem.position };

    // Snapshot before drag for clean 1-step Undo
    setPast((prev) => [...prev.slice(-24), courseRef.current]);
    setFuture([]);

    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startX) / stageRect.width) * 100;
      const dyPct = ((ev.clientY - startY) / stageRect.height) * 100;

      if (mode === 'hotspot-move' && initHotspot) {
        const nx = Math.max(0, Math.min(100 - initHotspot.width, Math.round(initHotspot.x + dxPct)));
        const ny = Math.max(0, Math.min(100 - initHotspot.height, Math.round(initHotspot.y + dyPct)));
        updateSelectedItem(
          { hotspot: { ...initHotspot, x: nx, y: ny } },
          false
        );
      } else if (mode === 'hotspot-resize' && initHotspot) {
        const nw = Math.max(6, Math.min(100 - initHotspot.x, Math.round(initHotspot.width + dxPct)));
        const nh = Math.max(6, Math.min(100 - initHotspot.y, Math.round(initHotspot.height + dyPct)));
        updateSelectedItem(
          { hotspot: { ...initHotspot, width: nw, height: nh } },
          false
        );
      } else if (mode === 'pin-move') {
        const nx = Math.max(5, Math.min(95, Math.round(initPos.x + dxPct)));
        const ny = Math.max(8, Math.min(92, Math.round(initPos.y + dyPct)));
        updateSelectedItem({ position: { x: nx, y: ny } }, false);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Drag Timeline Pin horizontally along track
  const startTimelinePinDrag = (e: React.MouseEvent, item: InteractionItem) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(item.id);
    setInspectorTab('interaction');
    if (!timelineTrackRef.current) return;

    const trackRect = timelineTrackRef.current.getBoundingClientRect();
    setPast((prev) => [...prev.slice(-24), courseRef.current]);
    setFuture([]);

    const onMove = (ev: MouseEvent) => {
      const pct = Math.max(0, Math.min(1, (ev.clientX - trackRect.left) / trackRect.width));
      const nextTs = Number((pct * duration).toFixed(1));
      commitCourseEdit(
        {
          ...courseRef.current,
          interactions: courseRef.current.interactions.map((x) =>
            x.id === item.id ? { ...x, timestamp: nextTs } : x
          ),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
        false
      );
      seekTo(nextTs);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Đang lưu tệp video vào trình duyệt...');
    const key = `vid-${course.id}-${Date.now()}`;
    await saveVideoBlob(key, file);

    const tempUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = tempUrl;
    probe.onloadedmetadata = () => {
      const detectedDuration = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 60;
      URL.revokeObjectURL(tempUrl);
      commitCourseEdit({
        ...course,
        videoSourceType: 'upload',
        uploadedVideoKey: key,
        uploadedVideoName: file.name,
        uploadedVideoMime: file.type || 'video/mp4',
        duration: detectedDuration,
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      setDuration(detectedDuration);
      setUploadStatus(`Đã tải lên: ${file.name} (${formatTime(detectedDuration)})`);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      setUploadStatus('Không đọc được định dạng video này. Vui lòng thử MP4 hoặc WebM.');
    };
  };

  const handleApplyVideoUrl = () => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) return;
    const ytId = extractYouTubeId(trimmed);
    if (ytId) {
      commitCourseEdit({
        ...course,
        videoSourceType: 'youtube',
        videoUrl: trimmed,
        youtubeId: ytId,
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      setUrlFeedback(`Đã nhận diện video YouTube (ID: ${ytId}).`);
      return;
    }

    if (trimmed.includes('drive.google.com')) {
      setUrlFeedback('Link Google Drive không hỗ trợ phát trực tiếp. Vui lòng tải file MP4 về máy hoặc dùng link YouTube / MP4 trực tiếp.');
      return;
    }

    commitCourseEdit({
      ...course,
      videoSourceType: 'url',
      videoUrl: trimmed,
      youtubeId: undefined,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setUrlFeedback('Đã áp dụng liên kết video MP4/WebM trực tiếp.');
  };

  const handleExportProjectJson = () => {
    const data = JSON.stringify(course, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.id}.lumacast.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleQuestionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      updateSelectedItem({ imageUrl: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubtitleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const cues = parseSubtitleFile(content);
    if (cues.length === 0) {
      setSubtitleFeedback('Không đọc được dòng phụ đề hợp lệ từ tệp .vtt / .srt này.');
      e.target.value = '';
      return;
    }
    commitCourseEdit({
      ...course,
      subtitles: cues,
      subtitleFileName: file.name,
      subtitlesEnabledByDefault: true,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setSubtitleFeedback(`Đã nhập ${cues.length} dòng phụ đề từ "${file.name}".`);
    e.target.value = '';
  };

  const handleAddSubtitleCue = () => {
    const start = Number(currentTime.toFixed(1));
    const end = Number(Math.min(duration, start + 4).toFixed(1));
    const newCue: SubtitleCue = {
      id: `sub-${Date.now()}`,
      startTime: start,
      endTime: end > start ? end : Number((start + 2).toFixed(1)),
      text: 'Nhập nội dung phụ đề tại đây...',
    };
    const nextSubs = [...(course.subtitles || []), newCue].sort(
      (a, b) => a.startTime - b.startTime
    );
    commitCourseEdit({
      ...course,
      subtitles: nextSubs,
      subtitlesEnabledByDefault: course.subtitlesEnabledByDefault ?? true,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  };

  const handleUpdateSubtitleCue = (cueId: string, patch: Partial<SubtitleCue>) => {
    const nextSubs = (course.subtitles || [])
      .map((c) => (c.id === cueId ? { ...c, ...patch } : c))
      .sort((a, b) => a.startTime - b.startTime);
    commitCourseEdit({
      ...course,
      subtitles: nextSubs,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  };

  const handleDeleteSubtitleCue = (cueId: string) => {
    const nextSubs = (course.subtitles || []).filter((c) => c.id !== cueId);
    commitCourseEdit({
      ...course,
      subtitles: nextSubs,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  };

  const resolvedVideoSrc =
    course.videoSourceType === 'upload'
      ? objectVideoUrl
      : course.videoSourceType === 'url'
      ? course.videoUrl
      : '';

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Column: Stage + Interactive Multi-Pin Timeline (7/12 on xl) */}
      <div className="xl:col-span-7 space-y-4">
        {/* Stage Header Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Khung hình biên tập · Kéo trực tiếp Hotspot / Ghim trên video</div>
            <div className="text-sm font-bold text-slate-900 truncate max-w-md">{course.title}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={past.length === 0}
              onClick={handleUndo}
              title="Hoàn tác (Ctrl+Z)"
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={future.length === 0}
              onClick={handleRedo}
              title="Làm lại (Ctrl+Y)"
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleExportProjectJson}
              title="Lưu file dự án gốc (.json) để chia sẻ cho đồng nghiệp sửa tiếp"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Lưu dự án</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToPreview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              Xem thử
            </button>
          </div>
        </div>

        {/* 16:9 Authoring Stage with Interactive Drag & Resize Hotspot/Pin */}
        <div
          ref={stageContainerRef}
          className="relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-200 shadow-sm select-none"
        >
          {course.videoSourceType === 'builtin' ? (
            <BuiltInVideoCanvas
              scenes={course.builtInScenes || []}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              courseTitle={course.title}
              fallbackCover={course.coverImage}
            />
          ) : course.videoSourceType === 'youtube' && course.youtubeId ? (
            <YouTubePlayerEmbed
              ref={ytRef}
              videoId={course.youtubeId}
              onReady={(dur) => {
                setDuration(dur);
                if (Math.abs(course.duration - dur) > 2) {
                  commitCourseEdit({ ...course, duration: Math.round(dur) }, false);
                }
              }}
              onTimeUpdate={(sec) => setCurrentTime(sec)}
              onPlayStateChange={(playing) => setIsPlaying(playing)}
              onEnded={() => setIsPlaying(false)}
            />
          ) : resolvedVideoSrc ? (
            <video
              ref={videoRef}
              src={resolvedVideoSrc}
              playsInline
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (d && Number.isFinite(d)) setDuration(d);
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onEnded={() => setIsPlaying(false)}
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <FileVideo className="w-10 h-10 mb-2 text-slate-500" />
              <p className="text-sm font-medium text-slate-200">Chưa có video nguồn</p>
              <p className="text-xs text-slate-400 mt-1">
                Chọn tab Nguồn Video ở bảng bên phải để tải MP4/WebM hoặc dán link YouTube / MP4.
              </p>
            </div>
          )}

          {/* Draggable & Resizable Hotspot Box */}
          {selectedItem && selectedItem.type === InteractionType.HOTSPOT && selectedItem.hotspot && (
            <div
              onMouseDown={(e) => startStageDrag(e, 'hotspot-move')}
              style={{
                left: `${selectedItem.hotspot.x}%`,
                top: `${selectedItem.hotspot.y}%`,
                width: `${selectedItem.hotspot.width}%`,
                height: `${selectedItem.hotspot.height}%`,
              }}
              className="absolute z-20 border-2 border-emerald-400 bg-emerald-500/25 rounded-lg cursor-move flex items-start justify-start p-1 group"
            >
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold whitespace-nowrap pointer-events-none">
                Kéo di chuyển ({selectedItem.hotspot.x}%, {selectedItem.hotspot.y}% · {selectedItem.hotspot.width}×{selectedItem.hotspot.height}%)
              </span>
              {/* Bottom-right resize handle */}
              <div
                onMouseDown={(e) => startStageDrag(e, 'hotspot-resize')}
                title="Kéo để chỉnh kích thước vùng Hotspot"
                className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-sm bg-white border-2 border-emerald-600 cursor-nwse-resize shadow"
              />
            </div>
          )}

          {/* Draggable Pin Badge for non-Hotspot interactions */}
          {selectedItem && selectedItem.type !== InteractionType.HOTSPOT && (
            <div
              onMouseDown={(e) => startStageDrag(e, 'pin-move')}
              style={{
                left: `${selectedItem.position.x}%`,
                top: `${selectedItem.position.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              title="Kéo để đổi vị trí nút hiển thị trên video"
              className="absolute z-20 px-3 py-1.5 rounded-lg bg-sky-600/95 border-2 border-white text-white text-xs font-semibold shadow-lg cursor-move whitespace-nowrap"
            >
              {selectedItem.title}
            </div>
          )}

          {/* Live Subtitle Preview on Stage */}
          {activeSubtitle && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 max-w-[88%] px-3.5 py-1.5 rounded-lg bg-slate-950/85 border border-white/10 text-white text-xs font-medium text-center pointer-events-none shadow-lg">
              {activeSubtitle.text}
            </div>
          )}
        </div>

        {/* Lumi-Style Timeline & Quick-Add Interaction Strip */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Dừng' : 'Phát'}</span>
              </button>
              <span className="font-mono text-xs tabular-nums text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
                {formatTimePrecise(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {selectedItem && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Dịch mốc đang chọn:</span>
                <button
                  type="button"
                  onClick={() => {
                    const t = Math.max(0, Number((selectedItem.timestamp - 0.5).toFixed(1)));
                    updateSelectedItem({ timestamp: t });
                    seekTo(t);
                  }}
                  className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 font-mono text-slate-700 cursor-pointer"
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = Math.min(duration, Number((selectedItem.timestamp + 0.5).toFixed(1)));
                    updateSelectedItem({ timestamp: t });
                    seekTo(t);
                  }}
                  className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 font-mono text-slate-700 cursor-pointer"
                >
                  +0.5s
                </button>
              </div>
            )}
          </div>

          {/* Interactive Pin Track (supports dragging pins directly!) */}
          <div className="relative pt-2 pb-1">
            <div
              ref={timelineTrackRef}
              className="relative h-8 bg-slate-100 border border-slate-200 rounded-lg overflow-visible flex items-center px-1"
            >
              <div
                className="absolute left-0 top-0 bottom-0 bg-sky-100/70 rounded-l-lg pointer-events-none"
                style={{ width: `${progressPct}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 60}
                step={0.1}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Thanh thời gian biên tập"
                className="studio-range absolute inset-0 w-full h-full opacity-0 z-10"
              />
              <div
                style={{ left: `${progressPct}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-sky-600 z-20 pointer-events-none"
              />

              {sortedInteractions.map((item) => {
                const pct = duration > 0 ? Math.min(98, Math.max(2, (item.timestamp / duration) * 100)) : 0;
                const isSel = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(e) => startTimelinePinDrag(e, item)}
                    title={`${formatTimePrecise(item.timestamp)} · ${item.title} (Kéo ngang để đổi giây)`}
                    style={{ left: `${pct}%` }}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 rotate-45 border-2 border-white shadow transition-transform hover:scale-125 cursor-grab active:cursor-grabbing ${
                      isSel ? 'bg-amber-500 scale-125 ring-2 ring-amber-300' : 'bg-sky-600'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Timestamp collision notice */}
          {collisionPairs.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Cảnh báo mốc thời gian quá sát nhau:</strong> {collisionPairs[0]}. Nên đặt các tương tác cách nhau tối thiểu 2 giây để video chạy mượt.
              </div>
            </div>
          )}

          {/* Quick-Add Interaction Toolbar */}
          <div className="pt-1 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Thêm tương tác tại {formatTimePrecise(currentTime)}:
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { type: InteractionType.MULTIPLE_CHOICE, label: 'Trắc nghiệm', icon: HelpCircle },
                { type: InteractionType.MULTI_SELECT, label: 'Nhiều đáp án', icon: CheckSquare },
                { type: InteractionType.TRUE_FALSE, label: 'Đúng / Sai', icon: ToggleLeft },
                { type: InteractionType.FILL_BLANK, label: 'Điền chỗ trống', icon: Type },
                { type: InteractionType.DRAG_TEXT, label: 'Kéo thả từ', icon: GripHorizontal },
                { type: InteractionType.HOTSPOT, label: 'Điểm nóng Hotspot', icon: Crosshair },
                { type: InteractionType.ORDERING, label: 'Sắp xếp bước', icon: ListOrdered },
                { type: InteractionType.INFO, label: 'Thẻ thông tin', icon: Info },
              ].map((btn) => {
                const Icon = btn.icon;
                return (
                  <button
                    key={btn.type}
                    type="button"
                    onClick={() => handleAddInteraction(btn.type)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3 h-3 text-sky-600" />
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Inspector Panel (5/12 on xl) */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-2 border-b border-slate-200 bg-slate-50 grid grid-cols-4 gap-1">
          {[
            { id: 'interaction' as const, label: 'Tương tác', icon: Sliders },
            { id: 'video' as const, label: 'Video', icon: FileVideo },
            { id: 'subtitles' as const, label: 'Phụ đề', icon: Captions },
            { id: 'settings' as const, label: 'Cài đặt', icon: Settings2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = inspectorTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInspectorTab(tab.id)}
                className={`flex items-center justify-center gap-1 py-2 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Interaction Editor */}
        {inspectorTab === 'interaction' && (
          <div className="p-5 space-y-4 max-h-[760px] overflow-y-auto">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Chọn điểm tương tác ({sortedInteractions.length})
              </label>
              <select
                value={selectedId || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedId(id);
                  const found = course.interactions.find((i) => i.id === id);
                  if (found) seekTo(found.timestamp);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900"
              >
                {sortedInteractions.length === 0 && (
                  <option value="">Chưa có điểm tương tác nào</option>
                )}
                {sortedInteractions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatTime(item.timestamp)} — {item.title} ({getInteractionTypeLabel(item.type)})
                  </option>
                ))}
              </select>
            </div>

            {selectedItem ? (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-sky-700">
                    {getInteractionTypeLabel(selectedItem.type)}
                  </span>
                  <button
                    type="button"
                    onClick={deleteSelectedItem}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa điểm này
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Tiêu đề</label>
                    <input
                      type="text"
                      value={selectedItem.title}
                      onChange={(e) => updateSelectedItem({ title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Thời điểm (giây)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={duration}
                      step={0.5}
                      value={selectedItem.timestamp}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(duration, Number(e.target.value)));
                        updateSelectedItem({ timestamp: val });
                        seekTo(val);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono tabular-nums text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Hiển thị</label>
                    <select
                      value={selectedItem.displayMode}
                      onChange={(e) =>
                        updateSelectedItem({ displayMode: e.target.value as DisplayMode })
                      }
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white"
                    >
                      <option value="poster">Thẻ mở sẵn</option>
                      <option value="button">Nút nhỏ trên video</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Điểm số</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={selectedItem.type === InteractionType.INFO}
                      value={selectedItem.points}
                      onChange={(e) => updateSelectedItem({ points: Math.max(0, Number(e.target.value)) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono tabular-nums text-slate-900 disabled:bg-slate-50"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedItem.pauseVideo}
                        onChange={(e) => updateSelectedItem({ pauseVideo: e.target.checked })}
                        className="rounded border-slate-300 text-sky-600"
                      />
                      <span>Tạm dừng video</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Câu hỏi / Hướng dẫn cho học viên
                  </label>
                  <textarea
                    rows={2}
                    value={selectedItem.prompt}
                    onChange={(e) => updateSelectedItem({ prompt: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>

                {selectedItem.type === InteractionType.INFO && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nội dung thẻ thông tin
                    </label>
                    <textarea
                      rows={3}
                      value={selectedItem.infoBody || ''}
                      onChange={(e) => updateSelectedItem({ infoBody: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
                    />
                  </div>
                )}

                {(selectedItem.type === InteractionType.MULTIPLE_CHOICE ||
                  selectedItem.type === InteractionType.MULTI_SELECT ||
                  selectedItem.type === InteractionType.TRUE_FALSE) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-600">
                        Các phương án trả lời (tích chọn đáp án đúng)
                      </label>
                      {selectedItem.type !== InteractionType.TRUE_FALSE && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextOpts = [
                              ...(selectedItem.options || []),
                              {
                                id: `opt-${Date.now()}`,
                                text: `Phương án ${(selectedItem.options?.length || 0) + 1}`,
                                isCorrect: false,
                              },
                            ];
                            updateSelectedItem({ options: nextOpts });
                          }}
                          className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                        >
                          + Thêm phương án
                        </button>
                      )}
                    </div>
                    {(selectedItem.options || []).map((opt, idx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          type={selectedItem.type === InteractionType.MULTI_SELECT ? 'checkbox' : 'radio'}
                          name={`correct-${selectedItem.id}`}
                          checked={opt.isCorrect}
                          onChange={() => {
                            const updated = (selectedItem.options || []).map((o) => {
                              if (selectedItem.type === InteractionType.MULTI_SELECT) {
                                return o.id === opt.id ? { ...o, isCorrect: !o.isCorrect } : o;
                              }
                              return { ...o, isCorrect: o.id === opt.id };
                            });
                            updateSelectedItem({ options: updated });
                          }}
                          className="cursor-pointer"
                        />
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => {
                            const updated = (selectedItem.options || []).map((o) =>
                              o.id === opt.id ? { ...o, text: e.target.value } : o
                            );
                            updateSelectedItem({ options: updated });
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900"
                        />
                        {selectedItem.type !== InteractionType.TRUE_FALSE &&
                          (selectedItem.options?.length || 0) > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                updateSelectedItem({
                                  options: (selectedItem.options || []).filter((_, i) => i !== idx),
                                });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                )}

                {(selectedItem.type === InteractionType.FILL_BLANK ||
                  selectedItem.type === InteractionType.DRAG_TEXT) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-semibold text-slate-700">
                        Cách làm bài của học viên:
                      </span>
                      <div
                        role="group"
                        aria-label="Kiểu điền từ"
                        className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedItem({ type: InteractionType.DRAG_TEXT })
                          }
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                            selectedItem.type === InteractionType.DRAG_TEXT
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Kéo / Chọn từ có sẵn
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedItem({ type: InteractionType.FILL_BLANK })
                          }
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                            selectedItem.type === InteractionType.FILL_BLANK
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Tự gõ bàn phím
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Câu bài tập (đặt từ cần điền trong dấu sao <code className="font-mono">*từ khóa*</code>)
                      </label>
                      <textarea
                        rows={3}
                        value={selectedItem.blankSentence || ''}
                        onChange={(e) => updateSelectedItem({ blankSentence: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono text-slate-900"
                      />
                    </div>

                    {selectedItem.type === InteractionType.DRAG_TEXT && (
                      <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200 space-y-2">
                        <label className="block text-xs font-semibold text-sky-950">
                          Từ gây nhiễu thêm vào kho từ (tùy chọn, cách nhau bằng dấu phẩy)
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Nhân sự (HR), Tệp văn bản, Số điện thoại"
                          value={(selectedItem.distractorWords || []).join(', ')}
                          onChange={(e) =>
                            updateSelectedItem({
                              distractorWords: e.target.value
                                .split(',')
                                .map((w) => w.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-sky-200 bg-white text-xs text-slate-900"
                        />
                        <div className="text-[11px] text-slate-600">
                          <strong>Kho từ học viên nhìn thấy:</strong>{' '}
                          {buildDragWordBank(selectedItem).join(' · ') || 'Chưa có từ khóa'}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        Đáp án đúng:{' '}
                        {parseFillBlankParts(selectedItem.blankSentence || '')
                          .filter((p) => p.type === 'blank')
                          .map((p) => p.value)
                          .join(' · ') || 'Chưa có'}
                      </span>
                      {selectedItem.type === InteractionType.FILL_BLANK && (
                        <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedItem.caseSensitive)}
                            onChange={(e) => updateSelectedItem({ caseSensitive: e.target.checked })}
                          />
                          <span>Phân biệt HOA/thường</span>
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {selectedItem.type === InteractionType.HOTSPOT && selectedItem.hotspot && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        Vùng mục tiêu (%) — Kéo trực tiếp trên khung video
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['x', 'y', 'width', 'height'] as const).map((field) => (
                        <div key={field}>
                          <label className="block text-[10px] text-slate-500 uppercase">{field}</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={selectedItem.hotspot![field]}
                            onChange={(e) =>
                              updateSelectedItem({
                                hotspot: {
                                  ...selectedItem.hotspot!,
                                  [field]: Math.max(0, Math.min(100, Number(e.target.value))),
                                },
                              })
                            }
                            className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono tabular-nums"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.type === InteractionType.ORDERING && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-600">
                        Thứ tự đúng từ trên xuống dưới
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedItem({
                            orderingItems: [
                              ...(selectedItem.orderingItems || []),
                              `Bước ${(selectedItem.orderingItems?.length || 0) + 1}`,
                            ],
                          })
                        }
                        className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                      >
                        + Thêm bước
                      </button>
                    </div>
                    {(selectedItem.orderingItems || []).map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-500 w-4">{idx + 1}.</span>
                        <input
                          type="text"
                          value={step}
                          onChange={(e) => {
                            const next = [...(selectedItem.orderingItems || [])];
                            next[idx] = e.target.value;
                            updateSelectedItem({ orderingItems: next });
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900"
                        />
                        {(selectedItem.orderingItems?.length || 0) > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedItem({
                                orderingItems: (selectedItem.orderingItems || []).filter(
                                  (_, i) => i !== idx
                                ),
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Question / Card Illustration Image */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Ảnh minh họa trong câu hỏi (tùy chọn)
                    </span>
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-sky-400 text-[11px] font-semibold text-slate-700 cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5 text-sky-600" />
                      <span>Tải ảnh lên</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQuestionImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <input
                    type="url"
                    placeholder="Hoặc dán link ảnh (https://...)"
                    value={selectedItem.imageUrl || ''}
                    onChange={(e) =>
                      updateSelectedItem({ imageUrl: e.target.value || undefined })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                  />
                  {selectedItem.imageUrl && (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <img
                        src={selectedItem.imageUrl}
                        alt="Xem trước ảnh minh họa"
                        referrerPolicy="no-referrer"
                        className="h-16 w-28 object-cover rounded-lg border border-slate-200 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => updateSelectedItem({ imageUrl: undefined })}
                        className="text-xs font-medium text-rose-600 hover:underline cursor-pointer"
                      >
                        Xóa ảnh
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Giải thích phản hồi sau khi trả lời
                  </label>
                  <textarea
                    rows={2}
                    value={selectedItem.explanation}
                    onChange={(e) => updateSelectedItem({ explanation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>

                {selectedItem.type !== InteractionType.INFO && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Giới hạn số lần làm lại câu hỏi
                      </label>
                      <select
                        value={selectedItem.maxAttempts ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateSelectedItem({ maxAttempts: val > 0 ? val : null });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                      >
                        <option value={0}>Không giới hạn số lần làm lại</option>
                        <option value={1}>1 lần duy nhất (không cho làm lại)</option>
                        <option value={2}>Tối đa 2 lần thử</option>
                        <option value={3}>Tối đa 3 lần thử</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Nếu sai → Gợi ý quay lại (giây)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={duration}
                          placeholder="Không"
                          value={selectedItem.branchOnWrong ?? ''}
                          onChange={(e) =>
                            updateSelectedItem({
                              branchOnWrong: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Nếu đúng → Nhảy tới (giây)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={duration}
                          placeholder="Không"
                          value={selectedItem.branchOnCorrect ?? ''}
                          onChange={(e) =>
                            updateSelectedItem({
                              branchOnCorrect: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500">
                Chọn một điểm tương tác trên thanh thời gian hoặc nhấn nút thêm tương tác ở bên trái.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Video Source Configuration */}
        {inspectorTab === 'video' && (
          <div className="p-5 space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-800">1. Tải video từ máy tính (đóng gói kèm vào SCORM / HTML)</div>
              <p className="text-xs text-slate-500">
                Hỗ trợ MP4, WebM. Video được lưu cục bộ trên trình duyệt và tự động đóng gói khi xuất bài giảng.
              </p>
              <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-sky-50 hover:border-sky-400 text-xs font-semibold text-slate-700 cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-sky-600" />
                <span>Chọn tệp video (.mp4, .webm)</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  onChange={handleVideoFileUpload}
                  className="hidden"
                />
              </label>
              {course.videoSourceType === 'upload' && course.uploadedVideoName && (
                <div className="text-xs text-emerald-700 font-medium">
                  Đang sử dụng tệp: {course.uploadedVideoName} ({formatTime(course.duration)})
                </div>
              )}
              {uploadStatus && <div className="text-xs text-sky-700">{uploadStatus}</div>}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-800">2. Hoặc dán link YouTube / Video MP4 trực tiếp</div>
              <p className="text-xs text-slate-500">
                Hỗ trợ link YouTube (<code className="font-mono">youtube.com/watch?v=...</code>, <code className="font-mono">youtu.be/...</code>) hoặc link file <code className="font-mono">.mp4</code> trực tiếp.
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=... hoặc https://.../video.mp4"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleApplyVideoUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Áp dụng
                </button>
              </div>
              {urlFeedback && (
                <div className="text-xs text-sky-700 font-medium">{urlFeedback}</div>
              )}
            </div>

            {course.builtInScenes && course.builtInScenes.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-800">3. Quay lại bài giảng tích hợp sẵn</div>
                <button
                  type="button"
                  onClick={() =>
                    commitCourseEdit({
                      ...course,
                      videoSourceType: 'builtin',
                      duration: 60,
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Sử dụng video bài giảng mẫu tích hợp
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Subtitles (.VTT / .SRT) & Default Toggle */}
        {inspectorTab === 'subtitles' && (
          <div className="p-5 space-y-4 max-h-[760px] overflow-y-auto">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Phụ đề mặc định khi mở bài học
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Học viên vẫn có thể bật hoặc tắt bất cứ lúc nào trên thanh điều khiển video.
                </div>
              </div>
              <div
                role="group"
                aria-label="Phụ đề mặc định"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    commitCourseEdit({ ...course, subtitlesEnabledByDefault: true })
                  }
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    (course.subtitlesEnabledByDefault ?? true)
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bật
                </button>
                <button
                  type="button"
                  onClick={() =>
                    commitCourseEdit({ ...course, subtitlesEnabledByDefault: false })
                  }
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    course.subtitlesEnabledByDefault === false
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tắt
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Nhập tệp phụ đề (.vtt hoặc .srt)
                </span>
                {(course.subtitles?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      commitCourseEdit({
                        ...course,
                        subtitles: [],
                        subtitleFileName: undefined,
                      })
                    }
                    className="text-xs font-medium text-rose-600 hover:underline cursor-pointer"
                  >
                    Xóa toàn bộ phụ đề
                  </button>
                )}
              </div>
              <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-sky-50 hover:border-sky-400 text-xs font-semibold text-slate-700 cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-sky-600" />
                <span>Chọn tệp .vtt hoặc .srt từ máy tính</span>
                <input
                  type="file"
                  accept=".vtt,.srt,text/vtt"
                  onChange={handleSubtitleFileUpload}
                  className="hidden"
                />
              </label>
              {course.subtitleFileName && (
                <div className="text-[11px] text-emerald-700 font-medium">
                  Tệp hiện tại: {course.subtitleFileName} ({course.subtitles?.length || 0} dòng)
                </div>
              )}
              {subtitleFeedback && (
                <div className="text-xs text-sky-700 font-medium">{subtitleFeedback}</div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Danh sách dòng phụ đề ({course.subtitles?.length || 0})
                </span>
                <button
                  type="button"
                  onClick={handleAddSubtitleCue}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm tại {formatTimePrecise(currentTime)}</span>
                </button>
              </div>

              {(course.subtitles?.length || 0) === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                  Chưa có dòng phụ đề nào. Hãy tải tệp .vtt/.srt hoặc nhấn nút Thêm ở trên.
                </div>
              ) : (
                <div className="space-y-2">
                  {(course.subtitles || []).map((cue) => (
                    <div
                      key={cue.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => seekTo(cue.startTime)}
                            title="Nhảy tới thời điểm phụ đề này"
                            className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-mono font-semibold hover:bg-sky-200 cursor-pointer"
                          >
                            {formatTime(cue.startTime)}
                          </button>
                          <span className="text-slate-400">Từ</span>
                          <input
                            type="number"
                            min={0}
                            max={duration}
                            step={0.5}
                            value={cue.startTime}
                            onChange={(e) =>
                              handleUpdateSubtitleCue(cue.id, {
                                startTime: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-16 px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono text-xs tabular-nums"
                          />
                          <span className="text-slate-400">đến</span>
                          <input
                            type="number"
                            min={0}
                            max={duration}
                            step={0.5}
                            value={cue.endTime}
                            onChange={(e) =>
                              handleUpdateSubtitleCue(cue.id, {
                                endTime: Math.max(cue.startTime + 0.5, Number(e.target.value)),
                              })
                            }
                            className="w-16 px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono text-xs tabular-nums"
                          />
                          <span className="text-slate-400">s</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubtitleCue(cue.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Xóa dòng phụ đề"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={cue.text}
                        onChange={(e) =>
                          handleUpdateSubtitleCue(cue.id, { text: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Course & SCORM Settings */}
        {inspectorTab === 'settings' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tên khóa học</label>
              <input
                type="text"
                value={course.title}
                onChange={(e) => commitCourseEdit({ ...course, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mô tả ngắn</label>
              <textarea
                rows={3}
                value={course.description}
                onChange={(e) => commitCourseEdit({ ...course, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Điểm đạt chuẩn (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={course.passingScore}
                  onChange={(e) =>
                    commitCourseEdit({
                      ...course,
                      passingScore: Math.max(0, Math.min(100, Number(e.target.value))),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Chuẩn SCORM mặc định
                </label>
                <select
                  value={course.defaultScormVersion}
                  onChange={(e) =>
                    commitCourseEdit({
                      ...course,
                      defaultScormVersion: e.target.value as ScormVersion,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="1.2">SCORM 1.2</option>
                  <option value="2004">SCORM 2004 (4th Ed)</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={course.preventSkipping}
                  onChange={(e) =>
                    commitCourseEdit({ ...course, preventSkipping: e.target.checked })
                  }
                  className="mt-0.5 rounded border-slate-300 text-sky-600"
                />
                <span>
                  <strong className="block text-slate-900">Chặn tua qua câu hỏi bắt buộc</strong>
                  Học viên phải trả lời xong điểm tương tác trước khi tua sang phần tiếp theo (chuẩn kiểm soát đào tạo LMS).
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
