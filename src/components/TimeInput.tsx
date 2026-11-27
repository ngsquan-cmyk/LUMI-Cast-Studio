import React, { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { formatTimePrecise } from '../utils/storage';

/** Đọc "3:07.5", "03:07", "187.5" hoặc "1:02:03" thành số giây. Trả về null nếu không hợp lệ. */
export function parseTimeInput(raw: string): number | null {
  const txt = raw.trim().replace(',', '.');
  if (!txt) return null;
  if (/^\d+(\.\d+)?$/.test(txt)) return Number(txt);
  const parts = txt.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];
}

interface TimeInputProps {
  value: number;
  max: number;
  onCommit: (sec: number) => void;
  onUseCurrent?: () => void;
}

export const TimeInput: React.FC<TimeInputProps> = ({ value, max, onCommit, onUseCurrent }) => {
  const [text, setText] = useState(formatTimePrecise(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(formatTimePrecise(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const sec = parseTimeInput(text);
    if (sec === null) {
      setInvalid(true);
      return;
    }
    const clamped = Math.max(0, Math.min(max, Math.round(sec * 10) / 10));
    setInvalid(false);
    setText(formatTimePrecise(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="flex items-stretch gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setText(formatTimePrecise(value));
            setInvalid(false);
          }
        }}
        placeholder="vd. 3:07.5"
        title="Nhập dạng phút:giây (3:07.5) hoặc số giây (187.5), Enter để áp dụng"
        className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono tabular-nums text-slate-900 ${
          invalid ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
        }`}
      />
      {onUseCurrent && (
        <button
          type="button"
          onClick={onUseCurrent}
          title="Lấy vị trí đang phát (phím I)"
          className="shrink-0 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-slate-600 cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
