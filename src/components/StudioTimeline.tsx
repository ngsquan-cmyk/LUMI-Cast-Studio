import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Info, Keyboard, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { InteractionItem, InteractionType } from '../types/course';
import { formatTime, formatTimePrecise } from '../utils/storage';

interface StudioTimelineProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  interactions: InteractionItem[]; // đã sắp xếp theo thời gian
  selectedId: string | null;
  /** URL video (blob: hoặc http) để chụp ảnh thu nhỏ; rỗng nếu là YouTube / bài mẫu. */
  thumbnailSource?: string;
  onTogglePlay: () => void;
  onSeek: (sec: number) => void;
  onSelect: (id: string) => void;
  /** Bắt đầu kéo mốc: chụp lại trạng thái để Hoàn tác 1 bước. */
  onDragStart: () => void;
  /** Thả mốc tại thời điểm mới. */
  onDragCommit: (id: string, sec: number) => void;
  onSetSelectedAtPlayhead: () => void;
  onNudgeSelected: (deltaSec: number) => void;
}

const ZOOMS = [1, 2, 4, 8, 16];
const THUMB_COUNT = 24;

function pickTickStep(visibleSeconds: number): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const c of candidates) if (visibleSeconds / c <= 12) return c;
  return 900;
}

/** Chụp ảnh thu nhỏ dọc theo video (chỉ chạy với video cùng nguồn, ví dụ video tải lên). */
function useVideoThumbnails(src: string | undefined, duration: number): string[] {
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    setThumbs([]);
    if (!src || !duration || duration < 2) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = src;
    const canvas = document.createElement('canvas');
    const results: string[] = [];
    let i = 0;

    const grab = () => {
      if (cancelled) return;
      try {
        const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        canvas.height = 54;
        canvas.width = Math.round(54 * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        results.push(canvas.toDataURL('image/jpeg', 0.55));
      } catch {
        // Video khác nguồn (CORS) không cho chụp -> bỏ qua dải ảnh
        cancelled = true;
        return;
      }
      i += 1;
      if (i < THUMB_COUNT) {
        video.currentTime = Math.min(duration - 0.1, ((i + 0.5) / THUMB_COUNT) * duration);
      } else {
        setThumbs(results.slice());
        video.removeAttribute('src');
        video.load();
      }
    };
    video.addEventListener('seeked', grab);
    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(duration - 0.1, (0.5 / THUMB_COUNT) * duration);
    });
    video.addEventListener('error', () => { cancelled = true; });
    return () => {
      cancelled = true;
      video.removeEventListener('seeked', grab);
      video.removeAttribute('src');
      try { video.load(); } catch { /* bỏ qua */ }
    };
  }, [src, duration]);
  return thumbs;
}

export const StudioTimeline: React.FC<StudioTimelineProps> = ({
  duration,
  currentTime,
  isPlaying,
  interactions,
  selectedId,
  thumbnailSource,
  onTogglePlay,
  onSeek,
  onSelect,
  onDragStart,
  onDragCommit,
  onSetSelectedAtPlayhead,
  onNudgeSelected,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [drag, setDrag] = useState<{ id: string; sec: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const zoom = ZOOMS[zoomIdx];
  const safeDuration = Math.max(1, duration || 1);
  const thumbs = useVideoThumbnails(thumbnailSource, duration);
  const selected = interactions.find((i) => i.id === selectedId) || null;

  const pct = (sec: number) => Math.max(0, Math.min(100, (sec / safeDuration) * 100));

  const secFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * safeDuration * 10) / 10;
  };

  // Tự cuộn để đầu phát luôn nằm trong vùng nhìn thấy khi đã phóng to
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || zoom === 1 || drag || scrubbing) return;
    const x = (currentTime / safeDuration) * sc.scrollWidth;
    if (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40) {
      sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2);
    }
  }, [currentTime, zoom, safeDuration, drag, scrubbing]);

  // Ctrl + lăn chuột để phóng to / thu nhỏ
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomIdx((z) => Math.max(0, Math.min(ZOOMS.length - 1, z + (e.deltaY < 0 ? 1 : -1))));
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);

  // Giữ vị trí đầu phát ở giữa khi đổi mức phóng to
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    requestAnimationFrame(() => {
      const x = (currentTime / safeDuration) * sc.scrollWidth;
      sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const ticks = useMemo(() => {
    const visible = safeDuration / zoom;
    const step = pickTickStep(visible);
    const out: number[] = [];
    for (let t = 0; t <= safeDuration + 0.001; t += step) out.push(t);
    return out;
  }, [safeDuration, zoom]);

  // Xếp mốc thành 2 hàng khi quá gần nhau để không đè lên nhau
  const lanes = useMemo(() => {
    const map: Record<string, number> = {};
    const trackPx = (trackRef.current?.clientWidth || 700) ;
    let lastX = -999;
    let lastLane = 1;
    interactions.forEach((it) => {
      const x = (it.timestamp / safeDuration) * trackPx;
      const lane = x - lastX < 30 ? (lastLane === 0 ? 1 : 0) : 0;
      map[it.id] = lane;
      lastX = x;
      lastLane = lane;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactions, safeDuration, zoom]);

  const startScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-pin]')) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setScrubbing(true);
    onSeek(secFromClientX(e.clientX));
  };
  const moveScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    onSeek(secFromClientX(e.clientX));
  };
  const endScrub = () => setScrubbing(false);

  const startPinDrag = (e: React.PointerEvent<HTMLButtonElement>, item: InteractionItem) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(item.id);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    let moved = false;
    let latest = item.timestamp;

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      if (!moved) {
        moved = true;
        onDragStart();
      }
      latest = secFromClientX(ev.clientX);
      setDrag({ id: item.id, sec: latest });
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (moved) onDragCommit(item.id, latest);
      else onSeek(item.timestamp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const typeIcon = (t: InteractionType) =>
    t === InteractionType.INFO ? <Info className="w-3 h-3" /> : t === InteractionType.HOTSPOT ? <Crosshair className="w-3 h-3" /> : null;

  return (
    <div className="space-y-2">
      {/* Hàng điều khiển */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            title="Phát / Dừng (Space)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Dừng' : 'Phát'}</span>
          </button>
          <span className="font-mono text-xs tabular-nums text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
            {formatTimePrecise(currentTime)} / {formatTime(duration)}
          </span>
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              disabled={zoomIdx === 0}
              onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
              title="Thu nhỏ timeline (Ctrl + lăn chuột)"
              className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed rounded-l-lg"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-slate-600 tabular-nums min-w-[2.5rem] text-center">{zoom}×</span>
            <button
              type="button"
              disabled={zoomIdx === ZOOMS.length - 1}
              onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
              title="Phóng to timeline để đặt mốc chính xác hơn (Ctrl + lăn chuột)"
              className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed rounded-r-lg"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {selected ? (
          <div className="flex items-center gap-1 text-xs flex-wrap">
            <button
              type="button"
              onClick={onSetSelectedAtPlayhead}
              title="Đặt mốc đang chọn đúng vào vị trí đang phát (phím I)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 cursor-pointer whitespace-nowrap"
            >
              Đặt mốc tại đây <kbd className="ml-0.5 px-1 rounded bg-white/25 text-[10px] font-mono">I</kbd>
            </button>
            {[-1, -0.1, 0.1, 1].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onNudgeSelected(d)}
                title={`Dịch mốc đang chọn ${d > 0 ? '+' : ''}${d}s`}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-mono text-slate-700 cursor-pointer"
              >
                {d > 0 ? '+' : ''}
                {d}s
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-500">Chọn một mốc để chỉnh thời điểm</span>
        )}
      </div>

      {/* Track cuộn ngang */}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-slate-50">
        <div style={{ width: `${zoom * 100}%` }} className="relative min-w-full">
          <div
            ref={trackRef}
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
            className="relative h-[86px] cursor-pointer select-none touch-none"
          >
            {/* Dải ảnh thu nhỏ */}
            <div className="absolute left-0 right-0 top-[18px] h-[34px] flex overflow-hidden bg-slate-200/70 pointer-events-none">
              {thumbs.length > 0 ? (
                thumbs.map((src, i) => (
                  <img key={i} src={src} alt="" draggable={false} className="h-full flex-1 min-w-0 object-cover opacity-90" />
                ))
              ) : (
                <div className="w-full h-full bg-[repeating-linear-gradient(90deg,#e2e8f0_0,#e2e8f0_1px,transparent_1px,transparent_24px)]" />
              )}
            </div>

            {/* Phần đã phát */}
            <div
              className="absolute left-0 top-[18px] h-[34px] bg-sky-500/20 pointer-events-none"
              style={{ width: `${pct(currentTime)}%` }}
            />

            {/* Thước thời gian */}
            <div className="absolute left-0 right-0 bottom-0 h-[30px] pointer-events-none">
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: `${pct(t)}%` }}>
                  <div className="w-px h-1.5 bg-slate-400" />
                  <div className="absolute top-1.5 -translate-x-1/2 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                    {formatTime(t)}
                  </div>
                </div>
              ))}
            </div>

            {/* Mốc tương tác */}
            {interactions.map((item, idx) => {
              const isSel = item.id === selectedId;
              const sec = drag && drag.id === item.id ? drag.sec : item.timestamp;
              const lane = lanes[item.id] || 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-pin
                  onPointerDown={(e) => startPinDrag(e, item)}
                  title={`${formatTimePrecise(item.timestamp)} · ${item.title} — kéo ngang để đổi thời điểm, bấm để tua tới`}
                  style={{ left: `${pct(sec)}%`, top: lane === 0 ? 0 : 26 }}
                  className={`absolute -translate-x-1/2 z-20 flex flex-col items-center cursor-grab active:cursor-grabbing touch-none ${
                    isSel ? 'z-30' : ''
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[10px] font-bold text-white shadow whitespace-nowrap ${
                      isSel ? 'bg-amber-500 ring-2 ring-amber-300' : item.type === InteractionType.INFO ? 'bg-slate-500' : 'bg-sky-600'
                    }`}
                  >
                    {typeIcon(item.type)}Q{idx + 1}
                  </span>
                  <span className={`w-0.5 ${lane === 0 ? 'h-[34px]' : 'h-[8px]'} ${isSel ? 'bg-amber-500' : 'bg-sky-600/70'}`} />
                </button>
              );
            })}

            {/* Nhãn thời gian khi đang kéo mốc */}
            {drag && (
              <div
                className="absolute bottom-[6px] z-40 -translate-x-1/2 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-mono font-semibold shadow pointer-events-none"
                style={{ left: `${pct(drag.sec)}%` }}
              >
                {formatTimePrecise(drag.sec)}
              </div>
            )}

            {/* Đầu phát */}
            <div
              className="absolute top-[12px] bottom-[28px] w-0.5 bg-rose-600 z-10 pointer-events-none"
              style={{ left: `${pct(currentTime)}%` }}
            >
              <div className="absolute -top-1 -left-[5px] w-3 h-3 rotate-45 bg-rose-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Mẹo: xem video → dừng đúng khung hình → bấm <strong>I</strong> để đặt mốc đang chọn vào đó, hoặc bấm{' '}
          <strong>M</strong> để thả nhanh một câu hỏi mới tại vị trí đang phát.
        </p>
        <button
          type="button"
          onClick={() => setShowHelp((s) => !s)}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline cursor-pointer"
        >
          <Keyboard className="w-3.5 h-3.5" /> Phím tắt
        </button>
      </div>
      {showHelp && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
          {[
            ['Space', 'Phát / Dừng'],
            ['I', 'Đặt mốc đang chọn tại vị trí đang phát'],
            ['M', 'Thêm câu hỏi trắc nghiệm mới tại vị trí đang phát'],
            ['← / →', 'Lùi / tiến 1 giây'],
            ['Shift + ← / →', 'Lùi / tiến 0,1 giây'],
            [', / .', 'Lùi / tiến 1 khung hình'],
            ['Alt + ← / →', 'Dịch mốc đang chọn ±0,1 giây'],
            ['[ / ]', 'Chọn mốc trước / sau'],
            ['Ctrl + lăn chuột', 'Phóng to / thu nhỏ timeline'],
            ['Ctrl + Z / Ctrl + Y', 'Hoàn tác / Làm lại'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-[10px] whitespace-nowrap">{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
