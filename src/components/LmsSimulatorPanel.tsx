import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { CourseProject, ScormLogEntry, ScormVersion } from '../types/course';
import { ExportedPlayerFrame } from './ExportedPlayerFrame';

interface LmsSimulatorPanelProps {
  course: CourseProject;
}

type CmiStore = Record<string, string>;

declare global {
  interface Window {
    API?: Record<string, (...args: string[]) => string>;
    API_1484_11?: Record<string, (...args: string[]) => string>;
  }
}

/**
 * Giả lập LMS: cài API SCORM thật (window.API / window.API_1484_11) vào trang Studio.
 * Player trong iframe tự tìm thấy API này giống hệt khi chạy trên hệ thống eLearning,
 * nên mọi lệnh gọi hiển thị ở đây chính là những gì gói export sẽ gửi lên LMS.
 */
export const LmsSimulatorPanel: React.FC<LmsSimulatorPanelProps> = ({ course }) => {
  const [version, setVersion] = useState<ScormVersion>(course.defaultScormVersion || '2004');
  const [store, setStore] = useState<CmiStore>({});
  const [logs, setLogs] = useState<ScormLogEntry[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const storeRef = useRef<CmiStore>({});
  const seqRef = useRef(0);

  useEffect(() => {
    storeRef.current = {};
    setStore({});
    setLogs([]);

    const log = (method: string, key: string, value: string) => {
      seqRef.current += 1;
      const entry: ScormLogEntry = {
        id: `${Date.now()}-${seqRef.current}`,
        time: new Date().toLocaleTimeString('vi-VN'),
        method,
        key,
        value,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 200));
    };
    let pending = false;
    const flush = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        setStore({ ...storeRef.current });
      });
    };
    const getValue = (key: string) => {
      if (key === 'cmi.interactions._count') {
        const ids = Object.keys(storeRef.current).filter((k) => /^cmi\.interactions\.\d+\.id$/.test(k));
        return String(ids.length);
      }
      return storeRef.current[key] || '';
    };
    const setValue = (method: string) => (key: string, value: string) => {
      storeRef.current[key] = String(value);
      log(method, key, String(value));
      flush();
      return 'true';
    };

    const api2004 = {
      Initialize: () => { log('Initialize', '', 'true'); return 'true'; },
      Terminate: () => { log('Terminate', '', 'true'); return 'true'; },
      Commit: () => 'true',
      GetValue: (k: string) => getValue(k),
      SetValue: setValue('SetValue'),
      GetLastError: () => '0',
      GetErrorString: () => '',
      GetDiagnostic: () => '',
    };
    const api12 = {
      LMSInitialize: () => { log('LMSInitialize', '', 'true'); return 'true'; },
      LMSFinish: () => { log('LMSFinish', '', 'true'); return 'true'; },
      LMSCommit: () => 'true',
      LMSGetValue: (k: string) => getValue(k),
      LMSSetValue: setValue('LMSSetValue'),
      LMSGetLastError: () => '0',
      LMSGetErrorString: () => '',
      LMSGetDiagnostic: () => '',
    };
    if (version === '2004') window.API_1484_11 = api2004;
    else window.API = api12;

    return () => {
      delete window.API_1484_11;
      delete window.API;
    };
  }, [version, resetKey, course.id]);

  const is2004 = version === '2004';
  const status = is2004
    ? `${store['cmi.completion_status'] || '—'} / ${store['cmi.success_status'] || '—'}`
    : store['cmi.core.lesson_status'] || '—';
  const score = store[is2004 ? 'cmi.score.raw' : 'cmi.core.score.raw'] || '0';
  const suspend = store['cmi.suspend_data'] || '';
  const interactionRows = Object.keys(store)
    .map((k) => k.match(/^cmi\.interactions\.(\d+)\.id$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => {
      const n = m[1];
      const p = `cmi.interactions.${n}.`;
      return {
        n,
        id: store[p + 'id'],
        type: store[p + 'type'],
        response: store[p + (is2004 ? 'learner_response' : 'student_response')],
        result: store[p + 'result'],
      };
    });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <div className="xl:col-span-8">
        <ExportedPlayerFrame course={course} scormVersion={version} resetKey={resetKey} />
      </div>

      <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Trình giả lập LMS</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dữ liệu dưới đây là lệnh gọi thật từ player — giống hệt khi chạy trên hệ thống eLearning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {(['2004', '1.2'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVersion(v)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                    version === v ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  SCORM {v}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setResetKey((k) => k + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Phiên mới
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">Trạng thái</div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-0.5 break-words">{status}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">Điểm (score.raw)</div>
              <div className="text-sm font-bold font-mono tabular-nums text-sky-700 mt-0.5">{score}%</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span>Tiến độ lưu (cmi.suspend_data)</span>
              <span className={`font-mono ${suspend.length > 4096 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {suspend.length} / {is2004 ? '64.000' : '4.096'} ký tự
              </span>
            </div>
            <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
              {suspend || '(chưa có)'}
            </pre>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5">
              Kết quả từng câu (cmi.interactions) — {interactionRows.length} lượt trả lời
            </div>
            {interactionRows.length === 0 ? (
              <div className="text-xs text-slate-500">Chưa có câu nào được trả lời.</div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {interactionRows.map((r) => (
                  <div key={r.n} className="px-3 py-1.5 text-[11px] font-mono flex items-center justify-between gap-2">
                    <span className="truncate text-slate-800">
                      #{r.n} {r.id} · {r.type} · <span className="text-slate-500">{r.response}</span>
                    </span>
                    <span className={r.result === 'correct' ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}>
                      {r.result}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5">Nhật ký lệnh gọi API</div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {logs.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-500">Bấm phát video để bắt đầu.</div>}
              {logs.map((entry) => (
                <div key={entry.id} className="px-3 py-1.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-semibold text-sky-700">{entry.method}</span>
                    <span className="tabular-nums">{entry.time}</span>
                  </div>
                  {entry.key && (
                    <div className="text-slate-800 truncate">
                      {entry.key}: <span className="text-emerald-700">{entry.value}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
