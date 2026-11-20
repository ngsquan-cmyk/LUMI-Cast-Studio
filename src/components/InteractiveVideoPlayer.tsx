import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Captions,
  CheckCircle2,
  Lock,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { CourseProject, InteractionItem, InteractionType, LearnerAnswer } from '../types/course';
import { formatTime, getInteractionTypeLabel, getVideoBlob } from '../utils/storage';
import { BuiltInVideoCanvas } from './BuiltInVideoCanvas';
import { InteractionOverlay } from './InteractionOverlay';
import { YouTubePlayerEmbed, YouTubePlayerHandle } from './YouTubePlayerEmbed';

interface InteractiveVideoPlayerProps {
  course: CourseProject;
  onScormUpdate?: (payload: {
    scorePercent: number;
    earnedPoints: number;
    maxPoints: number;
    passed: boolean;
    completed: boolean;
    answers: Record<string, LearnerAnswer>;
    currentTime: number;
  }) => void;
}

export const InteractiveVideoPlayer: React.FC<InteractiveVideoPlayerProps> = ({
  course,
  onScormUpdate,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<YouTubePlayerHandle>(null);

  const [objectVideoUrl, setObjectVideoUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(course.duration || 60);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, LearnerAnswer>>({});
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(null);
  const [isCardExpanded, setIsCardExpanded] = useState(false);
  const [triggeredIds, setTriggeredIds] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const [skipWarning, setSkipWarning] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(
    course.subtitlesEnabledByDefault ?? true
  );

  // Load uploaded Blob URL from IndexedDB if needed
  useEffect(() => {
    let revokedUrl = '';
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(course.duration || 60);
    setAnswers({});
    setActiveInteractionId(null);
    setIsCardExpanded(false);
    setTriggeredIds(new Set());
    setShowSummary(false);
    setSubtitlesEnabled(course.subtitlesEnabledByDefault ?? true);

    if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
      getVideoBlob(course.uploadedVideoKey).then((blob) => {
        if (blob) {
          revokedUrl = URL.createObjectURL(blob);
          setObjectVideoUrl(revokedUrl);
        } else {
          setObjectVideoUrl('');
        }
      });
    } else {
      setObjectVideoUrl('');
    }

    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [course.id, course.videoSourceType, course.uploadedVideoKey, course.duration]);

  const sortedInteractions = useMemo(
    () => [...course.interactions].sort((a, b) => a.timestamp - b.timestamp),
    [course.interactions]
  );

  const activeInteraction: InteractionItem | undefined = useMemo(
    () => sortedInteractions.find((item) => item.id === activeInteractionId),
    [sortedInteractions, activeInteractionId]
  );

  const activeSubtitle = useMemo(() => {
    if (!subtitlesEnabled || !course.subtitles?.length) return undefined;
    return course.subtitles.find(
      (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime
    );
  }, [subtitlesEnabled, course.subtitles, currentTime]);

  const prevTimeRef = useRef(0);

  // Built-in virtual video timer
  useEffect(() => {
    if (course.videoSourceType !== 'builtin' || !isPlaying) return;
    let lastTick = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = ((now - lastTick) / 1000) * playbackRate;
      lastTick = now;
      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= duration) {
          setIsPlaying(false);
          setShowSummary(true);
          return duration;
        }
        return next;
      });
    }, 60);

    return () => window.clearInterval(interval);
  }, [course.videoSourceType, isPlaying, playbackRate, duration]);

  // Trigger interactions via deterministic range-crossing detection (prevTime < timestamp <= currentTime)
  useEffect(() => {
    const prevT = prevTimeRef.current;
    prevTimeRef.current = currentTime;

    if (!isPlaying) return;
    for (const item of sortedInteractions) {
      const crossed =
        (prevT < item.timestamp && currentTime >= item.timestamp) ||
        (currentTime >= item.timestamp && currentTime <= item.timestamp + 0.6);

      if (!triggeredIds.has(item.id) && crossed) {
        setTriggeredIds((prev) => new Set(prev).add(item.id));
        setActiveInteractionId(item.id);
        setIsCardExpanded(item.displayMode === 'poster' || item.type === InteractionType.HOTSPOT);
        if (item.pauseVideo) {
          pauseMedia();
        }
        break;
      }
    }

    // Auto-hide unexpanded button pin after its duration window
    if (activeInteraction && !isCardExpanded) {
      if (currentTime > activeInteraction.timestamp + activeInteraction.duration) {
        setActiveInteractionId(null);
      }
    }
  }, [currentTime, isPlaying, sortedInteractions, triggeredIds, activeInteraction, isCardExpanded]);

  // Compute live score metrics
  const scoreSummary = useMemo(() => {
    const gradable = sortedInteractions.filter((i) => i.type !== InteractionType.INFO);
    const maxPoints = gradable.reduce((sum, i) => sum + i.points, 0);
    const earnedPoints = gradable.reduce((sum, i) => sum + (answers[i.id]?.earnedPoints || 0), 0);
    const scorePercent = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 100;
    const answeredCount = gradable.filter((i) => Boolean(answers[i.id])).length;
    const allGradableAnswered = answeredCount === gradable.length;
    const passed = scorePercent >= course.passingScore && (allGradableAnswered || gradable.length === 0);
    const completed = showSummary || (currentTime >= duration - 0.5 && allGradableAnswered);
    return {
      maxPoints,
      earnedPoints,
      scorePercent,
      answeredCount,
      totalGradable: gradable.length,
      passed,
      completed,
    };
  }, [sortedInteractions, answers, course.passingScore, showSummary, currentTime, duration]);

  useEffect(() => {
    onScormUpdate?.({
      scorePercent: scoreSummary.scorePercent,
      earnedPoints: scoreSummary.earnedPoints,
      maxPoints: scoreSummary.maxPoints,
      passed: scoreSummary.passed,
      completed: scoreSummary.completed,
      answers,
      currentTime,
    });
  }, [scoreSummary, answers, currentTime, onScormUpdate]);

  const playMedia = () => {
    if (currentTime >= duration - 0.2) {
      seekTo(0);
    }
    setShowSummary(false);
    if (course.videoSourceType === 'youtube') {
      ytRef.current?.setPlaybackRate(playbackRate);
      ytRef.current?.play();
    } else if (course.videoSourceType !== 'builtin' && videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(true);
  };

  const pauseMedia = () => {
    if (course.videoSourceType === 'youtube') {
      ytRef.current?.pause();
    } else if (course.videoSourceType !== 'builtin' && videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) pauseMedia();
    else playMedia();
  };

  const seekTo = (targetSec: number, bypassSkipGuard = false) => {
    const clamped = Math.max(0, Math.min(duration, targetSec));

    // Prevent forward seeking past unanswered checkpoints if enabled
    if (course.preventSkipping && !bypassSkipGuard && clamped > currentTime) {
      const blockingItem = sortedInteractions.find(
        (item) =>
          item.type !== InteractionType.INFO &&
          item.timestamp > currentTime + 0.5 &&
          item.timestamp < clamped &&
          !answers[item.id]
      );
      if (blockingItem) {
        setSkipWarning(`Vui lòng hoàn thành tương tác "${blockingItem.title}" tại ${formatTime(blockingItem.timestamp)} trước khi tua tiếp.`);
        window.setTimeout(() => setSkipWarning(null), 3500);
        return;
      }
    }

    prevTimeRef.current = clamped;
    setCurrentTime(clamped);
    if (course.videoSourceType === 'youtube') {
      ytRef.current?.seekTo(clamped);
    } else if (course.videoSourceType !== 'builtin' && videoRef.current) {
      videoRef.current.currentTime = clamped;
    }

    // Reset trigger state for interactions ahead of seek target so learners can re-trigger if rewinding
    setTriggeredIds((prev) => {
      const next = new Set<string>();
      sortedInteractions.forEach((item) => {
        if (item.timestamp < clamped - 0.5 && prev.has(item.id)) {
          next.add(item.id);
        }
      });
      return next;
    });
  };

  const handleOpenCheckpoint = (item: InteractionItem) => {
    pauseMedia();
    seekTo(item.timestamp, true);
    setActiveInteractionId(item.id);
    setIsCardExpanded(true);
    setShowSummary(false);
  };

  const handleResetCourse = () => {
    pauseMedia();
    setAnswers({});
    setTriggeredIds(new Set());
    setActiveInteractionId(null);
    setIsCardExpanded(false);
    setShowSummary(false);
    seekTo(0, true);
  };

  const handleFullscreen = () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      stageRef.current.requestFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) pauseMedia();
        else playMedia();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekTo(currentTime - 5, true);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekTo(currentTime + 5, false);
      } else if (e.key === 'f' || e.key === 'F') {
        handleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        if (course.videoSourceType === 'youtube') ytRef.current?.setMuted(nextMuted);
      } else if (e.key === 'c' || e.key === 'C') {
        setSubtitlesEnabled((s) => !s);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, currentTime, isMuted, course.videoSourceType]);

  const resolvedVideoSrc =
    course.videoSourceType === 'upload'
      ? objectVideoUrl
      : course.videoSourceType === 'url'
      ? course.videoUrl
      : '';

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Main 16:9 Cinema Stage */}
      <div
        ref={stageRef}
        className="relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-200 shadow-sm"
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
            onReady={(dur) => setDuration(dur)}
            onTimeUpdate={(sec) => setCurrentTime(sec)}
            onPlayStateChange={(playing) => setIsPlaying(playing)}
            onEnded={() => {
              setIsPlaying(false);
              setShowSummary(true);
            }}
          />
        ) : resolvedVideoSrc ? (
          <video
            ref={videoRef}
            src={resolvedVideoSrc}
            muted={isMuted}
            playsInline
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              if (vid.duration && Number.isFinite(vid.duration)) {
                setDuration(vid.duration);
              }
            }}
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime);
            }}
            onEnded={() => {
              setIsPlaying(false);
              setShowSummary(true);
            }}
            className="w-full h-full object-contain bg-black"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <p className="text-sm font-medium text-slate-200">Chưa có tệp video hợp lệ cho khóa học này.</p>
            <p className="text-xs text-slate-400 mt-1">
              Chuyển sang tab Trình biên tập để tải video MP4/WebM hoặc dùng bài giảng mẫu tích hợp.
            </p>
          </div>
        )}

        {/* Click-to-play center overlay when paused at 00:00 with no active modal */}
        {!isPlaying && currentTime === 0 && !activeInteraction && !showSummary && (
          <button
            type="button"
            onClick={playMedia}
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 hover:bg-slate-950/20 transition-colors cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
              <Play className="w-7 h-7 ml-1 fill-current" />
            </div>
          </button>
        )}

        {/* Prevent-skipping polite warning */}
        {skipWarning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-slate-900/95 border border-amber-400/50 text-amber-200 text-xs font-medium flex items-center gap-2 shadow-lg">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{skipWarning}</span>
          </div>
        )}

        {/* Synchronized Subtitle Caption Overlay */}
        {activeSubtitle && !isCardExpanded && !showSummary && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 max-w-[88%] px-4 py-2 rounded-lg bg-slate-950/85 border border-white/10 text-white text-xs sm:text-sm font-medium text-center leading-relaxed shadow-lg pointer-events-none">
            {activeSubtitle.text}
          </div>
        )}

        {/* Active Interactive Overlay */}
        {activeInteraction && !showSummary && (
          <InteractionOverlay
            interaction={activeInteraction}
            existingAnswer={answers[activeInteraction.id]}
            isExpanded={isCardExpanded}
            onExpand={() => {
              pauseMedia();
              setIsCardExpanded(true);
            }}
            onCloseAndResume={() => {
              setActiveInteractionId(null);
              setIsCardExpanded(false);
              playMedia();
            }}
            onSubmitAnswer={(ans) => {
              setAnswers((prev) => ({ ...prev, [activeInteraction.id]: ans }));
            }}
            onJumpToTimestamp={(sec) => {
              setActiveInteractionId(null);
              setIsCardExpanded(false);
              seekTo(sec, true);
              playMedia();
            }}
          />
        )}

        {/* Summary Screen Overlay */}
        {showSummary && (
          <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
            <div className="w-full max-w-lg max-h-full bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-500">Tổng kết hoàn thành bài học</div>
                  <h3 className="text-sm sm:text-lg font-bold text-slate-900 mt-0.5 truncate">{course.title}</h3>
                </div>
                <div
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 ${
                    scoreSummary.passed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>{scoreSummary.passed ? 'Đạt chuẩn' : 'Chưa đạt'}</span>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Điểm số</div>
                    <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                      {scoreSummary.scorePercent}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Tổng điểm</div>
                    <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                      {scoreSummary.earnedPoints}/{scoreSummary.maxPoints}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Chuẩn đạt</div>
                    <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                      {course.passingScore}%
                    </div>
                  </div>
                </div>

                {scoreSummary.answeredCount < scoreSummary.totalGradable && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    Bạn còn <strong>{scoreSummary.totalGradable - scoreSummary.answeredCount}</strong> câu hỏi bắt buộc chưa hoàn thành. Nhấn vào từng mục bên dưới để làm nốt.
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Chi tiết các điểm tương tác ({scoreSummary.answeredCount}/{scoreSummary.totalGradable} câu tính điểm)
                  </div>
                  {sortedInteractions.map((item) => {
                    const ans = answers[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleOpenCheckpoint(item)}
                        className="w-full text-left px-3.5 py-2.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">{item.title}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono tabular-nums">{formatTime(item.timestamp)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{getInteractionTypeLabel(item.type)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium">
                          {item.type === InteractionType.INFO ? (
                            <span className="text-slate-500">Thông tin</span>
                          ) : ans ? (
                            ans.isCorrect ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="font-mono tabular-nums">+{ans.earnedPoints}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-600">
                                <XCircle className="w-4 h-4" />
                                <span className="font-mono tabular-nums">0/{ans.maxPoints}</span>
                              </span>
                            )
                          ) : (
                            <span className="text-amber-700">Chưa làm</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-2.5 sm:px-6 sm:py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleResetCourse}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Học lại từ đầu
                </button>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 cursor-pointer"
                >
                  Đóng bảng điểm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Lumi-Style Control Bar with Interactive Checkpoint Markers */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5">
        {/* Seekbar + Checkpoint Diamonds */}
        <div className="relative h-7 flex items-center">
          <div className="w-full h-2 rounded-full bg-slate-200 relative overflow-visible">
            <div
              className="h-full rounded-full bg-sky-600 transition-all duration-100"
              style={{ width: `${progressPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 60}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Thanh thời gian video"
              className="studio-range absolute inset-0 w-full h-full opacity-0 z-10"
            />

            {/* Checkpoint markers along timeline */}
            {sortedInteractions.map((item) => {
              const pct = duration > 0 ? Math.min(98, Math.max(2, (item.timestamp / duration) * 100)) : 0;
              const ans = answers[item.id];
              const isActive = activeInteractionId === item.id;
              return (
                <div
                  key={item.id}
                  style={{ left: `${pct}%` }}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
                  onMouseEnter={() => setHoveredPinId(item.id)}
                  onMouseLeave={() => setHoveredPinId(null)}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenCheckpoint(item)}
                    aria-label={`${item.title} tại ${formatTime(item.timestamp)}`}
                    className={`w-3.5 h-3.5 rotate-45 border-2 border-white shadow transition-transform hover:scale-125 cursor-pointer ${
                      ans
                        ? ans.isCorrect
                          ? 'bg-emerald-500'
                          : 'bg-rose-500'
                        : isActive
                        ? 'bg-amber-500 scale-125'
                        : 'bg-sky-600'
                    }`}
                  />
                  {hoveredPinId === item.id && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] whitespace-nowrap shadow-lg pointer-events-none">
                      <span className="font-mono text-sky-300 mr-1.5">{formatTime(item.timestamp)}</span>
                      <span className="font-medium">{item.title}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Transport & Utility Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Tạm dừng' : 'Phát video'}</span>
            </button>

            <span className="font-mono text-xs tabular-nums text-slate-600 px-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {course.videoSourceType !== 'builtin' && (
              <button
                type="button"
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (course.videoSourceType === 'youtube') ytRef.current?.setMuted(nextMuted);
                }}
                aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Thẻ tùy chọn Bật / Tắt phụ đề */}
            {(course.subtitles?.length || 0) > 0 && (
              <div
                role="group"
                aria-label="Tùy chọn phụ đề"
                className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200"
              >
                <span className="inline-flex items-center gap-1 pl-2 pr-1.5 text-[11px] font-medium text-slate-600">
                  <Captions className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Phụ đề:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSubtitlesEnabled(true)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    subtitlesEnabled
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bật
                </button>
                <button
                  type="button"
                  onClick={() => setSubtitlesEnabled(false)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    !subtitlesEnabled
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tắt
                </button>
              </div>
            )}

            <select
              aria-label="Tốc độ phát"
              value={playbackRate}
              onChange={(e) => {
                const rate = Number(e.target.value);
                setPlaybackRate(rate);
                if (course.videoSourceType === 'youtube') ytRef.current?.setPlaybackRate(rate);
                else if (videoRef.current) videoRef.current.playbackRate = rate;
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-700 cursor-pointer"
            >
              <option value={0.75}>0.75x</option>
              <option value={1}>1.0x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
            </select>

            <button
              type="button"
              onClick={() => {
                pauseMedia();
                setShowSummary((s) => !s);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono tabular-nums">
                Bảng điểm ({scoreSummary.answeredCount}/{scoreSummary.totalGradable})
              </span>
            </button>

            <button
              type="button"
              onClick={handleFullscreen}
              aria-label="Toàn màn hình"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Checkpoint Strip below player for quick navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h4 className="text-xs font-semibold text-slate-700">
            Danh sách điểm tương tác trong bài ({sortedInteractions.length})
          </h4>
          {course.preventSkipping && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Lock className="w-3 h-3" />
              <span>Bắt buộc trả lời theo thứ tự</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sortedInteractions.map((item) => {
            const ans = answers[item.id];
            const isCurrent = activeInteractionId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenCheckpoint(item)}
                className={`text-left p-3 rounded-lg border transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                  isCurrent
                    ? 'border-sky-600 bg-sky-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">{item.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span className="font-mono tabular-nums text-sky-700 font-medium">
                      {formatTime(item.timestamp)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{getInteractionTypeLabel(item.type)}</span>
                  </div>
                </div>
                <div className="shrink-0 mt-0.5">
                  {ans ? (
                    ans.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    )
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-300 block mt-1.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
