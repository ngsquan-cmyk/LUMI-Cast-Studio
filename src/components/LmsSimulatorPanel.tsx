import React, { useCallback, useRef, useState } from 'react';
import { CourseProject, LearnerAnswer, ScormLogEntry } from '../types/course';
import { InteractiveVideoPlayer } from './InteractiveVideoPlayer';

interface LmsSimulatorPanelProps {
  course: CourseProject;
}

export const LmsSimulatorPanel: React.FC<LmsSimulatorPanelProps> = ({ course }) => {
  const [cmiState, setCmiState] = useState({
    lessonStatus: 'incomplete',
    scoreRaw: 0,
    earnedPoints: 0,
    maxPoints: 0,
    suspendData: '{}',
  });
  const [logs, setLogs] = useState<ScormLogEntry[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString('vi-VN'),
      method: course.defaultScormVersion === '2004' ? 'Initialize("")' : 'LMSInitialize("")',
      key: 'session',
      value: 'true',
    },
  ]);

  const lastSnapshotRef = useRef<string>('');

  const handleScormUpdate = useCallback(
    (payload: {
      scorePercent: number;
      earnedPoints: number;
      maxPoints: number;
      passed: boolean;
      completed: boolean;
      answers: Record<string, LearnerAnswer>;
      currentTime: number;
    }) => {
      const status = payload.completed
        ? payload.passed
          ? 'passed'
          : 'failed'
        : 'incomplete';

      const suspendObj = {
        time: Math.round(payload.currentTime),
        answered: Object.keys(payload.answers).length,
      };
      const snapshotKey = `${status}-${payload.scorePercent}-${suspendObj.answered}`;

      if (lastSnapshotRef.current !== snapshotKey) {
        lastSnapshotRef.current = snapshotKey;
        const nowStr = new Date().toLocaleTimeString('vi-VN');
        const is2004 = course.defaultScormVersion === '2004';
        const newLogs: ScormLogEntry[] = [
          {
            id: `${Date.now()}-score`,
            time: nowStr,
            method: is2004 ? 'SetValue' : 'LMSSetValue',
            key: is2004 ? 'cmi.score.raw' : 'cmi.core.score.raw',
            value: String(payload.scorePercent),
          },
          {
            id: `${Date.now()}-status`,
            time: nowStr,
            method: is2004 ? 'SetValue' : 'LMSSetValue',
            key: is2004 ? 'cmi.completion_status / success_status' : 'cmi.core.lesson_status',
            value: status,
          },
          {
            id: `${Date.now()}-commit`,
            time: nowStr,
            method: is2004 ? 'Commit("")' : 'LMSCommit("")',
            key: 'cmi.suspend_data',
            value: JSON.stringify(suspendObj),
          },
        ];

        setCmiState({
          lessonStatus: status,
          scoreRaw: payload.scorePercent,
          earnedPoints: payload.earnedPoints,
          maxPoints: payload.maxPoints,
          suspendData: JSON.stringify(suspendObj, null, 2),
        });
        setLogs((prev) => [...newLogs, ...prev].slice(0, 30));
      }
    },
    [course.defaultScormVersion]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <div className="xl:col-span-8">
        <InteractiveVideoPlayer course={course} onScormUpdate={handleScormUpdate} />
      </div>

      <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900">
            Trình giả lập LMS (SCORM {course.defaultScormVersion})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi dữ liệu điểm và trạng thái gửi về hệ thống E-Learning theo thời gian thực.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">Trạng thái bài học</div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                {cmiState.lessonStatus}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">Điểm SCORM (cmi.score.raw)</div>
              <div className="text-sm font-bold font-mono tabular-nums text-sky-700 mt-0.5">
                {cmiState.scoreRaw}% ({cmiState.earnedPoints}/{cmiState.maxPoints})
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5">
              Dữ liệu phiên lưu trữ (cmi.suspend_data)
            </div>
            <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
              {cmiState.suspendData}
            </pre>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5">
              Nhật ký lệnh gọi API gửi về LMS
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="px-3 py-2 text-[11px] font-mono space-y-0.5">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-semibold text-sky-700">{log.method}</span>
                    <span className="tabular-nums">{log.time}</span>
                  </div>
                  <div className="text-slate-800 truncate">
                    {log.key}: <span className="text-emerald-700">{log.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
