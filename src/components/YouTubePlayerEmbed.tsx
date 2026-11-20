import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
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

export const YouTubePlayerEmbed = forwardRef<YouTubePlayerHandle, YouTubePlayerEmbedProps>(
  ({ videoId, onReady, onTimeUpdate, onPlayStateChange, onEnded }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayerInstance | null>(null);
    const pollRef = useRef<number | null>(null);

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
      ensureYouTubeApi().then(() => {
        if (destroyed || !mountRef.current || !window.YT?.Player) return;
        const container = document.createElement('div');
        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(container);

        playerRef.current = new window.YT.Player(container, {
          videoId,
          playerVars: {
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            disablekb: 1,
          },
          events: {
            onReady: (e) => {
              if (destroyed) return;
              const dur = e.target.getDuration();
              if (dur && Number.isFinite(dur)) {
                callbacksRef.current.onReady?.(dur);
              }
            },
            onStateChange: (e) => {
              if (destroyed) return;
              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (e.data === 1) {
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
          },
        });

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
        <div className="absolute inset-0 z-10 pointer-events-auto" />
      </div>
    );
  }
);

YouTubePlayerEmbed.displayName = 'YouTubePlayerEmbed';
