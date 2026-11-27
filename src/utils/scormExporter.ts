import JSZip from 'jszip';
import { CourseProject, ScormVersion } from '../types/course';
import { getVideoBlob, normalizeCourseVideoSource } from './storage';
import { generatePlayerHtml } from './playerTemplate';
import { generateScormApiWrapper, generateTincanXml, generateXapiWrapper } from './lmsBridges';

export type PackageStandard = ScormVersion | 'xapi';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function getUploadedMediaFilename(uploadedVideoName?: string): string {
  const extMatch = uploadedVideoName?.match(/\.(mp4|webm|ogg|mov)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
  return `media/lesson-video.${ext}`;
}

export function generateImsManifest(
  course: CourseProject,
  version: ScormVersion,
  assetFiles: string[]
): string {
  const safeId = course.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const title = escapeXml(course.title);
  const fileTags = assetFiles
    .map((f) => `      <file href="${escapeXml(f)}" />`)
    .join('\n');

  if (version === '2004') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST_${safeId}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
                      http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd
                      http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="ORG_${safeId}">
    <organization identifier="ORG_${safeId}">
      <title>${title}</title>
      <item identifier="ITEM_${safeId}" identifierref="RES_${safeId}" isvisible="true">
        <title>${title}</title>
        <imsss:sequencing>
          <imsss:objectives>
            <imsss:primaryObjective objectiveID="OBJ_${safeId}">
              <imsss:minNormalizedMeasure>${(course.passingScore / 100).toFixed(2)}</imsss:minNormalizedMeasure>
            </imsss:primaryObjective>
          </imsss:objectives>
          <imsss:deliveryControls completionSetByContent="true" objectiveSetByContent="true" />
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_${safeId}" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html" />
      <file href="scorm-api.js" />
      <file href="course-data.json" />
${fileTags}
    </resource>
  </resources>
</manifest>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST_${safeId}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_${safeId}">
    <organization identifier="ORG_${safeId}">
      <title>${title}</title>
      <item identifier="ITEM_${safeId}" identifierref="RES_${safeId}" isvisible="true">
        <title>${title}</title>
        <adlcp:masteryscore>${course.passingScore}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_${safeId}" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
      <file href="scorm-api.js" />
      <file href="course-data.json" />
${fileTags}
    </resource>
  </resources>
</manifest>`;
}

function makeCourseSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'interactive-video'
  );
}

type PackagedScene = NonNullable<CourseProject['builtInScenes']>[number] & { packagedImagePath?: string };
type PackagedCourse = CourseProject & { packagedVideoPath?: string };

/** Mã định danh hoạt động xAPI mặc định của khóa học (LMS có thể ghi đè bằng tham số activity_id khi khởi chạy). */
export function getDefaultXapiActivityId(course: CourseProject): string {
  return `urn:mm-lumicast:course:${course.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * Chuẩn bị dữ liệu khóa học để đóng gói:
 *  - mode 'files'  : video / ảnh được ghi thành file riêng trong zip (media/...)
 *  - mode 'inline' : nhúng thẳng vào HTML dưới dạng Data URI (file HTML đơn chạy offline)
 */
async function preparePackagedCourse(
  course: CourseProject,
  mode: 'files' | 'inline',
  zip?: JSZip
): Promise<{ packaged: PackagedCourse; assetFiles: string[] }> {
  course = normalizeCourseVideoSource(course);
  const packaged: PackagedCourse = JSON.parse(JSON.stringify(course));
  const assetFiles: string[] = [];

  if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
    const videoBlob = await getVideoBlob(course.uploadedVideoKey);
    if (videoBlob) {
      if (mode === 'files' && zip) {
        const mediaPath = getUploadedMediaFilename(course.uploadedVideoName);
        zip.file(mediaPath, videoBlob);
        packaged.packagedVideoPath = mediaPath;
        assetFiles.push(mediaPath);
      } else {
        packaged.packagedVideoPath = await blobToDataUrl(videoBlob);
      }
    }
  }

  if (course.videoSourceType === 'builtin' && packaged.builtInScenes) {
    const imageMap = new Map<string, string>();
    let imgCounter = 1;
    for (const scene of packaged.builtInScenes as PackagedScene[]) {
      if (!scene.imageUrl) continue;
      if (!imageMap.has(scene.imageUrl)) {
        try {
          const resp = await fetch(scene.imageUrl);
          if (resp.ok) {
            const imgBlob = await resp.blob();
            if (mode === 'files' && zip) {
              const outPath = `media/scene-${imgCounter}.jpg`;
              zip.file(outPath, imgBlob);
              assetFiles.push(outPath);
              imageMap.set(scene.imageUrl, outPath);
              imgCounter++;
            } else {
              imageMap.set(scene.imageUrl, await blobToDataUrl(imgBlob));
            }
          }
        } catch {
          // Bỏ qua ảnh không tải được
        }
      }
      const mapped = imageMap.get(scene.imageUrl);
      if (mapped) scene.packagedImagePath = mapped;
    }
  }

  return { packaged, assetFiles };
}

export async function buildScormPackageZip(
  course: CourseProject,
  version: ScormVersion
): Promise<{ blob: Blob; filename: string; files: string[] }> {
  const zip = new JSZip();
  const { packaged, assetFiles } = await preparePackagedCourse(course, 'files', zip);

  zip.file('imsmanifest.xml', generateImsManifest(course, version, assetFiles));
  zip.file('scorm-api.js', generateScormApiWrapper(version));
  zip.file('course-data.json', JSON.stringify(packaged, null, 2));
  zip.file(
    'index.html',
    generatePlayerHtml(JSON.stringify(packaged), {
      bridgeScript: '<script src="scorm-api.js"></script>',
      modeLabel: `SCORM ${version}`,
    })
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: `${makeCourseSlug(course.title)}-scorm-${version}.zip`,
    files: ['imsmanifest.xml', 'index.html', 'scorm-api.js', 'course-data.json', ...assetFiles],
  };
}

export async function buildXapiPackageZip(
  course: CourseProject
): Promise<{ blob: Blob; filename: string; files: string[] }> {
  const zip = new JSZip();
  const { packaged, assetFiles } = await preparePackagedCourse(course, 'files', zip);
  const activityId = getDefaultXapiActivityId(course);

  zip.file('tincan.xml', generateTincanXml(activityId, course.title, course.description || ''));
  zip.file('xapi-api.js', generateXapiWrapper(activityId, course.title));
  zip.file('course-data.json', JSON.stringify(packaged, null, 2));
  zip.file(
    'index.html',
    generatePlayerHtml(JSON.stringify(packaged), {
      bridgeScript: '<script src="xapi-api.js"></script>',
      modeLabel: 'xAPI (Tin Can)',
    })
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: `${makeCourseSlug(course.title)}-xapi.zip`,
    files: ['tincan.xml', 'index.html', 'xapi-api.js', 'course-data.json', ...assetFiles],
  };
}

export async function buildStandaloneInteractiveHtml(
  course: CourseProject
): Promise<{ blob: Blob; filename: string }> {
  const { packaged } = await preparePackagedCourse(course, 'inline');
  const html = generatePlayerHtml(JSON.stringify(packaged), {
    bridgeScript: '',
    modeLabel: 'Trình chiếu Tương tác (PPTX / Train Online)',
  });
  return {
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
    filename: `${makeCourseSlug(course.title)}-tuong-tac-pptx.html`,
  };
}

export async function buildWebBundleZip(
  course: CourseProject
): Promise<{ blob: Blob; filename: string; files: string[] }> {
  const zip = new JSZip();
  const { packaged, assetFiles } = await preparePackagedCourse(course, 'files', zip);
  zip.file(
    'index.html',
    generatePlayerHtml(JSON.stringify(packaged), {
      bridgeScript: '',
      modeLabel: 'Gói Web HTML5 (Train Online)',
    })
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: `${makeCourseSlug(course.title)}-web-pptx.zip`,
    files: ['index.html', ...assetFiles],
  };
}

/**
 * Bản xem trước chạy trong Studio (iframe): dùng đúng player của gói xuất.
 * - videoObjectUrl: URL tạm của video tải lên (blob:) để không phải nhúng cả file video vào HTML
 * - scormVersion: nếu có, nhúng cầu nối SCORM để màn "Giả lập LMS" ghi lại các lệnh gọi thật
 */
export function buildPreviewHtml(
  course: CourseProject,
  options: { videoObjectUrl?: string; scormVersion?: ScormVersion; embed?: boolean } = {}
): string {
  course = normalizeCourseVideoSource(course);
  const packaged: PackagedCourse = JSON.parse(JSON.stringify(course));
  if (course.videoSourceType === 'upload') {
    packaged.packagedVideoPath = options.videoObjectUrl || '';
  }
  const bridgeScript =
    '<script>window.LUMICAST_EPHEMERAL = true;</script>' +
    (options.scormVersion
      ? `<script>${generateScormApiWrapper(options.scormVersion).replace(/<\/(script)/gi, '<\\/$1')}</script>`
      : '');
  return generatePlayerHtml(JSON.stringify(packaged), {
    bridgeScript,
    modeLabel: options.scormVersion ? `Giả lập SCORM ${options.scormVersion}` : 'Xem trước',
    compactChrome: options.embed !== false,
  });
}
