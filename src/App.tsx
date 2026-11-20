import { useEffect, useMemo, useState } from 'react';
import { AuthoringStudio } from './components/AuthoringStudio';
import { CourseLibraryView } from './components/CourseLibraryView';
import { InteractiveVideoPlayer } from './components/InteractiveVideoPlayer';
import { LmsSimulatorPanel } from './components/LmsSimulatorPanel';
import { ScormExportModal } from './components/ScormExportModal';
import { CourseProject } from './types/course';
import { deleteVideoBlob, loadStoredCourses, saveStoredCourses } from './utils/storage';

type AppView = 'library' | 'play' | 'author' | 'lms';

export default function App() {
  const [courses, setCourses] = useState<CourseProject[]>(() => loadStoredCourses());
  const [activeCourseId, setActiveCourseId] = useState<string>(() => courses[0]?.id || '');
  const [view, setView] = useState<AppView>(() => (courses.length > 0 ? 'play' : 'library'));
  const [isExportOpen, setIsExportOpen] = useState(false);

  useEffect(() => {
    saveStoredCourses(courses);
  }, [courses]);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === activeCourseId) || courses[0],
    [courses, activeCourseId]
  );

  const handleUpdateCourse = (updated: CourseProject) => {
    setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleCreateCourse = (newCourse: CourseProject) => {
    setCourses((prev) => [newCourse, ...prev]);
    setActiveCourseId(newCourse.id);
    setView('author');
  };

  const handleDeleteCourse = (id: string) => {
    const target = courses.find((c) => c.id === id);
    if (target?.uploadedVideoKey) {
      deleteVideoBlob(target.uploadedVideoKey);
    }
    const next = courses.filter((c) => c.id !== id);
    setCourses(next);
    if (activeCourseId === id) {
      setActiveCourseId(next[0]?.id || '');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setView('library')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Lumi Cast Studio
          </button>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
            {[
              { id: 'library' as const, label: 'Khóa học' },
              { id: 'play' as const, label: 'Trình chiếu học viên' },
              { id: 'author' as const, label: 'Trình biên tập' },
              { id: 'lms' as const, label: 'Giả lập SCORM' },
            ].map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-sky-600 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action CTA */}
          <div className="shrink-0">
            <button
              type="button"
              disabled={!activeCourse}
              onClick={() => setIsExportOpen(true)}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeCourse
                  ? 'bg-sky-600 hover:bg-sky-700 cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              Xuất SCORM / PPTX
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Course context bar when inside Play / Author / LMS views */}
        {view !== 'library' && activeCourse && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="min-w-0">
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span>{activeCourse.category}</span>
                <span aria-hidden="true">·</span>
                <span>Chuẩn đạt {activeCourse.passingScore}%</span>
                <span aria-hidden="true">·</span>
                <span>SCORM {activeCourse.defaultScormVersion}</span>
              </div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900 truncate mt-0.5">
                {activeCourse.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="active-course-select" className="text-xs text-slate-500 whitespace-nowrap">
                Đổi khóa học:
              </label>
              <select
                id="active-course-select"
                value={activeCourse.id}
                onChange={(e) => setActiveCourseId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 max-w-[260px]"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {view === 'library' && (
          <CourseLibraryView
            courses={courses}
            activeCourseId={activeCourse?.id || ''}
            onSelectAndPlay={(id) => {
              setActiveCourseId(id);
              setView('play');
            }}
            onSelectAndEdit={(id) => {
              setActiveCourseId(id);
              setView('author');
            }}
            onSelectAndExport={(id) => {
              setActiveCourseId(id);
              setIsExportOpen(true);
            }}
            onCreateCourse={handleCreateCourse}
            onDeleteCourse={handleDeleteCourse}
          />
        )}

        {view !== 'library' && !activeCourse && (
          <div className="max-w-xl mx-auto my-12 bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Chưa có khóa học nào trong thư viện
            </h2>
            <p className="text-sm text-slate-600">
              Hãy vào Thư viện khóa học để tạo khóa học video đầu tiên của bạn và bắt đầu biên tập câu hỏi tương tác.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setView('library')}
                className="px-4 py-2.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 cursor-pointer"
              >
                Về thư viện để tạo khóa mới
              </button>
            </div>
          </div>
        )}

        {view === 'play' && activeCourse && (
          <div className="max-w-5xl mx-auto">
            <InteractiveVideoPlayer course={activeCourse} />
          </div>
        )}

        {view === 'author' && activeCourse && (
          <AuthoringStudio
            course={activeCourse}
            onUpdateCourse={handleUpdateCourse}
            onSwitchToPreview={() => setView('play')}
          />
        )}

        {view === 'lms' && activeCourse && <LmsSimulatorPanel course={activeCourse} />}
      </main>

      {/* SCORM Export Modal */}
      {activeCourse && (
        <ScormExportModal
          course={activeCourse}
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
        />
      )}
    </div>
  );
}
