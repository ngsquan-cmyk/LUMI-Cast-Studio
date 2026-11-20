import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setMuted: (muted: boolean) => void;
}

interface YouTubePlayerEmbedProps {
  videoId: string;
  onReady?: (duration: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onEnded?: () => void;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (sec: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getIframe?: () => HTMLIFrameElement;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          width?: string | number;
          height?: string | number;
          host?: string;
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
            onError?: (e: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function ensureYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

function getYouTubeErrorMessage(code: number): string {
  if (code === 153) {
    return 'Trình duyệt hoặc môi trường hiện tại đang chặn gửi thông tin nguồn (Referer) tới YouTube (Lỗi 153). Hãy mở qua địa chỉ HTTPS hoặc tải video .mp4 trực tiếp lên khóa học.';
  }
  if (code === 101 || code === 150) {
    return 'Chủ sở hữu video YouTube này đã tắt quyền nhúng trên trang web khác (Lỗi 101/150). Vui lòng chọn video khác hoặc tải tệp .mp4 lên.';
  }
  return `Không thể phát video YouTube này (Mã lỗi ${code}). Vui lòng kiểm tra lại link hoặc chuyển sang tải tệp .mp4.`;
}

export const YouTubePlayerEmbed = forwardRef<YouTubePlayerHandle, YouTubePlayerEmbedProps>(
  ({ videoId, onReady, onTimeUpdate, onPlayStateChange, onEnded }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayerInstance | null>(null);
    const pollRef = useRef<number | null>(null);
    const [ytError, setYtError] = useState<string | null>(null);

    const callbacksRef = useRef({ onReady, onTimeUpdate, onPlayStateChange, onEnded });
    callbacksRef.current = { onReady, onTimeUpdate, onPlayStateChange, onEnded };

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (sec: number) => playerRef.current?.seekTo(sec, true),
      setPlaybackRate: (rate: number) => playerRef.current?.setPlaybackRate(rate),
      setMuted: (muted: boolean) => {
        if (muted) playerRef.current?.mute();
        else playerRef.current?.unMute();
      },
    }));

    useEffect(() => {
      let destroyed = false;
      setYtError(null);

      if (window.location.protocol === 'file:') {
        setYtError(getYouTubeErrorMessage(153));
        return;
      }

      ensureYouTubeApi().then(() => {
        if (destroyed || !mountRef.current || !window.YT?.Player) return;
        const container = document.createElement('div');
        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(container);

        const isHttpOrigin =
          window.location.protocol === 'http:' || window.location.protocol === 'https:';
        const playerVars: Record<string, string | number> = {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1,
          enablejsapi: 1,
        };
        if (isHttpOrigin) {
          playerVars.origin = window.location.origin;
          playerVars.widget_referrer = window.location.href;
        }

        const player = new window.YT.Player(container, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube.com',
          videoId,
          playerVars,
          events: {
            onReady: (e) => {
              if (destroyed) return;
              const iframe = e.target.getIframe?.();
              if (iframe) {
                iframe.referrerPolicy = 'strict-origin-when-cross-origin';
              }
              const dur = e.target.getDuration();
              if (dur && Number.isFinite(dur)) {
                callbacksRef.current.onReady?.(dur);
              }
            },
            onStateChange: (e) => {
              if (destroyed) return;
              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (e.data === 1) {
                setYtError(null);
                callbacksRef.current.onPlayStateChange?.(true);
                const dur = e.target.getDuration();
                if (dur && Number.isFinite(dur)) callbacksRef.current.onReady?.(dur);
              } else if (e.data === 2) {
                callbacksRef.current.onPlayStateChange?.(false);
              } else if (e.data === 0) {
                callbacksRef.current.onPlayStateChange?.(false);
                callbacksRef.current.onEnded?.();
              }
            },
            onError: (e) => {
              if (destroyed) return;
              callbacksRef.current.onPlayStateChange?.(false);
              setYtError(getYouTubeErrorMessage(e.data));
            },
          },
        });
        playerRef.current = player;

        try {
          const iframe = player.getIframe?.();
          if (iframe) {
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          }
        } catch {
          // ignore
        }

        pollRef.current = window.setInterval(() => {
          if (playerRef.current && playerRef.current.getPlayerState?.() === 1) {
            const t = playerRef.current.getCurrentTime?.();
            if (typeof t === 'number' && Number.isFinite(t)) {
              callbacksRef.current.onTimeUpdate?.(t);
            }
          }
        }, 120);
      });

      return () => {
        destroyed = true;
        if (pollRef.current) window.clearInterval(pollRef.current);
        try {
          playerRef.current?.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      };
    }, [videoId]);

    return (
      <div className="relative w-full h-full bg-black">
        <div ref={mountRef} className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
        {/* Transparent overlay prevents direct YouTube iframe clicks from bypassing custom controls */}
        {!ytError && <div className="absolute inset-0 z-10 pointer-events-auto" />}

        {ytError && (
          <div className="absolute inset-0 z-20 bg-slate-950/95 text-white flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="text-sm font-bold text-amber-300">Không thể phát video YouTube nhúng</div>
            <p className="text-xs text-slate-300 max-w-md leading-relaxed">{ytError}</p>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors"
            >
              Mở video trên YouTube
            </a>
          </div>
        )}
      </div>
    );
  }
);

YouTubePlayerEmbed.displayName = 'YouTubePlayerEmbed';
