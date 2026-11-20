import React, { useEffect, useState } from 'react';
import { BuiltInScene } from '../types/course';
import { formatTime } from '../utils/storage';

interface BuiltInVideoCanvasProps {
  scenes: BuiltInScene[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  courseTitle: string;
  fallbackCover: string;
}

export const BuiltInVideoCanvas: React.FC<BuiltInVideoCanvasProps> = ({
  scenes,
  currentTime,
  duration,
  isPlaying,
  courseTitle,
  fallbackCover,
}) => {
  const [imgError, setImgError] = useState(false);

  const activeScene =
    scenes.find((s) => currentTime >= s.startTime && currentTime < s.endTime) ||
    scenes[scenes.length - 1] || {
      startTime: 0,
      endTime: duration,
      title: courseTitle,
      subtitle: 'Bài giảng video tương tác',
      bulletPoints: ['Nhấn Phát để bắt đầu xem nội dung đào tạo và trả lời các điểm tương tác.'],
      imageUrl: fallbackCover,
      accentColor: '#0284c7',
    };

  const sceneSpan = Math.max(1, activeScene.endTime - activeScene.startTime);
  const sceneProgress = Math.min(1, Math.max(0, (currentTime - activeScene.startTime) / sceneSpan));
  const bgUrl = activeScene.imageUrl || fallbackCover;

  useEffect(() => {
    setImgError(false);
  }, [bgUrl]);

  // Subtle Ken Burns scale & pan based on playhead
  const scale = 1 + sceneProgress * 0.05;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {/* Crisp photographic backdrop with measured Ken Burns motion */}
      {!imgError && bgUrl ? (
        <img
          src={bgUrl}
          alt={activeScene.title}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          style={{
            transform: `scale(${scale.toFixed(4)})`,
            transition: isPlaying ? 'transform 250ms linear' : 'transform 200ms ease-out',
          }}
          className="absolute inset-0 w-full h-full object-cover opacity-85"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
      )}

      {/* Measured contrast scrim for 4.5:1 text legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 pointer-events-none" />

      {/* Optional visual callout zone inside the scene */}
      {activeScene.highlightZone && (
        <div
          style={{
            left: `${activeScene.highlightZone.x}%`,
            top: `${activeScene.highlightZone.y}%`,
            width: `${activeScene.highlightZone.w}%`,
            height: `${activeScene.highlightZone.h}%`,
          }}
          className="absolute border-2 border-amber-400/90 rounded-lg bg-amber-400/10 pointer-events-none transition-all duration-300"
        >
          <span className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[11px] font-semibold whitespace-nowrap shadow">
            {activeScene.highlightZone.label}
          </span>
        </div>
      )}

      {/* Left-aligned instructional overlay content (hidden or subtle during hotspot scenes so user sees panel clearly) */}
      <div className="relative z-10 h-full flex flex-col justify-between p-6 md:p-8 pointer-events-none">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-medium text-slate-300 tracking-wide">
            {courseTitle}
          </div>
          <div className="font-mono text-xs tabular-nums text-slate-300 bg-slate-900/70 px-2.5 py-1 rounded border border-white/10">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="max-w-lg space-y-3 my-auto">
          <div
            className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-sky-300 border border-white/15"
          >
            Phân đoạn {scenes.indexOf(activeScene) + 1} / {Math.max(1, scenes.length)}
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white leading-snug text-balance">
            {activeScene.title}
          </h2>
          <p className="text-sm text-slate-200 leading-relaxed">
            {activeScene.subtitle}
          </p>

          <ul className="space-y-1.5 pt-1">
            {activeScene.bulletPoints.map((pt, i) => {
              const revealThreshold = i * 0.18;
              const isRevealed = sceneProgress >= revealThreshold || !isPlaying;
              return (
                <li
                  key={i}
                  style={{
                    opacity: isRevealed ? 1 : 0.28,
                    transform: isRevealed ? 'translateX(0px)' : 'translateX(-6px)',
                  }}
                  className="flex items-start gap-2 text-xs md:text-sm text-slate-100 transition-all duration-300"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  <span>{pt}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Bottom chapter progress strip inside video frame */}
        <div className="flex items-center gap-1.5 pt-2">
          {scenes.map((sc, idx) => {
            const isPast = currentTime >= sc.endTime;
            const isCurrent = currentTime >= sc.startTime && currentTime < sc.endTime;
            return (
              <div key={idx} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-200"
                  style={{
                    width: isPast ? '100%' : isCurrent ? `${Math.round(sceneProgress * 100)}%` : '0%',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
