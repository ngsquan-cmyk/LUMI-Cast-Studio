import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileArchive,
  FileCode,
  FileText,
  Loader2,
  MonitorPlay,
  Package,
  X,
} from 'lucide-react';
import { CourseProject, InteractionType, ScormVersion } from '../types/course';
import {
  buildScormPackageZip,
  buildStandaloneInteractiveHtml,
  buildWebBundleZip,
  buildXapiPackageZip,
  generateImsManifest,
  getDefaultXapiActivityId,
  getUploadedMediaFilename,
  PackageStandard,
} from '../utils/scormExporter';
import { generateTincanXml } from '../utils/lmsBridges';
import { getVideoBlob } from '../utils/storage';

interface ScormExportModalProps {
  course: CourseProject;
  isOpen: boolean;
  onClose: () => void;
}

type ExportChannel = 'scorm' | 'pptx_online';

export const ScormExportModal: React.FC<ScormExportModalProps> = ({
  course,
  isOpen,
  onClose,
}) => {
  const [channel, setChannel] = useState<ExportChannel>('scorm');
  const [version, setVersion] = useState<PackageStandard>(course.defaultScormVersion || '2004');
  const [isExporting, setIsExporting] = useState(false);
  const [uploadedSizeMb, setUploadedSizeMb] = useState<number>(0);
  const [exportResult, setExportResult] = useState<{
    filename: string;
    files?: string[];
    sizeKb: number;
    note: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setExportResult(null);
    if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
      getVideoBlob(course.uploadedVideoKey).then((b) => {
        setUploadedSizeMb(b ? Number((b.size / (1024 * 1024)).toFixed(1)) : 0);
      });
    } else {
      setUploadedSizeMb(0);
    }
  }, [isOpen, course.id, course.videoSourceType, course.uploadedVideoKey]);

  const previewManifest = useMemo(() => {
    const assets: string[] = [];
    if (course.videoSourceType === 'upload' && course.uploadedVideoName) {
      assets.push(getUploadedMediaFilename(course.uploadedVideoName));
    }
    if (version === 'xapi') {
      return generateTincanXml(getDefaultXapiActivityId(course), course.title, course.description || '');
    }
    return generateImsManifest(course, version as ScormVersion, assets);
  }, [course, version]);

  if (!isOpen) return null;

  const gradableCount = course.interactions.filter(
    (i) => i.type !== InteractionType.INFO
  ).length;
  const hasVideo =
    course.videoSourceType === 'builtin' ||
    (course.videoSourceType === 'upload' && Boolean(course.uploadedVideoKey)) ||
    (course.videoSourceType === 'url' && Boolean(course.videoUrl)) ||
    (course.videoSourceType === 'youtube' && Boolean(course.youtubeId));

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportScorm = async () => {
    setIsExporting(true);
    setExportResult(null);
    try {
      const { blob, filename, files } =
        version === 'xapi'
          ? await buildXapiPackageZip(course)
          : await buildScormPackageZip(course, version);
      triggerDownload(blob, filename);
      setExportResult({
        filename,
        files,
        sizeKb: Math.max(1, Math.round(blob.size / 1024)),
        note:
          version === 'xapi'
            ? 'Tải tệp .zip này lên hệ thống eLearning dưới dạng gói xAPI / Tin Can (có tincan.xml). Hệ thống cần mở bài kèm tham số endpoint, auth, actor để ghi dữ liệu vào LRS.'
            : 'Tải trực tiếp tệp .zip này lên hệ thống eLearning dưới dạng gói SCORM.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSingleHtml = async () => {
    setIsExporting(true);
    setExportResult(null);
    try {
      const { blob, filename } = await buildStandaloneInteractiveHtml(course);
      triggerDownload(blob, filename);
      setExportResult({
        filename,
        sizeKb: Math.max(1, Math.round(blob.size / 1024)),
        note: 'File HTML5 tương tác độc lập đã sẵn sàng. Mở bằng trình duyệt hoặc gắn link vào slide PowerPoint (PPTX) để trình chiếu train online.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWebZip = async () => {
    setIsExporting(true);
    setExportResult(null);
    try {
      const { blob, filename, files } = await buildWebBundleZip(course);
      triggerDownload(blob, filename);
      setExportResult({
        filename,
        files,
        sizeKb: Math.max(1, Math.round(blob.size / 1024)),
        note: 'Giải nén và chạy tệp index.html hoặc tải lên SharePoint/Web nội bộ để nhúng vào PowerPoint.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileArchive className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Xuất bài giảng tương tác</h2>
              <p className="text-xs text-slate-500 truncate">{course.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại xuất bài giảng"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Two Channel Selector Cards: SCORM vs Interactive Video for PPTX / Train Online */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Chọn định dạng xuất bài giảng
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setChannel('scorm');
                  setExportResult(null);
                }}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex items-start gap-3 ${
                  channel === 'scorm'
                    ? 'border-sky-600 bg-sky-50/70'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <Package className={`w-5 h-5 shrink-0 mt-0.5 ${channel === 'scorm' ? 'text-sky-600' : 'text-slate-400'}`} />
                <div>
                  <div className="text-sm font-bold text-slate-900">Gói SCORM / xAPI (.zip) cho eLearning</div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Dùng để tải lên Moodle, Canvas, TalentLMS. Tự lưu điểm và khôi phục tiến độ học viên.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChannel('pptx_online');
                  setExportResult(null);
                }}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex items-start gap-3 ${
                  channel === 'pptx_online'
                    ? 'border-sky-600 bg-sky-50/70'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <MonitorPlay className={`w-5 h-5 shrink-0 mt-0.5 ${channel === 'pptx_online' ? 'text-sky-600' : 'text-slate-400'}`} />
                <div>
                  <div className="text-sm font-bold text-slate-900">Video Tương tác cho PPTX</div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Xuất file HTML5 tự chạy (1 file duy nhất) để gắn vào slide PowerPoint hoặc share khi train online.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Channel 1: SCORM Package Options */}
          {channel === 'scorm' && (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Chuẩn đóng gói E-Learning
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      v: '2004' as const,
                      name: 'SCORM 2004 (khuyên dùng)',
                      desc: 'Hoàn thành + Đạt/Không đạt tách riêng, ghi kết quả từng câu, lưu tiến độ dung lượng lớn.',
                    },
                    {
                      v: '1.2' as const,
                      name: 'SCORM 1.2',
                      desc: 'Dự phòng cho hệ thống/khóa cũ. Tiến độ được nén gọn để vừa giới hạn 4.096 ký tự.',
                    },
                    {
                      v: 'xapi' as const,
                      name: 'xAPI (Tin Can)',
                      desc: 'Ghi chi tiết hành vi xem: phát, dừng, tua lại, thời gian trả lời từng câu → phân tích sâu.',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setVersion(opt.v)}
                      className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        version === opt.v
                          ? 'border-sky-600 bg-sky-50/50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="text-sm font-bold text-slate-900">{opt.name}</div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-800">
                  Kiểm tra tính năng chuẩn LMS đã kích hoạt
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${hasVideo ? 'text-emerald-600' : 'text-amber-500'}`}
                    />
                    <span className="truncate">
                      Video:{' '}
                      {course.videoSourceType === 'upload'
                        ? `${course.uploadedVideoName} (${uploadedSizeMb} MB)`
                        : course.videoSourceType === 'youtube'
                        ? `YouTube (${course.youtubeId})`
                        : course.videoSourceType === 'url'
                        ? 'Liên kết URL ngoài'
                        : 'Bài giảng mẫu tích hợp'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span className="tabular-nums">
                      {course.interactions.length} tương tác ({gradableCount} câu chấm điểm · đạt {course.passingScore}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{version === 'xapi' ? 'Lưu & khôi phục tiến độ qua xAPI State API' : 'Khôi phục tiến độ qua cmi.suspend_data (đã nén gọn)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Tự lưu điểm mỗi 15s &amp; khi đóng tab (pagehide)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{version === 'xapi' ? 'Statement "answered" cho từng câu' : 'Ghi kết quả từng câu (cmi.interactions)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Chữ tự co giãn, toàn màn hình kèm thanh điều khiển</span>
                  </div>
                </div>
              </div>

              {uploadedSizeMb > 100 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Cảnh báo dung lượng: Video nặng <strong>{uploadedSizeMb} MB</strong>. Nhiều hệ thống LMS (như Moodle) giới hạn file tải lên dưới 100–250 MB. Nếu upload lỗi, hãy nén video hoặc dùng link YouTube / MP4 trực tiếp để gói SCORM chỉ nhẹ dưới 100 KB.
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-slate-500" />
                    Xem trước {version === 'xapi' ? 'tincan.xml' : 'imsmanifest.xml'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">UTF-8 · XML 1.0</span>
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-40">
                  {previewManifest}
                </pre>
              </div>
            </>
          )}

          {/* Channel 2: Interactive Video for PPTX & Online Training */}
          {channel === 'pptx_online' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-900">
                  Vì sao dùng file HTML5 Tương tác cho PowerPoint (PPTX) &amp; Train Online?
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Định dạng video thông thường (.mp4) chỉ phát tuyến tính, không thể tự dừng để học viên bấm chọn đáp án hay click Hotspot. Xuất sang <strong>1 file HTML5 độc lập</strong> giữ nguyên toàn bộ câu hỏi, chấm điểm, nút làm lại và chạy ngay trên trình duyệt mà không cần LMS hay cài phần mềm.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="text-xs font-bold text-slate-900">
                  2 cách đưa vào PowerPoint (PPTX) khi đào tạo trực tuyến:
                </div>
                <ol className="space-y-2 text-xs text-slate-700 list-decimal pl-4 leading-relaxed">
                  <li>
                    <strong>Cách nhanh nhất (Không cần Add-in):</strong> Đặt file <code className="font-mono bg-slate-100 px-1 rounded">.html</code> vừa tải cùng thư mục với file <code className="font-mono bg-slate-100 px-1 rounded">.pptx</code>. Trên slide PowerPoint, chèn nút bấm hoặc ảnh bìa video → Chuột phải chọn <strong>Link / Hyperlink</strong> → trỏ tới file <code className="font-mono bg-slate-100 px-1 rounded">.html</code>. Khi đang share màn hình Zoom/MS Teams, bấm vào nút đó trình duyệt sẽ mở ngay bài giảng tương tác toàn màn hình.
                  </li>
                  <li>
                    <strong>Chạy nhúng ngay bên trong slide (Add-in Web Viewer):</strong> Trong PowerPoint chọn <em>Insert → Get Add-ins → tìm "Web Viewer"</em>, sau đó dán link của gói Web đã tải lên SharePoint / hosting nội bộ.
                  </li>
                </ol>
              </div>

              {uploadedSizeMb > 50 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Video tải lên nặng <strong>{uploadedSizeMb} MB</strong>. Với video lớn hơn 50 MB, bạn nên chọn <strong>Tải gói Web (.zip)</strong> bên dưới để tách riêng file video trong thư mục <code className="font-mono">media/</code> giúp mở mượt hơn.
                </div>
              )}
            </div>
          )}

          {course.videoSourceType === 'youtube' && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5 leading-relaxed">
              <div className="font-bold text-amber-900">
                Lưu ý quan trọng khi xuất bài giảng dùng video YouTube:
              </div>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Không mở file theo dạng <code className="font-mono">file://</code> trên ổ đĩa máy tính:</strong> YouTube sẽ báo <strong>Lỗi 153</strong> nếu bạn giải nén gói SCORM hoặc bấm đúp mở trực tiếp file <code className="font-mono">.html</code> từ máy tính.
                </li>
                <li>
                  <strong>Cách chạy chuẩn cho link YouTube:</strong> Tải thẳng gói <strong>SCORM (.zip)</strong> lên LMS (Moodle, Canvas...) hoặc tải file <code className="font-mono">.html</code> lên SharePoint / hosting <code className="font-mono">https://</code>.
                </li>
                <li>
                  <strong>Muốn mở file HTML chạy offline 100% từ máy tính / PowerPoint:</strong> Quay lại <em>Trình biên tập → tab Video → Tải video (.mp4) từ máy</em> rồi xuất lại.
                </li>
              </ul>
            </div>
          )}

          {/* Export Confirmation Banner */}
          {exportResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="text-xs font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Đã xuất thành công: {exportResult.filename} ({exportResult.sizeKb} KB)
                </span>
              </div>
              <p className="text-xs text-emerald-800">{exportResult.note}</p>
              {exportResult.files && (
                <div className="text-[11px] text-emerald-700 font-mono">
                  Thành phần: {exportResult.files.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {channel === 'scorm'
              ? 'Đóng gói sẵn sàng cho hệ thống eLearning chuẩn SCORM / xAPI.'
              : 'Chạy độc lập offline hoặc khi chia sẻ màn hình Zoom / MS Teams.'}
          </span>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Đóng
            </button>

            {channel === 'scorm' ? (
              <button
                type="button"
                disabled={isExporting || !hasVideo}
                onClick={handleExportScorm}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {isExporting
                    ? 'Đang đóng gói...'
                    : version === 'xapi'
                    ? 'Tải xuống gói xAPI (.zip)'
                    : `Tải xuống SCORM ${version} (.zip)`}
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isExporting || !hasVideo}
                  onClick={handleExportWebZip}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  <span>Gói Web (.zip)</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting || !hasVideo}
                  onClick={handleExportSingleHtml}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  <span>{isExporting ? 'Đang đóng gói...' : 'Tải 1 file Tương tác (.html)'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
