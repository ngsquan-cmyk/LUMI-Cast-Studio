import React, { useState } from 'react';
import { Download, Edit3, FolderInput, Play, Plus, Trash2, Upload } from 'lucide-react';
import { CourseProject, InteractionType } from '../types/course';
import { extractYouTubeId, formatTime, saveVideoBlob } from '../utils/storage';

interface CourseLibraryViewProps {
  courses: CourseProject[];
  activeCourseId: string;
  onSelectAndPlay: (id: string) => void;
  onSelectAndEdit: (id: string) => void;
  onSelectAndExport: (id: string) => void;
  onCreateCourse: (course: CourseProject) => void;
  onDeleteCourse: (id: string) => void;
}

export const CourseLibraryView: React.FC<CourseLibraryViewProps> = ({
  courses,
  activeCourseId,
  onSelectAndPlay,
  onSelectAndEdit,
  onSelectAndExport,
  onCreateCourse,
  onDeleteCourse,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Đào tạo nội bộ');
  const [newDesc, setNewDesc] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsCreating(true);

    const id = `course-${Date.now()}`;
    let videoSourceType: CourseProject['videoSourceType'] = 'builtin';
    let uploadedVideoKey: string | undefined;
    let uploadedVideoName: string | undefined;
    let uploadedVideoMime: string | undefined;
    let duration = 60;

    let youtubeId: string | undefined;

    if (uploadedFile) {
      videoSourceType = 'upload';
      uploadedVideoKey = `vid-${id}`;
      uploadedVideoName = uploadedFile.name;
      uploadedVideoMime = uploadedFile.type || 'video/mp4';
      await saveVideoBlob(uploadedVideoKey, uploadedFile);

      const probeUrl = URL.createObjectURL(uploadedFile);
      duration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = probeUrl;
        v.onloadedmetadata = () => {
          URL.revokeObjectURL(probeUrl);
          resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : 60);
        };
        v.onerror = () => {
          URL.revokeObjectURL(probeUrl);
          resolve(60);
        };
      });
    } else if (newVideoUrl.trim()) {
      const detectedYt = extractYouTubeId(newVideoUrl.trim());
      if (detectedYt) {
        videoSourceType = 'youtube';
        youtubeId = detectedYt;
      } else {
        videoSourceType = 'url';
      }
    }

    const newCourse: CourseProject = {
      id,
      title: newTitle.trim(),
      description:
        newDesc.trim() ||
        'Khóa học video tương tác với các điểm dừng kiểm tra kiến thức và đóng gói chuẩn SCORM.',
      category: newCategory.trim() || 'Đào tạo',
      coverImage: '/src/assets/images/studio_training_cover_1795148197254.jpg',
      videoSourceType,
      videoUrl: newVideoUrl.trim(),
      youtubeId,
      uploadedVideoKey,
      uploadedVideoName,
      uploadedVideoMime,
      duration,
      passingScore: 80,
      preventSkipping: false,
      defaultScormVersion: '1.2',
      updatedAt: new Date().toISOString().slice(0, 10),
      builtInScenes:
        videoSourceType === 'builtin'
          ? [
              {
                startTime: 0,
                endTime: 30,
                title: newTitle.trim(),
                subtitle: 'Phần mở đầu & Nội dung trọng tâm',
                bulletPoints: [
                  'Giới thiệu mục tiêu bài giảng và tiêu chuẩn đánh giá.',
                  'Người học theo dõi video và trả lời câu hỏi tại các mốc thời gian.',
                ],
                imageUrl: '/src/assets/images/studio_training_cover_1795148197254.jpg',
                accentColor: '#0284c7',
              },
              {
                startTime: 30,
                endTime: 60,
                title: 'Tổng hợp & Thực hành tình huống',
                subtitle: 'Áp dụng kiến thức vào quy trình thực tế',
                bulletPoints: [
                  'Hoàn thành toàn bộ điểm tương tác để ghi nhận điểm số SCORM.',
                  'Xem lại bảng tổng kết kết quả ở cuối bài học.',
                ],
                imageUrl: '/src/assets/images/studio_training_cover_1795148197254.jpg',
                accentColor: '#059669',
              },
            ]
          : undefined,
      interactions: [
        {
          id: `${id}-q1`,
          type: InteractionType.MULTIPLE_CHOICE,
          timestamp: Math.min(10, Math.max(3, Math.floor(duration * 0.25))),
          duration: 6,
          title: 'Câu hỏi kiểm tra đầu giờ',
          prompt: 'Mục tiêu chính của bài đào tạo này là gì?',
          displayMode: 'poster',
          pauseVideo: true,
          points: 50,
          position: { x: 50, y: 50 },
          options: [
            { id: 'o1', text: 'Nắm vững quy trình và áp dụng đúng tiêu chuẩn', isCorrect: true },
            { id: 'o2', text: 'Chỉ xem lướt qua không cần thực hành', isCorrect: false },
          ],
          explanation: 'Hoàn thành chính xác các câu hỏi giúp củng cố kiến thức thực tế.',
        },
      ],
    };

    onCreateCourse(newCourse);
    setNewTitle('');
    setNewDesc('');
    setNewVideoUrl('');
    setUploadedFile(null);
    setShowCreateForm(false);
    setIsCreating(false);
  };

  return (
    <div className="space-y-8">
      {/* Intro Hero Banner */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="text-xs font-medium text-sky-700">
              Biên tập Video Tương tác · Đóng gói SCORM 1.2 &amp; 2004
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight text-balance">
              Biến video đào tạo thành bài giảng tương tác chuẩn E-Learning
            </h1>
            <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl">
              Gắn trắc nghiệm, điểm nóng Hotspot, điền chỗ trống và sắp xếp quy trình ngay trên dòng thời gian video như Lumi. Kiểm tra trực tiếp trên trình giả lập LMS và xuất gói SCORM (.zip) một chạm.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateForm((s) => !s)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo khóa học video mới</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectAndPlay(activeCourseId)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4 text-sky-600" />
              <span>Học thử khóa đang chọn</span>
            </button>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
              <FolderInput className="w-4 h-4 text-slate-500" />
              <span>Nhập dự án (.json)</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const parsed = JSON.parse(text) as CourseProject;
                    if (parsed && parsed.title && Array.isArray(parsed.interactions)) {
                      onCreateCourse({
                        ...parsed,
                        id: `course-${Date.now()}`,
                        videoSourceType:
                          parsed.videoSourceType === 'upload' ? 'builtin' : parsed.videoSourceType,
                        updatedAt: new Date().toISOString().slice(0, 10),
                      });
                    }
                  } catch {
                    // ignore invalid JSON cleanly
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>
        <div className="lg:col-span-5 relative min-h-[220px] bg-slate-900">
          <img
            src="/src/assets/images/studio_training_cover_1795148197254.jpg"
            alt="Không gian thiết kế bài giảng video tương tác"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover lg:absolute lg:inset-0"
          />
        </div>
      </section>

      {/* Inline Create Course Panel */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white border border-sky-300 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Tạo bài giảng video tương tác mới</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Hủy bỏ
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên khóa học *
              </label>
              <input
                type="text"
                required
                placeholder="Ví dụ: Quy trình vận hành xe nâng an toàn"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Chủ đề</label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả ngắn</label>
            <input
              type="text"
              placeholder="Mục tiêu đào tạo và đối tượng học viên..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tải video MP4/WebM từ máy (tùy chọn)
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-sky-50 text-xs text-slate-700 cursor-pointer">
                <Upload className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="truncate">
                  {uploadedFile ? uploadedFile.name : 'Chọn tệp video (.mp4, .webm)...'}
                </span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hoặc dán Video URL (tùy chọn)
              </label>
              <input
                type="url"
                placeholder="Để trống để dùng video bài giảng mẫu"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 cursor-pointer"
            >
              {isCreating ? 'Đang khởi tạo...' : 'Tạo & Mở trình biên tập'}
            </button>
          </div>
        </form>
      )}

      {/* Course Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Thư viện khóa học tương tác ({courses.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const isSelected = course.id === activeCourseId;
            return (
              <article
                key={course.id}
                className={`bg-white rounded-xl border overflow-hidden flex flex-col justify-between transition-colors ${
                  isSelected ? 'border-sky-600' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="relative aspect-video bg-slate-900 overflow-hidden">
                    <img
                      src={course.coverImage}
                      alt={course.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-2.5">
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span className="font-medium text-sky-700">{course.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatTime(course.duration)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{course.interactions.length} tương tác</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {course.description}
                    </p>
                    <div className="text-[11px] text-slate-500 pt-1">
                      Chuẩn đạt {course.passingScore}% · SCORM {course.defaultScormVersion}
                      {course.videoSourceType === 'upload' && course.uploadedVideoName
                        ? ` · Tệp ${course.uploadedVideoName}`
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectAndPlay(course.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3 h-3" />
                      Học thử
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectAndEdit(course.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      <Edit3 className="w-3 h-3" />
                      Biên tập
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectAndExport(course.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-sky-700 text-xs font-medium hover:bg-sky-50 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3 h-3" />
                      SCORM
                    </button>
                  </div>

                  {courses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteCourse(course.id)}
                      aria-label={`Xóa khóa học ${course.title}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
