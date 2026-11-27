import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CourseProject, ScormVersion } from '../types/course';
import { buildPreviewHtml } from '../utils/scormExporter';
import { getVideoBlob } from '../utils/storage';

interface ExportedPlayerFrameProps {
  course: CourseProject;
  /** Nhúng cầu nối SCORM để màn Giả lập LMS nhận các lệnh gọi thật từ player. */
  scormVersion?: ScormVersion;
  /** Đổi giá trị này để khởi động lại player từ đầu. */
  resetKey?: number;
}

/**
 * Chạy đúng player của gói xuất (SCORM / xAPI / HTML5) trong iframe.
 * => Trainer xem thử trong Studio thấy gì thì learner trên eLearning thấy y như vậy.
 */
export const ExportedPlayerFrame: React.FC<ExportedPlayerFrameProps> = ({
  course,
  scormVersion,
  resetKey = 0,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoReady, setVideoReady] = useState(course.videoSourceType !== 'upload');
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    let revoked = '';
    if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
      setVideoReady(false);
      getVideoBlob(course.uploadedVideoKey).then((blob) => {
        if (blob) {
          revoked = URL.createObjectURL(blob);
          setVideoUrl(revoked);
        } else {
          setVideoUrl('');
        }
        setVideoReady(true);
      });
    } else {
      setVideoUrl('');
      setVideoReady(true);
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [course.videoSourceType, course.uploadedVideoKey]);

  const html = useMemo(
    () => (videoReady ? buildPreviewHtml(course, { videoObjectUrl: videoUrl, scormVersion, embed: true }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, videoUrl, videoReady, scormVersion, resetKey]
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as { type?: string; height?: number } | null;
      if (data && data.type === 'lumicast-height' && typeof data.height === 'number') {
        setHeight(data.height);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!videoReady) {
    return (
      <div className="w-full aspect-video rounded-xl bg-slate-900 flex items-center justify-center text-sm text-slate-300">
        Đang tải video...
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      key={`${course.id}-${resetKey}-${scormVersion || 'none'}`}
      title={`Xem trước: ${course.title}`}
      srcDoc={html}
      allow="fullscreen; autoplay"
      allowFullScreen
      className="w-full block border-0 bg-transparent"
      style={{ height: height ? `${height}px` : 'calc((100vw - 3rem) * 0.5625 + 120px)', maxHeight: height ? undefined : '760px' }}
    />
  );
};
