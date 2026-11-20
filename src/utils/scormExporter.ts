import JSZip from 'jszip';
import { CourseProject, ScormVersion } from '../types/course';
import { getVideoBlob } from './storage';

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

function generateScormApiWrapper(version: ScormVersion): string {
  return `(function (global) {
  var VERSION = "${version}";
  var apiHandle = null;
  var initialized = false;
  var finished = false;
  var startTime = Date.now();
  var lastCompleted = false;

  function findAPI(win) {
    var attempts = 0;
    while (win && attempts < 15) {
      try {
        if (VERSION === "2004" && win.API_1484_11) return win.API_1484_11;
        if (VERSION === "1.2" && win.API) return win.API;
        if (win.API_1484_11) return win.API_1484_11;
        if (win.API) return win.API;
        if (win.parent && win.parent !== win) {
          win = win.parent;
        } else {
          break;
        }
      } catch (e) {
        break;
      }
      attempts++;
    }
    return null;
  }

  function getAPI() {
    if (apiHandle) return apiHandle;
    apiHandle = findAPI(window);
    if (!apiHandle && window.opener) {
      apiHandle = findAPI(window.opener);
    }
    return apiHandle;
  }

  function formatDuration(ms) {
    var totalSecs = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSecs / 3600);
    var m = Math.floor((totalSecs % 3600) / 60);
    var s = totalSecs % 60;
    if (VERSION === "2004") {
      return "PT" + h + "H" + m + "M" + s + "S";
    }
    return (
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0")
    );
  }

  global.ScormBridge = {
    init: function () {
      var api = getAPI();
      if (!api) return false;
      var ok = VERSION === "2004" ? api.Initialize("") : api.LMSInitialize("");
      initialized = ok === "true" || ok === true;
      if (initialized) {
        if (VERSION === "2004") {
          var currentStatus = api.GetValue("cmi.completion_status");
          if (!currentStatus || currentStatus === "unknown" || currentStatus === "not attempted") {
            api.SetValue("cmi.completion_status", "incomplete");
          }
          api.SetValue("cmi.exit", "suspend");
        } else {
          var status12 = api.LMSGetValue("cmi.core.lesson_status");
          if (!status12 || status12 === "not attempted") {
            api.LMSSetValue("cmi.core.lesson_status", "incomplete");
          }
          api.LMSSetValue("cmi.core.exit", "suspend");
        }
        this.commit();
      }
      return initialized;
    },
    setValue: function (key, value) {
      var api = getAPI();
      if (!api || !initialized || finished) return false;
      return VERSION === "2004"
        ? api.SetValue(key, String(value))
        : api.LMSSetValue(key, String(value));
    },
    getValue: function (key) {
      var api = getAPI();
      if (!api || !initialized || finished) return "";
      try {
        return VERSION === "2004" ? api.GetValue(key) : api.LMSGetValue(key);
      } catch (e) {
        return "";
      }
    },
    loadProgress: function (courseId) {
      var raw = "";
      var loc = "";
      if (initialized) {
        raw = this.getValue("cmi.suspend_data") || "";
        loc = this.getValue(VERSION === "2004" ? "cmi.location" : "cmi.core.lesson_location") || "";
      }
      if (!raw) {
        try {
          raw = localStorage.getItem("lumacast_scorm_local_" + (courseId || "default")) || "";
        } catch (e) {}
      }
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (loc && !parsed.time) parsed.time = Number(loc) || 0;
        return parsed;
      } catch (e) {
        return null;
      }
    },
    reportProgress: function (scorePct, passed, completed, suspendObj) {
      lastCompleted = Boolean(completed);
      var payload = suspendObj || {};
      var suspendStr = JSON.stringify(payload);
      try {
        localStorage.setItem("lumacast_scorm_local_" + (payload.courseId || "default"), suspendStr);
      } catch (e) {}

      var api = getAPI();
      if (!api || !initialized || finished) return;

      var locStr = String(Math.floor(payload.time || 0));
      if (VERSION === "2004") {
        api.SetValue("cmi.score.min", "0");
        api.SetValue("cmi.score.max", "100");
        api.SetValue("cmi.score.raw", String(scorePct));
        api.SetValue("cmi.score.scaled", (scorePct / 100).toFixed(2));
        api.SetValue("cmi.completion_status", completed ? "completed" : "incomplete");
        api.SetValue("cmi.success_status", completed ? (passed ? "passed" : "failed") : "unknown");
        api.SetValue("cmi.location", locStr);
        api.SetValue("cmi.exit", completed ? "normal" : "suspend");
        api.SetValue("cmi.session_time", formatDuration(Date.now() - startTime));
        api.SetValue("cmi.suspend_data", suspendStr);
      } else {
        api.LMSSetValue("cmi.core.score.min", "0");
        api.LMSSetValue("cmi.core.score.max", "100");
        api.LMSSetValue("cmi.core.score.raw", String(scorePct));
        api.LMSSetValue(
          "cmi.core.lesson_status",
          completed ? (passed ? "passed" : "failed") : "incomplete"
        );
        api.LMSSetValue("cmi.core.lesson_location", locStr);
        api.LMSSetValue("cmi.core.exit", completed ? "" : "suspend");
        api.LMSSetValue("cmi.core.session_time", formatDuration(Date.now() - startTime));
        api.LMSSetValue("cmi.suspend_data", suspendStr);
      }
      this.commit();
    },
    commit: function () {
      var api = getAPI();
      if (!api || !initialized || finished) return;
      if (VERSION === "2004") api.Commit("");
      else api.LMSCommit("");
    },
    finish: function () {
      var api = getAPI();
      if (!api || !initialized || finished) return;
      finished = true;
      if (VERSION === "2004") {
        api.SetValue("cmi.exit", lastCompleted ? "normal" : "suspend");
        api.SetValue("cmi.session_time", formatDuration(Date.now() - startTime));
        api.Commit("");
        api.Terminate("");
      } else {
        api.LMSSetValue("cmi.core.exit", lastCompleted ? "" : "suspend");
        api.LMSSetValue("cmi.core.session_time", formatDuration(Date.now() - startTime));
        api.LMSCommit("");
        api.LMSFinish("");
      }
      initialized = false;
    }
  };
})(window);`;
}

function generateStandalonePlayerHtml(
  courseJson: string,
  options: { includeScormScript: boolean; modeLabel: string }
): string {
  const scormScriptTag = options.includeScormScript
    ? '<script src="scorm-api.js"></script>'
    : '';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>Interactive Video Training</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.5; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 16px 20px 28px; }
    .header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .title { font-size: 19px; font-weight: 700; color: #0f172a; }
    .meta { font-size: 13px; color: #475569; }
    .score-pill { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; font-weight: 600; color: #0369a1; background: #ffffff; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; }
    .stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #020617; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; }
    .stage:fullscreen { border-radius: 0; border: none; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; display: block; }
    #ytWrap iframe { width: 100%; height: 100%; border: 0; display: block; }
    .video-error-box { position: absolute; inset: 0; z-index: 28; background: rgba(2,6,23,0.95); color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; gap: 10px; }
    .video-error-title { font-size: 15px; font-weight: 700; color: #fcd34d; }
    .video-error-desc { font-size: 12.5px; color: #cbd5e1; max-width: 540px; line-height: 1.55; }
    .video-error-link { display: inline-block; margin-top: 4px; padding: 8px 14px; border-radius: 8px; background: #0284c7; color: #fff; font-size: 12px; font-weight: 600; text-decoration: none; }
    .video-error-link:hover { background: #0369a1; }
    .builtin-scene { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 24px 28px; color: #fff; background-size: cover; background-position: center; transition: background-image 0.3s ease; }
    .builtin-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.58) 55%, rgba(2,6,23,0.22) 100%); pointer-events: none; }
    .builtin-top { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #cbd5e1; }
    .builtin-body { position: relative; z-index: 2; max-width: 560px; margin: auto 0; }
    .builtin-chap { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 4px; background: rgba(255,255,255,0.12); color: #7dd3fc; border: 1px solid rgba(255,255,255,0.18); margin-bottom: 10px; }
    .builtin-body h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; line-height: 1.3; }
    .builtin-body p { font-size: 14px; color: #e2e8f0; margin-bottom: 12px; }
    .builtin-body ul { list-style: disc; padding-left: 18px; font-size: 13px; color: #f1f5f9; }
    .builtin-body li { margin-bottom: 6px; }
    .scene-bars { position: relative; z-index: 2; display: flex; gap: 6px; padding-top: 8px; }
    .scene-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.22); border-radius: 999px; overflow: hidden; }
    .scene-bar-fill { height: 100%; background: #38bdf8; width: 0%; transition: width 0.15s linear; }
    .highlight-zone { position: absolute; z-index: 3; border: 2px solid rgba(251,191,36,0.92); background: rgba(251,191,36,0.12); border-radius: 8px; pointer-events: none; }
    .highlight-label { position: absolute; top: -24px; left: 0; background: #fbbf24; color: #0f172a; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
    .center-play { position: absolute; inset: 0; z-index: 20; background: rgba(2,6,23,0.35); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .center-play-circle { width: 66px; height: 66px; border-radius: 999px; background: #0284c7; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(0,0,0,0.4); font-size: 26px; padding-left: 4px; }
    .toast-banner { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 45; background: rgba(15,23,42,0.95); border: 1px solid rgba(251,191,36,0.6); color: #fde68a; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; box-shadow: 0 8px 20px rgba(0,0,0,0.35); max-width: 90%; text-align: center; }
    .resume-banner { position: absolute; bottom: 14px; left: 14px; right: 14px; z-index: 40; background: rgba(15,23,42,0.94); border: 1px solid rgba(56,189,248,0.45); color: #f8fafc; padding: 10px 14px; border-radius: 10px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
    .controls { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin-top: 12px; }
    .timeline { position: relative; height: 26px; display: flex; align-items: center; margin-bottom: 10px; }
    .track { position: relative; width: 100%; height: 8px; background: #e2e8f0; border-radius: 999px; cursor: pointer; }
    .fill { height: 100%; background: #0284c7; border-radius: 999px; width: 0%; pointer-events: none; }
    .pin { position: absolute; top: 50%; width: 14px; height: 14px; transform: translate(-50%, -50%) rotate(45deg); background: #0284c7; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer; z-index: 5; }
    .pin.done { background: #10b981; }
    .pin.wrong { background: #ef4444; }
    .btn-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .btn-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .btn { padding: 7px 13px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; color: #0f172a; }
    .btn:hover { background: #f1f5f9; }
    .btn-primary { background: #0284c7; border-color: #0284c7; color: #fff; }
    .btn-primary:hover { background: #0369a1; }
    .btn-dark { background: #0f172a; border-color: #0f172a; color: #fff; }
    .btn-dark:hover { background: #1e293b; }
    .btn-warn { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .select-rate { padding: 6px 8px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 12px; font-family: monospace; background: #fff; color: #0f172a; cursor: pointer; }
    .time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #475569; margin-left: 4px; }
    .overlay { position: absolute; inset: 0; z-index: 30; background: rgba(2,6,23,0.75); display: flex; align-items: center; justify-content: center; padding: 12px; overflow: hidden; }
    .card { width: 100%; max-width: 560px; max-height: 100%; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.35); display: flex; flex-direction: column; }
    .card-head { flex-shrink: 0; padding: 9px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 600; color: #0369a1; }
    .card-body { flex: 1 1 auto; min-height: 0; padding: 14px 16px; overflow-y: auto; }
    .card-body h3 { font-size: 15px; font-weight: 700; margin-bottom: 5px; color: #0f172a; }
    .card-body p.prompt { font-size: 14.5px; font-weight: 600; color: #0f172a; margin-bottom: 12px; line-height: 1.45; }
    .opt { width: 100%; text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; margin-bottom: 6px; cursor: pointer; font-size: 13px; display: block; color: #0f172a; }
    .opt.selected { border-color: #0284c7; background: #f0f9ff; }
    .opt.correct { border-color: #10b981; background: #ecfdf5; }
    .opt.incorrect { border-color: #ef4444; background: #fef2f2; }
    .card-foot { flex-shrink: 0; padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .feedback { padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-top: 10px; }
    .feedback.ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .feedback.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .hotspot-bar { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 35; background: rgba(2,6,23,0.92); color: #fff; padding: 12px 16px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid rgba(255,255,255,0.15); }
    .hotspot-foot { position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 35; background: #fff; color: #0f172a; padding: 12px 16px; border-radius: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .hotspot-area { position: absolute; inset: 0; z-index: 32; cursor: crosshair; }
    .hotspot-target { position: absolute; border: 2px solid #10b981; background: rgba(16,185,129,0.2); border-radius: 6px; pointer-events: none; }
    .hotspot-dot { position: absolute; width: 22px; height: 22px; border-radius: 999px; border: 2px solid #fff; transform: translate(-50%, -50%); pointer-events: none; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
    .pin-btn { position: absolute; z-index: 25; transform: translate(-50%, -50%); padding: 7px 12px; border-radius: 8px; background: #0284c7; color: #fff; border: 2px solid #bae6fd; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .blank-box { padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; line-height: 2.1; }
    .blank-input { padding: 3px 8px; border: 1px solid #94a3b8; border-radius: 6px; font-size: 13px; width: 125px; margin: 0 4px; }
    .drag-slot { display: inline-flex; align-items: center; justify-content: center; min-width: 110px; margin: 0 5px; padding: 3px 10px; border: 2px dashed #cbd5e1; border-radius: 8px; background: #fff; font-size: 12px; font-weight: 600; color: #94a3b8; cursor: pointer; vertical-align: middle; }
    .drag-slot.focus, .drag-slot.over { border-color: #0284c7; background: #e0f2fe; color: #0369a1; }
    .drag-slot.filled { border-style: solid; border-color: #0284c7; background: #f0f9ff; color: #0c4a6e; }
    .drag-slot.ok { border-style: solid; border-color: #10b981; background: #ecfdf5; color: #065f46; }
    .drag-slot.bad { border-style: solid; border-color: #ef4444; background: #fef2f2; color: #991b1b; }
    .drag-bank { margin-top: 12px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
    .drag-bank-title { font-size: 12px; color: #475569; margin-bottom: 8px; font-weight: 500; }
    .drag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .word-chip { padding: 6px 11px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #0f172a; cursor: grab; }
    .word-chip:hover { border-color: #0284c7; background: #f0f9ff; color: #0369a1; }
    .word-chip.used { opacity: 0.45; text-decoration: line-through; cursor: default; background: #f1f5f9; }
    .subtitle-overlay { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 22; max-width: 88%; padding: 7px 14px; border-radius: 8px; background: rgba(2,6,23,0.86); border: 1px solid rgba(255,255,255,0.14); color: #fff; font-size: 14px; font-weight: 500; text-align: center; line-height: 1.45; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
    .cc-wrap { display: inline-flex; align-items: center; gap: 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 3px 6px; font-size: 12px; color: #334155; }
    .cc-seg { display: inline-flex; align-items: center; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px; }
    .cc-btn { border: none; background: transparent; padding: 3px 9px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #475569; cursor: pointer; }
    .cc-btn.active-on { background: #0284c7; color: #fff; }
    .cc-btn.active-off { background: #0f172a; color: #fff; }
    .q-img { width: 100%; max-height: 170px; object-fit: contain; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; display: block; }
    .checkpoint-list { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-top: 12px; }
    .checkpoint-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 10px; }
    .cp-item { text-align: left; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; }
    .cp-item:hover { border-color: #38bdf8; background: #f0f9ff; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="title" id="courseTitle"></div>
        <div class="meta" id="courseMeta"></div>
      </div>
      <div class="score-pill" id="scoreBadge">Điểm: 0%</div>
    </div>

    <div class="stage" id="stage">
      <video id="videoEl" class="hidden" playsinline></video>
      <div id="ytWrap" class="hidden" style="position:relative;width:100%;height:100%;background:#000">
        <div id="ytPlayerMount" style="width:100%;height:100%"></div>
        <div style="position:absolute;inset:0;z-index:10"></div>
      </div>
      <div id="videoErrorBox" class="video-error-box hidden"></div>
      <div id="builtinScene" class="builtin-scene hidden">
        <div class="builtin-scrim"></div>
        <div class="builtin-top">
          <span id="sceneCourseName"></span>
          <span id="sceneTimerText" style="font-family:monospace">00:00 / 00:00</span>
        </div>
        <div class="builtin-body">
          <div class="builtin-chap" id="sceneChap"></div>
          <h2 id="sceneTitle"></h2>
          <p id="sceneSub"></p>
          <ul id="sceneBullets"></ul>
        </div>
        <div id="highlightZone" class="highlight-zone hidden"><span id="highlightLabel" class="highlight-label"></span></div>
        <div class="scene-bars" id="sceneBars"></div>
      </div>
      <button type="button" class="center-play" id="centerPlayBtn" aria-label="Phát video">
        <span class="center-play-circle">&#9654;</span>
      </button>
      <div id="toastBanner" class="toast-banner hidden"></div>
      <div id="resumeBanner" class="resume-banner hidden">
        <span id="resumeText"></span>
        <div class="btn-group">
          <button type="button" class="btn btn-primary" id="resumeContinueBtn">Học tiếp</button>
          <button type="button" class="btn" id="resumeRestartBtn">Học lại từ đầu</button>
        </div>
      </div>
      <div id="subtitleBox" class="subtitle-overlay hidden"></div>
      <div id="overlayRoot"></div>
    </div>

    <div class="controls">
      <div class="timeline">
        <div class="track" id="track">
          <div class="fill" id="fill"></div>
        </div>
      </div>
      <div class="btn-row">
        <div class="btn-group">
          <button type="button" class="btn btn-dark" id="playBtn">Phát video</button>
          <span class="time" id="timeText">00:00 / 00:00</span>
          <button type="button" class="btn hidden" id="muteBtn">Tắt tiếng</button>
        </div>
        <div class="btn-group">
          <div id="ccWrap" class="cc-wrap hidden">
            <span style="font-weight:600">Phụ đề:</span>
            <div class="cc-seg" role="group" aria-label="Bật hoặc tắt phụ đề">
              <button type="button" class="cc-btn" id="ccOnBtn">Bật</button>
              <button type="button" class="cc-btn" id="ccOffBtn">Tắt</button>
            </div>
          </div>
          <select class="select-rate" id="rateSelect" aria-label="Tốc độ phát">
            <option value="0.75">0.75x</option>
            <option value="1" selected>1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </select>
          <button type="button" class="btn" id="summaryBtn">Bảng điểm</button>
          <button type="button" class="btn" id="fullscreenBtn">Toàn màn hình</button>
        </div>
      </div>
    </div>

    <div class="checkpoint-list">
      <div class="meta" style="font-weight:600;color:#334155" id="cpHeader">Danh sách điểm tương tác</div>
      <div class="checkpoint-grid" id="cpGrid"></div>
    </div>
  </div>

  ${scormScriptTag}
  <script>
    var COURSE = ${courseJson};
    var SORTED = (COURSE.interactions || []).slice().sort(function (a, b) { return a.timestamp - b.timestamp; });
    var state = {
      playing: false,
      time: 0,
      prevTime: 0,
      duration: COURSE.duration || 60,
      rate: 1,
      muted: false,
      subtitlesEnabled: COURSE.subtitlesEnabledByDefault !== false,
      answers: {},
      attempts: {},
      triggered: {},
      activeId: null,
      expanded: false,
      summary: false
    };

    var stageEl = document.getElementById("stage");
    var videoEl = document.getElementById("videoEl");
    var builtinEl = document.getElementById("builtinScene");
    var overlayRoot = document.getElementById("overlayRoot");
    var subtitleBox = document.getElementById("subtitleBox");
    var ccWrap = document.getElementById("ccWrap");
    var ccOnBtn = document.getElementById("ccOnBtn");
    var ccOffBtn = document.getElementById("ccOffBtn");
    var trackEl = document.getElementById("track");
    var fillEl = document.getElementById("fill");
    var playBtn = document.getElementById("playBtn");
    var muteBtn = document.getElementById("muteBtn");
    var centerPlayBtn = document.getElementById("centerPlayBtn");
    var timeText = document.getElementById("timeText");
    var scoreBadge = document.getElementById("scoreBadge");
    var toastEl = document.getElementById("toastBanner");
    var resumeBanner = document.getElementById("resumeBanner");
    var toastTimer = null;

    document.getElementById("courseTitle").textContent = COURSE.title;
    document.getElementById("courseMeta").textContent =
      "${options.modeLabel} · Chuẩn đạt: " + COURSE.passingScore + "% · " + SORTED.length + " điểm tương tác";
    document.getElementById("sceneCourseName").textContent = COURSE.title;

    function fmt(sec) {
      sec = Math.max(0, Math.floor(sec));
      return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
    }

    function showToast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.remove("hidden");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.add("hidden"); }, 3500);
    }

    function shuffleDeterministic(items, seedStr) {
      if (!items || items.length <= 1) return (items || []).slice();
      var arr = items.slice();
      var seed = 0;
      for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000;
      for (var i = arr.length - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        var j = seed % (i + 1);
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      if (arr.every(function (v, idx) { return v === items[idx]; }) && arr.length >= 2) {
        var t = arr[0]; arr[0] = arr[1]; arr[1] = t;
      }
      return arr;
    }

    function parseBlanks(sentence) {
      var parts = [];
      var regex = /\\*([^*]+)\\*/g;
      var last = 0, idx = 0, m;
      while ((m = regex.exec(sentence || "")) !== null) {
        if (m.index > last) parts.push({ type: "text", value: sentence.slice(last, m.index) });
        parts.push({ type: "blank", value: m[1], index: idx++ });
        last = regex.lastIndex;
      }
      if (last < (sentence || "").length) parts.push({ type: "text", value: sentence.slice(last) });
      return parts;
    }

    function buildWordBank(item) {
      var targets = parseBlanks(item.blankSentence || "").filter(function (p) { return p.type === "blank"; }).map(function (p) { return p.value.trim(); }).filter(Boolean);
      var dist = (item.distractorWords || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
      var combined = targets.concat(dist);
      if (combined.length <= 1) return combined;
      var arr = combined.slice();
      var seed = 0;
      var seedStr = item.id || "drag";
      for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000;
      for (var i = arr.length - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        var j = seed % (i + 1);
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    }

    function loadSavedProgress() {
      var saved = null;
      if (window.ScormBridge && window.ScormBridge.loadProgress) {
        saved = window.ScormBridge.loadProgress(COURSE.id);
      } else {
        try {
          var raw = localStorage.getItem("lumacast_standalone_" + COURSE.id);
          if (raw) saved = JSON.parse(raw);
        } catch (e) {}
      }
      if (saved && (Object.keys(saved.answers || {}).length > 0 || (saved.time && saved.time > 2))) {
        state.answers = saved.answers || {};
        state.attempts = saved.attempts || {};
        SORTED.forEach(function (it) {
          if (state.answers[it.id] && !state.attempts[it.id]) {
            state.attempts[it.id] = state.answers[it.id].attemptsUsed || 1;
          }
          if (state.answers[it.id] || it.timestamp < (saved.time || 0)) {
            state.triggered[it.id] = true;
          }
        });
        var savedTime = Math.min(state.duration, saved.time || 0);
        document.getElementById("resumeText").textContent =
          "Đã lưu tiến độ tại " + fmt(savedTime) + " (" + Object.keys(state.answers).length + " tương tác đã làm).";
        resumeBanner.classList.remove("hidden");
        document.getElementById("resumeContinueBtn").onclick = function () {
          resumeBanner.classList.add("hidden");
          seekVideo(savedTime, true);
          playVideo();
        };
        document.getElementById("resumeRestartBtn").onclick = function () {
          resumeBanner.classList.add("hidden");
          resetCourse();
        };
      }
    }

    if (window.ScormBridge) {
      window.ScormBridge.init();
      window.addEventListener("pagehide", function () { window.ScormBridge.finish(); });
      window.addEventListener("beforeunload", function () { window.ScormBridge.finish(); });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          syncProgress(false);
        }
      });
    }

    var videoErrorBox = document.getElementById("videoErrorBox");
    function showVideoError(title, desc, linkHref, linkLabel) {
      centerPlayBtn.classList.add("hidden");
      videoErrorBox.innerHTML = "";
      var tEl = document.createElement("div");
      tEl.className = "video-error-title";
      tEl.textContent = title;
      var dEl = document.createElement("p");
      dEl.className = "video-error-desc";
      dEl.textContent = desc;
      videoErrorBox.appendChild(tEl);
      videoErrorBox.appendChild(dEl);
      if (linkHref) {
        var aEl = document.createElement("a");
        aEl.className = "video-error-link";
        aEl.href = linkHref;
        aEl.target = "_blank";
        aEl.rel = "noopener noreferrer";
        aEl.textContent = linkLabel || "Mở video trên YouTube";
        videoErrorBox.appendChild(aEl);
      }
      videoErrorBox.classList.remove("hidden");
    }

    var ytPlayer = null;
    if (COURSE.videoSourceType === "builtin") {
      builtinEl.classList.remove("hidden");
    } else if (COURSE.videoSourceType === "youtube" && COURSE.youtubeId) {
      document.getElementById("ytWrap").classList.remove("hidden");
      muteBtn.classList.remove("hidden");
      var isFileProto = window.location.protocol === "file:";
      var isHttpProto = window.location.protocol === "http:" || window.location.protocol === "https:";
      var ytWatchUrl = "https://www.youtube.com/watch?v=" + COURSE.youtubeId;
      if (isFileProto) {
        showVideoError(
          "Không thể phát video YouTube khi mở file trực tiếp trên máy (Lỗi 153)",
          "YouTube chặn nhúng video khi file HTML được mở theo đường dẫn file:// trên ổ đĩa. Để chạy được video: (1) Tải gói SCORM .zip lên LMS (Moodle/Canvas...) hoặc tải file HTML lên web HTTPS (SharePoint, Vercel, Netlify...); HOẶC (2) Quay lại Lumi Cast Studio chọn Video từ máy (.mp4) rồi xuất lại file HTML để chạy offline hoàn toàn.",
          ytWatchUrl,
          "Mở video gốc trên YouTube"
        );
      } else {
        window.onYouTubeIframeAPIReady = function () {
          var pVars = { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, enablejsapi: 1 };
          if (isHttpProto) {
            pVars.origin = window.location.origin;
            pVars.widget_referrer = window.location.href;
          }
          ytPlayer = new window.YT.Player("ytPlayerMount", {
            width: "100%",
            height: "100%",
            host: "https://www.youtube.com",
            videoId: COURSE.youtubeId,
            playerVars: pVars,
            events: {
              onReady: function (e) {
                try {
                  var fr = e.target.getIframe && e.target.getIframe();
                  if (fr) fr.referrerPolicy = "strict-origin-when-cross-origin";
                } catch (err) {}
                var d = e.target.getDuration();
                if (d && isFinite(d)) { state.duration = d; renderPins(); renderCheckpointCards(); }
              },
              onStateChange: function (e) {
                if (e.data === 1) {
                  videoErrorBox.classList.add("hidden");
                  state.playing = true; playBtn.textContent = "Tạm dừng"; centerPlayBtn.classList.add("hidden");
                  var d = e.target.getDuration(); if (d && isFinite(d)) state.duration = d;
                } else if (e.data === 2) {
                  state.playing = false; playBtn.textContent = "Phát video";
                } else if (e.data === 0) {
                  pauseVideo(); state.summary = true; renderOverlay(); syncProgress(true);
                }
              },
              onError: function (e) {
                var code = e && e.data;
                if (code === 153) {
                  showVideoError(
                    "YouTube chặn nhúng trong khung trình phát hiện tại (Lỗi 153)",
                    "Hệ thống LMS hoặc trình duyệt hiện đang ẩn thông tin nguồn (Referer) khi tải khung iframe. Hãy kiểm tra cấu hình LMS cho phép gửi Referer hoặc tải tệp video .mp4 trực tiếp vào bài giảng rồi xuất lại gói SCORM.",
                    ytWatchUrl,
                    "Mở video gốc trên YouTube"
                  );
                } else if (code === 101 || code === 150) {
                  showVideoError(
                    "Video YouTube không cho phép nhúng ngoài (Lỗi " + code + ")",
                    "Chủ sở hữu video này đã tắt quyền nhúng trên website/LMS khác. Vui lòng dùng video khác hoặc tải tệp .mp4 lên Lumi Cast Studio.",
                    ytWatchUrl,
                    "Xem trực tiếp trên YouTube"
                  );
                } else {
                  showVideoError(
                    "Không tải được video YouTube (Mã lỗi " + code + ")",
                    "Vui lòng kiểm tra kết nối Internet hoặc thay thế bằng tệp video .mp4.",
                    ytWatchUrl,
                    "Mở video trên YouTube"
                  );
                }
              }
            }
          });
          try {
            var initFrame = ytPlayer.getIframe && ytPlayer.getIframe();
            if (initFrame) initFrame.referrerPolicy = "strict-origin-when-cross-origin";
          } catch (err) {}
          setInterval(function () {
            if (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 1) {
              state.time = ytPlayer.getCurrentTime();
              onTick();
            }
          }, 120);
        };
        var ytTag = document.createElement("script");
        ytTag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(ytTag);
      }
    } else {
      videoEl.classList.remove("hidden");
      muteBtn.classList.remove("hidden");
      videoEl.src = COURSE.packagedVideoPath || COURSE.videoUrl || "";
      videoEl.addEventListener("loadedmetadata", function () {
        if (videoEl.duration && isFinite(videoEl.duration)) state.duration = videoEl.duration;
        renderPins();
        renderCheckpointCards();
      });
      videoEl.addEventListener("timeupdate", function () {
        state.time = videoEl.currentTime;
        onTick();
      });
      videoEl.addEventListener("ended", function () {
        pauseVideo();
        state.summary = true;
        renderOverlay();
        syncProgress(true);
      });
      videoEl.addEventListener("error", function () {
        showVideoError(
          "Không thể mở nguồn video",
          "Nếu bạn đang mở file từ trong tệp .zip, hãy giải nén toàn bộ thư mục trước khi mở index.html. Nếu dùng link MP4 ngoài, hãy kiểm tra lại đường dẫn hoặc quyền truy cập CORS của máy chủ chứa video.",
          "",
          ""
        );
      });
    }

    function renderBuiltinScene() {
      if (COURSE.videoSourceType !== "builtin") return;
      var scenes = COURSE.builtInScenes || [];
      if (!scenes.length) return;
      var scIdx = scenes.length - 1;
      for (var i = 0; i < scenes.length; i++) {
        if (state.time >= scenes[i].startTime && state.time < scenes[i].endTime) { scIdx = i; break; }
      }
      var sc = scenes[scIdx];
      var imgSrc = sc.packagedImagePath || sc.imageUrl || "";
      if (imgSrc) builtinEl.style.backgroundImage = "url('" + imgSrc + "')";
      document.getElementById("sceneChap").textContent = "Phân đoạn " + (scIdx + 1) + " / " + scenes.length;
      document.getElementById("sceneTitle").textContent = sc.title;
      document.getElementById("sceneSub").textContent = sc.subtitle;
      document.getElementById("sceneTimerText").textContent = fmt(state.time) + " / " + fmt(state.duration);
      var ul = document.getElementById("sceneBullets");
      ul.innerHTML = "";
      (sc.bulletPoints || []).forEach(function (b) {
        var li = document.createElement("li"); li.textContent = b; ul.appendChild(li);
      });
      var hz = document.getElementById("highlightZone");
      if (sc.highlightZone) {
        hz.classList.remove("hidden");
        hz.style.left = sc.highlightZone.x + "%";
        hz.style.top = sc.highlightZone.y + "%";
        hz.style.width = sc.highlightZone.w + "%";
        hz.style.height = sc.highlightZone.h + "%";
        document.getElementById("highlightLabel").textContent = sc.highlightZone.label;
      } else {
        hz.classList.add("hidden");
      }
      var bars = document.getElementById("sceneBars");
      bars.innerHTML = "";
      scenes.forEach(function (sItem) {
        var b = document.createElement("div"); b.className = "scene-bar";
        var f = document.createElement("div"); f.className = "scene-bar-fill";
        var span = Math.max(1, sItem.endTime - sItem.startTime);
        var pct = state.time >= sItem.endTime ? 100 : state.time <= sItem.startTime ? 0 : Math.round(((state.time - sItem.startTime) / span) * 100);
        f.style.width = pct + "%";
        b.appendChild(f);
        bars.appendChild(b);
      });
    }

    function getCleanLabel(it) {
      return it.title && it.title.indexOf("Điểm tương tác mới") !== 0
        ? it.title
        : (it.prompt || "Câu hỏi tương tác");
    }

    function renderPins() {
      trackEl.querySelectorAll(".pin").forEach(function (el) { el.remove(); });
      SORTED.forEach(function (item) {
        var pin = document.createElement("button");
        pin.type = "button";
        pin.className = "pin";
        var ans = state.answers[item.id];
        if (ans) pin.className += ans.isCorrect ? " done" : " wrong";
        pin.style.left = Math.min(98, Math.max(2, (item.timestamp / state.duration) * 100)) + "%";
        pin.title = fmt(item.timestamp) + " · " + getCleanLabel(item);
        pin.onclick = function (e) {
          e.stopPropagation();
          openCheckpoint(item);
        };
        trackEl.appendChild(pin);
      });
    }

    function renderCheckpointCards() {
      var grid = document.getElementById("cpGrid");
      grid.innerHTML = "";
      document.getElementById("cpHeader").textContent =
        "Danh sách điểm tương tác (" + SORTED.length + ")" + (COURSE.preventSkipping ? " · Bắt buộc làm theo thứ tự" : "");
      SORTED.forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cp-item";
        var ans = state.answers[item.id];
        var statusTxt = item.type === "info" ? "Ghi chú" : ans ? (ans.isCorrect ? "Đúng (+" + ans.earned + ")" : "Sai (0)") : "Chưa làm";
        var statusColor = item.type === "info" ? "#64748b" : ans ? (ans.isCorrect ? "#059669" : "#dc2626") : "#d97706";
        btn.innerHTML = '<div style="min-width:0"><div style="font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + getCleanLabel(item) + '</div><div style="color:#0369a1;font-family:monospace;font-size:11px">' + fmt(item.timestamp) + '</div></div><span style="font-weight:600;color:' + statusColor + ';white-space:nowrap">' + statusTxt + '</span>';
        btn.onclick = function () { openCheckpoint(item); };
        grid.appendChild(btn);
      });
    }

    function computeScore() {
      var gradable = SORTED.filter(function (i) { return i.type !== "info"; });
      var maxPts = gradable.reduce(function (s, i) { return s + (i.points || 0); }, 0);
      var earned = gradable.reduce(function (s, i) { return s + (state.answers[i.id] ? state.answers[i.id].earned : 0); }, 0);
      var pct = maxPts > 0 ? Math.round((earned / maxPts) * 100) : 100;
      var answered = gradable.filter(function (i) { return !!state.answers[i.id]; }).length;
      return {
        pct: pct,
        earned: earned,
        max: maxPts,
        answered: answered,
        totalGradable: gradable.length,
        passed: pct >= COURSE.passingScore && (answered === gradable.length || gradable.length === 0),
        allAnswered: answered === gradable.length
      };
    }

    function syncProgress(completedFlag) {
      var sc = computeScore();
      var isDone = Boolean(completedFlag) || (state.time >= state.duration - 0.5 && sc.allAnswered);
      scoreBadge.textContent = "Điểm: " + sc.pct + "% (" + sc.earned + "/" + sc.max + ")";
      var suspendObj = {
        courseId: COURSE.id,
        time: Math.floor(state.time),
        answers: state.answers,
        attempts: state.attempts
      };
      try {
        localStorage.setItem("lumacast_standalone_" + COURSE.id, JSON.stringify(suspendObj));
      } catch (e) {}
      if (window.ScormBridge) {
        window.ScormBridge.reportProgress(sc.pct, sc.passed, isDone, suspendObj);
      }
    }

    function updateSubtitleControls() {
      var subs = COURSE.subtitles || [];
      if (!subs.length) {
        ccWrap.classList.add("hidden");
        subtitleBox.classList.add("hidden");
        return;
      }
      ccWrap.classList.remove("hidden");
      ccOnBtn.className = "cc-btn" + (state.subtitlesEnabled ? " active-on" : "");
      ccOffBtn.className = "cc-btn" + (!state.subtitlesEnabled ? " active-off" : "");
      renderSubtitleCue();
    }

    function renderSubtitleCue() {
      var subs = COURSE.subtitles || [];
      if (!state.subtitlesEnabled || !subs.length || state.summary || (state.activeId && state.expanded)) {
        subtitleBox.classList.add("hidden");
        return;
      }
      var cue = subs.find(function (c) {
        return state.time >= c.startTime && state.time <= c.endTime;
      });
      if (cue) {
        subtitleBox.textContent = cue.text;
        subtitleBox.classList.remove("hidden");
      } else {
        subtitleBox.classList.add("hidden");
      }
    }

    function playVideo() {
      resumeBanner.classList.add("hidden");
      if (state.time >= state.duration - 0.2) seekVideo(0, true);
      state.summary = false;
      state.playing = true;
      playBtn.textContent = "Tạm dừng";
      centerPlayBtn.classList.add("hidden");
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.playVideo) {
        ytPlayer.setPlaybackRate(state.rate);
        ytPlayer.playVideo();
      } else if (COURSE.videoSourceType !== "builtin") {
        videoEl.playbackRate = state.rate;
        videoEl.play().catch(function () {});
      }
    }

    function pauseVideo() {
      state.playing = false;
      playBtn.textContent = "Phát video";
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.pauseVideo) {
        ytPlayer.pauseVideo();
      } else if (COURSE.videoSourceType !== "builtin") {
        videoEl.pause();
      }
    }

    function seekVideo(t, bypass) {
      t = Math.max(0, Math.min(state.duration, t));
      if (COURSE.preventSkipping && !bypass && t > state.time) {
        var blocker = SORTED.find(function (i) {
          return i.type !== "info" && i.timestamp > state.time + 0.5 && i.timestamp < t && !state.answers[i.id];
        });
        if (blocker) {
          showToast('Vui lòng hoàn thành "' + blocker.title + '" tại ' + fmt(blocker.timestamp) + ' trước khi tua tiếp.');
          return;
        }
      }
      state.prevTime = t;
      state.time = t;
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.seekTo) {
        ytPlayer.seekTo(t, true);
      } else if (COURSE.videoSourceType !== "builtin") {
        videoEl.currentTime = t;
      }
      SORTED.forEach(function (it) {
        if (it.timestamp >= t - 0.3) delete state.triggered[it.id];
      });
      onTick();
    }

    function openCheckpoint(item) {
      pauseVideo();
      seekVideo(item.timestamp, true);
      state.activeId = item.id;
      state.expanded = true;
      state.summary = false;
      renderOverlay();
    }

    function resetCourse() {
      pauseVideo();
      state.answers = {};
      state.attempts = {};
      state.triggered = {};
      state.activeId = null;
      state.expanded = false;
      state.summary = false;
      seekVideo(0, true);
      renderPins();
      renderCheckpointCards();
      renderOverlay();
      syncProgress(false);
      centerPlayBtn.classList.remove("hidden");
    }

    playBtn.onclick = function () { state.playing ? pauseVideo() : playVideo(); };
    centerPlayBtn.onclick = playVideo;
    muteBtn.onclick = function () {
      state.muted = !state.muted;
      if (COURSE.videoSourceType === "youtube" && ytPlayer) {
        if (state.muted) ytPlayer.mute();
        else ytPlayer.unMute();
      } else {
        videoEl.muted = state.muted;
      }
      muteBtn.textContent = state.muted ? "Bật tiếng" : "Tắt tiếng";
    };
    document.getElementById("rateSelect").onchange = function (e) {
      state.rate = Number(e.target.value) || 1;
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(state.rate);
      else if (COURSE.videoSourceType !== "builtin") videoEl.playbackRate = state.rate;
    };
    document.getElementById("summaryBtn").onclick = function () {
      pauseVideo();
      state.summary = !state.summary;
      renderOverlay();
    };
    document.getElementById("fullscreenBtn").onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else if (stageEl.requestFullscreen) stageEl.requestFullscreen().catch(function () {});
    };

    trackEl.onclick = function (e) {
      var rect = trackEl.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekVideo(pct * state.duration, false);
    };

    ccOnBtn.onclick = function () { state.subtitlesEnabled = true; updateSubtitleControls(); };
    ccOffBtn.onclick = function () { state.subtitlesEnabled = false; updateSubtitleControls(); };

    document.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
      if (e.code === "Space") { e.preventDefault(); state.playing ? pauseVideo() : playVideo(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); seekVideo(state.time - 5, true); }
      else if (e.code === "ArrowRight") { e.preventDefault(); seekVideo(state.time + 5, false); }
      else if (e.key === "f" || e.key === "F") { document.getElementById("fullscreenBtn").click(); }
      else if (e.key === "c" || e.key === "C") { state.subtitlesEnabled = !state.subtitlesEnabled; updateSubtitleControls(); }
    });

    var lastPerf = performance.now();
    setInterval(function () {
      var now = performance.now();
      var dt = ((now - lastPerf) / 1000) * state.rate;
      lastPerf = now;
      if (COURSE.videoSourceType === "builtin" && state.playing) {
        state.time += dt;
        if (state.time >= state.duration) {
          state.time = state.duration;
          pauseVideo();
          state.summary = true;
          renderOverlay();
          syncProgress(true);
        }
        onTick();
      }
    }, 80);

    // Periodic 15s auto-commit for LMS safety
    setInterval(function () {
      if (state.playing) syncProgress(false);
    }, 15000);

    function onTick() {
      var prevT = state.prevTime;
      state.prevTime = state.time;

      fillEl.style.width = Math.min(100, (state.time / state.duration) * 100) + "%";
      timeText.textContent = fmt(state.time) + " / " + fmt(state.duration);
      renderBuiltinScene();
      renderSubtitleCue();

      if (state.playing) {
        for (var i = 0; i < SORTED.length; i++) {
          var item = SORTED[i];
          var crossed = (prevT < item.timestamp && state.time >= item.timestamp) || (state.time >= item.timestamp && state.time <= item.timestamp + 0.6);
          if (!state.triggered[item.id] && crossed) {
            state.triggered[item.id] = true;
            state.activeId = item.id;
            state.expanded = item.displayMode === "poster" || item.type === "hotspot";
            if (item.pauseVideo) pauseVideo();
            renderOverlay();
            break;
          }
        }
        if (state.activeId && !state.expanded) {
          var activePin = SORTED.find(function (x) { return x.id === state.activeId; });
          if (activePin && state.time > activePin.timestamp + (activePin.duration || 6)) {
            state.activeId = null;
            renderOverlay();
          }
        }
      }
    }

    function renderOverlay() {
      overlayRoot.innerHTML = "";
      renderSubtitleCue();
      if (state.summary) {
        var sc = computeScore();
        var missingCount = sc.totalGradable - sc.answered;
        var div = document.createElement("div");
        div.className = "overlay";
        var missingHtml = missingCount > 0 ? '<div class="feedback bad" style="margin-bottom:12px">Bạn còn <strong>' + missingCount + '</strong> câu hỏi bắt buộc chưa hoàn thành. Nhấn vào từng mục bên dưới để làm nốt.</div>' : '';
        var listHtml = SORTED.map(function (it) {
          var a = state.answers[it.id];
          var tag = it.type === "info" ? "Ghi chú" : a ? (a.isCorrect ? "Đạt +" + a.earned : "Chưa đúng (0)") : "Chưa làm";
          return '<button type="button" class="opt" data-jump-id="' + it.id + '" style="display:flex;justify-content:space-between"><span>' + fmt(it.timestamp) + ' · ' + getCleanLabel(it) + '</span><strong>' + tag + '</strong></button>';
        }).join("");
        div.innerHTML = '<div class="card"><div class="card-head"><span>TỔNG KẾT KHÓA HỌC</span><span>' + (sc.passed ? "ĐẠT CHUẨN" : "CHƯA ĐẠT") + '</span></div><div class="card-body"><h3>' + COURSE.title + '</h3><p class="prompt">Kết quả: <strong>' + sc.pct + '%</strong> (' + sc.earned + '/' + sc.max + ' điểm). Chuẩn yêu cầu: ' + COURSE.passingScore + '%.</p>' + missingHtml + listHtml + '</div><div class="card-foot"><button type="button" class="btn" id="sumRestartBtn">Học lại từ đầu</button><button type="button" class="btn btn-primary" id="closeSumBtn">Đóng</button></div></div>';
        overlayRoot.appendChild(div);
        div.querySelectorAll("[data-jump-id]").forEach(function (b) {
          b.onclick = function () {
            var target = SORTED.find(function (x) { return x.id === b.dataset.jumpId; });
            if (target) openCheckpoint(target);
          };
        });
        document.getElementById("sumRestartBtn").onclick = resetCourse;
        document.getElementById("closeSumBtn").onclick = function () { state.summary = false; renderOverlay(); };
        return;
      }

      if (!state.activeId) return;
      var item = SORTED.find(function (x) { return x.id === state.activeId; });
      if (!item) return;

      if (!state.expanded) {
        var pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "pin-btn";
        pinBtn.style.left = item.position.x + "%";
        pinBtn.style.top = item.position.y + "%";
        pinBtn.textContent = getCleanLabel(item);
        pinBtn.onclick = function () { pauseVideo(); state.expanded = true; renderOverlay(); };
        overlayRoot.appendChild(pinBtn);
        return;
      }

      if (item.type === "hotspot") {
        var existingHs = state.answers[item.id];
        var bar = document.createElement("div");
        bar.className = "hotspot-bar";
        bar.innerHTML = '<div><div style="font-size:13px;font-weight:600;color:#fff">' + (item.prompt || "") + '</div></div><button type="button" class="btn" id="hsClose">Bỏ qua</button>';
        var area = document.createElement("div");
        area.className = "hotspot-area";

        function showHotspotFeedback(ans) {
          area.querySelectorAll(".hotspot-target,.hotspot-dot").forEach(function (n) { n.remove(); });
          var r = item.hotspot || { x: 0, y: 0, width: 100, height: 100 };
          var target = document.createElement("div");
          target.className = "hotspot-target";
          target.style.left = r.x + "%"; target.style.top = r.y + "%"; target.style.width = r.width + "%"; target.style.height = r.height + "%";
          area.appendChild(target);
          if (ans.clickedPoint) {
            var dot = document.createElement("div");
            dot.className = "hotspot-dot";
            dot.style.left = ans.clickedPoint.x + "%"; dot.style.top = ans.clickedPoint.y + "%";
            dot.style.background = ans.isCorrect ? "#10b981" : "#ef4444";
            area.appendChild(dot);
          }
          var existingFoot = overlayRoot.querySelector(".hotspot-foot");
          if (existingFoot) existingFoot.remove();
          var footBar = document.createElement("div");
          footBar.className = "hotspot-foot";
          var maxHs = item.maxAttempts && item.maxAttempts > 0 ? item.maxAttempts : null;
          var usedHs = state.attempts[item.id] || ans.attemptsUsed || 1;
          var canRetryHs = !maxHs || usedHs < maxHs;
          var retryHsHtml = !ans.isCorrect
            ? (canRetryHs
                ? '<button type="button" class="btn" id="hsRetry">Thử lại' + (maxHs ? ' (' + usedHs + '/' + maxHs + ')' : '') + '</button>'
                : '<span style="font-size:12px;color:#64748b">Đã hết lượt (' + usedHs + '/' + maxHs + ')</span>')
            : '';
          footBar.innerHTML = '<div><strong style="color:' + (ans.isCorrect ? "#059669" : "#dc2626") + '">' + (ans.isCorrect ? "Chính xác (+" + item.points + " điểm)" : "Chưa đúng vị trí mục tiêu") + '</strong><div style="font-size:12px;color:#475569">' + (item.explanation || "") + '</div></div><div class="btn-group">' + retryHsHtml + (!ans.isCorrect && typeof item.branchOnWrong === "number" ? '<button type="button" class="btn btn-warn" id="hsBranch">Xem lại ' + fmt(item.branchOnWrong) + '</button>' : '') + '<button type="button" class="btn btn-primary" id="hsNext">Tiếp tục video</button></div>';
          overlayRoot.appendChild(footBar);
          if (document.getElementById("hsRetry")) {
            document.getElementById("hsRetry").onclick = function () {
              delete state.answers[item.id];
              renderOverlay();
              renderPins();
              renderCheckpointCards();
            };
          }
          if (document.getElementById("hsBranch")) {
            document.getElementById("hsBranch").onclick = function () {
              state.activeId = null; renderOverlay(); seekVideo(item.branchOnWrong, true); playVideo();
            };
          }
          document.getElementById("hsNext").onclick = function () { state.activeId = null; renderOverlay(); playVideo(); };
        }

        area.onclick = function (e) {
          if (state.answers[item.id]) return;
          var rect = area.getBoundingClientRect();
          var x = Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(1));
          var y = Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(1));
          var r = item.hotspot || { x: 0, y: 0, width: 100, height: 100 };
          var ok = x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
          var nextAttempts = (state.attempts[item.id] || 0) + 1;
          state.attempts[item.id] = nextAttempts;
          var ans = { isCorrect: ok, earned: ok ? item.points : 0, clickedPoint: { x: x, y: y }, attemptsUsed: nextAttempts };
          state.answers[item.id] = ans;
          syncProgress(false);
          renderPins();
          renderCheckpointCards();
          showHotspotFeedback(ans);
        };

        overlayRoot.appendChild(area);
        overlayRoot.appendChild(bar);
        document.getElementById("hsClose").onclick = function () { state.activeId = null; renderOverlay(); playVideo(); };
        if (existingHs) showHotspotFeedback(existingHs);
        return;
      }

      var ov = document.createElement("div");
      ov.className = "overlay";
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML = '<div class="card-head"><span>' + fmt(item.timestamp) + '</span><span>' + (item.type === "info" ? "Thông tin" : item.points + " điểm") + '</span></div>';
      var body = document.createElement("div");
      body.className = "card-body";
      body.innerHTML = item.prompt ? '<p class="prompt">' + item.prompt + '</p>' : '';
      if (item.imageUrl) {
        var qImg = document.createElement("img");
        qImg.className = "q-img";
        qImg.src = item.imageUrl;
        qImg.alt = item.title || "Minh họa câu hỏi";
        qImg.setAttribute("referrerpolicy", "no-referrer");
        body.appendChild(qImg);
      }

      var existingAns = state.answers[item.id];
      var selected = existingAns && existingAns.selected ? existingAns.selected.slice() : [];
      var currentOrder = existingAns && existingAns.order ? existingAns.order.slice() : shuffleDeterministic(item.orderingItems || [], item.id);
      var blankInputs = [];
      var dragBank = item.type === "drag_text" ? buildWordBank(item) : [];
      var dragParts = item.type === "drag_text" ? parseBlanks(item.blankSentence || "") : [];
      var dragExpected = dragParts.filter(function (p) { return p.type === "blank"; }).map(function (p) { return p.value; });
      var dragAssigned = [];
      var activeDragSlot = null;

      if (item.type === "info") {
        var p = document.createElement("p");
        p.style.padding = "12px";
        p.style.background = "#f0f9ff";
        p.style.border = "1px solid #bae6fd";
        p.style.borderRadius = "8px";
        p.style.fontSize = "14px";
        p.textContent = item.infoBody || "";
        body.appendChild(p);
      } else if (item.type === "multiple_choice" || item.type === "multi_select" || item.type === "true_false") {
        (item.options || []).forEach(function (opt) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "opt" + (selected.indexOf(opt.id) >= 0 ? " selected" : "");
          if (existingAns) {
            if (opt.isCorrect) b.className += " correct";
            else if (selected.indexOf(opt.id) >= 0) b.className += " incorrect";
          }
          b.textContent = opt.text;
          b.onclick = function () {
            if (state.answers[item.id]) return;
            if (item.type === "multi_select") {
              var idx = selected.indexOf(opt.id);
              if (idx >= 0) { selected.splice(idx, 1); b.classList.remove("selected"); }
              else { selected.push(opt.id); b.classList.add("selected"); }
            } else {
              selected = [opt.id];
              body.querySelectorAll(".opt").forEach(function (el) { el.classList.remove("selected"); });
              b.classList.add("selected");
            }
          };
          body.appendChild(b);
        });
      } else if (item.type === "fill_blank") {
        var box = document.createElement("div");
        box.className = "blank-box";
        var parts = parseBlanks(item.blankSentence || "");
        parts.forEach(function (part) {
          if (part.type === "blank") {
            var inp = document.createElement("input");
            inp.className = "blank-input";
            inp.placeholder = "...";
            inp.dataset.expected = part.value;
            if (existingAns && existingAns.blanks && existingAns.blanks[part.index] !== undefined) {
              inp.value = existingAns.blanks[part.index];
              inp.disabled = true;
            }
            blankInputs.push(inp);
            box.appendChild(inp);
          } else {
            box.appendChild(document.createTextNode(part.value));
          }
        });
        body.appendChild(box);
      } else if (item.type === "drag_text") {
        var usedInit = {};
        dragAssigned = dragExpected.map(function (_, idx) {
          var v = existingAns && existingAns.blanks ? existingAns.blanks[idx] : null;
          if (!v) return null;
          for (var i = 0; i < dragBank.length; i++) {
            if (dragBank[i] === v && !usedInit[i]) { usedInit[i] = true; return i; }
          }
          return null;
        });

        var dragWrap = document.createElement("div");
        var dragBox = document.createElement("div");
        dragBox.className = "blank-box";
        var bankBox = document.createElement("div");
        bankBox.className = "drag-bank";

        function drawDragUI() {
          var locked = Boolean(state.answers[item.id]);
          dragBox.innerHTML = "";
          dragParts.forEach(function (part) {
            if (part.type === "text") {
              dragBox.appendChild(document.createTextNode(part.value));
              return;
            }
            var sIdx = part.index;
            var cIdx = dragAssigned[sIdx];
            var word = cIdx !== null && cIdx !== undefined ? dragBank[cIdx] : "";
            var slot = document.createElement("button");
            slot.type = "button";
            slot.className = "drag-slot";
            if (locked) {
              var exp = (part.value || "").trim();
              var act = (word || "").trim();
              var okSlot = item.caseSensitive ? act === exp : act.toLowerCase() === exp.toLowerCase();
              slot.className += okSlot ? " ok" : " bad";
              slot.disabled = true;
            } else if (word) {
              slot.className += " filled";
              slot.draggable = true;
              slot.ondragstart = function (e) {
                e.dataTransfer.setData("text/plain", JSON.stringify({ cIdx: cIdx, fromSlot: sIdx }));
              };
            } else if (activeDragSlot === sIdx) {
              slot.className += " focus";
            }
            slot.textContent = word || "Thả / chọn từ";
            slot.ondragover = function (e) {
              if (locked) return;
              e.preventDefault();
              slot.classList.add("over");
            };
            slot.ondragleave = function () { slot.classList.remove("over"); };
            slot.ondrop = function (e) {
              if (locked) return;
              e.preventDefault();
              slot.classList.remove("over");
              try {
                var data = JSON.parse(e.dataTransfer.getData("text/plain"));
                if (typeof data.cIdx === "number") {
                  if (typeof data.fromSlot === "number") {
                    var prev = dragAssigned[sIdx];
                    dragAssigned[sIdx] = data.cIdx;
                    dragAssigned[data.fromSlot] = prev !== undefined ? prev : null;
                  } else {
                    var oldPos = dragAssigned.indexOf(data.cIdx);
                    if (oldPos >= 0) dragAssigned[oldPos] = null;
                    dragAssigned[sIdx] = data.cIdx;
                  }
                  activeDragSlot = null;
                  drawDragUI();
                }
              } catch (err) {}
            };
            slot.onclick = function () {
              if (locked) return;
              if (dragAssigned[sIdx] !== null && dragAssigned[sIdx] !== undefined) {
                dragAssigned[sIdx] = null;
                activeDragSlot = sIdx;
              } else {
                activeDragSlot = activeDragSlot === sIdx ? null : sIdx;
              }
              drawDragUI();
            };
            dragBox.appendChild(slot);
          });

          bankBox.innerHTML = '<div class="drag-bank-title">Kho từ gợi ý — Kéo thả từ vào ô trống hoặc bấm chọn từ để điền:</div>';
          var chipsRow = document.createElement("div");
          chipsRow.className = "drag-chips";
          dragBank.forEach(function (w, cIdx) {
            var isUsed = dragAssigned.indexOf(cIdx) >= 0;
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "word-chip" + (isUsed ? " used" : "");
            chip.textContent = w;
            chip.disabled = locked || isUsed;
            chip.draggable = !locked && !isUsed;
            chip.ondragstart = function (e) {
              e.dataTransfer.setData("text/plain", JSON.stringify({ cIdx: cIdx }));
            };
            chip.onclick = function () {
              if (locked || isUsed) return;
              var target = activeDragSlot !== null ? activeDragSlot : dragAssigned.indexOf(null);
              if (target < 0) target = 0;
              if (target < dragExpected.length) {
                dragAssigned[target] = cIdx;
                activeDragSlot = null;
                drawDragUI();
              }
            };
            chipsRow.appendChild(chip);
          });
          bankBox.appendChild(chipsRow);
        }

        drawDragUI();
        dragWrap.appendChild(dragBox);
        dragWrap.appendChild(bankBox);
        body.appendChild(dragWrap);
      } else if (item.type === "ordering") {
        var list = document.createElement("div");
        function drawOrder() {
          list.innerHTML = "";
          currentOrder.forEach(function (txt, idx) {
            var row = document.createElement("div");
            row.className = "opt";
            row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center";
            row.innerHTML = '<span>' + (idx + 1) + '. ' + txt + '</span><span></span>';
            if (!state.answers[item.id]) {
              var btns = row.lastChild;
              if (idx > 0) {
                var up = document.createElement("button"); up.type = "button";
                up.className = "btn"; up.textContent = "↑"; up.style.marginRight = "4px";
                up.onclick = function () { var t = currentOrder[idx - 1]; currentOrder[idx - 1] = currentOrder[idx]; currentOrder[idx] = t; drawOrder(); };
                btns.appendChild(up);
              }
              if (idx < currentOrder.length - 1) {
                var dn = document.createElement("button"); dn.type = "button";
                dn.className = "btn"; dn.textContent = "↓";
                dn.onclick = function () { var t = currentOrder[idx + 1]; currentOrder[idx + 1] = currentOrder[idx]; currentOrder[idx] = t; drawOrder(); };
                btns.appendChild(dn);
              }
            }
            list.appendChild(row);
          });
        }
        drawOrder();
        body.appendChild(list);
      }

      var foot = document.createElement("div");
      foot.className = "card-foot";
      var leftFoot = document.createElement("div");
      leftFoot.className = "btn-group";
      var rightFoot = document.createElement("div");
      rightFoot.className = "btn-group";

      var actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "btn btn-primary";

      function showResultUI(ans) {
        var fb = document.createElement("div");
        fb.className = "feedback " + (ans.isCorrect ? "ok" : "bad");
        fb.innerHTML = '<strong>' + (ans.isCorrect ? "Chính xác (+" + item.points + " điểm)" : "Chưa chính xác (0 điểm)") + '</strong><div>' + (item.explanation || "") + '</div>';
        body.appendChild(fb);
        leftFoot.innerHTML = "";
        if (!ans.isCorrect) {
          var maxCard = item.maxAttempts && item.maxAttempts > 0 ? item.maxAttempts : null;
          var usedCard = state.attempts[item.id] || ans.attemptsUsed || 1;
          var canRetryCard = !maxCard || usedCard < maxCard;
          if (canRetryCard) {
            var retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.className = "btn";
            retryBtn.textContent = maxCard ? "Làm lại (" + usedCard + "/" + maxCard + ")" : "Làm lại câu này";
            retryBtn.onclick = function () {
              delete state.answers[item.id];
              renderPins();
              renderCheckpointCards();
              renderOverlay();
            };
            leftFoot.appendChild(retryBtn);
          } else {
            var exhaustedTxt = document.createElement("span");
            exhaustedTxt.style.fontSize = "12px";
            exhaustedTxt.style.color = "#64748b";
            exhaustedTxt.textContent = "Đã hết lượt làm lại (" + usedCard + "/" + maxCard + ")";
            leftFoot.appendChild(exhaustedTxt);
          }
          if (typeof item.branchOnWrong === "number") {
            var bw = document.createElement("button");
            bw.type = "button";
            bw.className = "btn btn-warn";
            bw.textContent = "Xem lại đoạn " + fmt(item.branchOnWrong);
            bw.onclick = function () { state.activeId = null; renderOverlay(); seekVideo(item.branchOnWrong, true); playVideo(); };
            leftFoot.appendChild(bw);
          }
        } else if (typeof item.branchOnCorrect === "number") {
          var bc = document.createElement("button");
          bc.type = "button";
          bc.className = "btn";
          bc.textContent = "Chuyển tới đoạn " + fmt(item.branchOnCorrect);
          bc.onclick = function () { state.activeId = null; renderOverlay(); seekVideo(item.branchOnCorrect, true); playVideo(); };
          leftFoot.appendChild(bc);
        }
        actionBtn.dataset.checked = "1";
        actionBtn.textContent = "Tiếp tục xem video";
        actionBtn.className = "btn btn-dark";
      }

      if (item.type === "info") {
        actionBtn.textContent = "Đã hiểu & Tiếp tục";
      } else if (existingAns) {
        showResultUI(existingAns);
      } else {
        actionBtn.textContent = "Kiểm tra đáp án";
      }

      actionBtn.onclick = function () {
        if (item.type === "info") {
          state.answers[item.id] = { isCorrect: true, earned: 0 };
          syncProgress(false);
          renderPins();
          renderCheckpointCards();
          state.activeId = null;
          renderOverlay();
          playVideo();
          return;
        }
        if (actionBtn.dataset.checked === "1") {
          state.activeId = null;
          renderOverlay();
          playVideo();
          return;
        }
        var ok = false;
        var extra = {};
        if (item.type === "multiple_choice" || item.type === "true_false") {
          if (!selected.length) return;
          var cor = (item.options || []).find(function (o) { return o.isCorrect; });
          ok = Boolean(cor && selected[0] === cor.id);
          extra.selected = selected.slice();
        } else if (item.type === "multi_select") {
          if (!selected.length) return;
          var cors = (item.options || []).filter(function (o) { return o.isCorrect; }).map(function (o) { return o.id; });
          ok = cors.length > 0 && selected.length === cors.length && cors.every(function (id) { return selected.indexOf(id) >= 0; });
          extra.selected = selected.slice();
        } else if (item.type === "fill_blank") {
          extra.blanks = blankInputs.map(function (inp) { return inp.value; });
          ok = blankInputs.length > 0 && blankInputs.every(function (inp) {
            var val = inp.value.trim();
            var exp = (inp.dataset.expected || "").trim();
            return item.caseSensitive ? val === exp : val.toLowerCase() === exp.toLowerCase();
          });
          blankInputs.forEach(function (inp) { inp.disabled = true; });
        } else if (item.type === "drag_text") {
          if (dragAssigned.some(function (c) { return c === null || c === undefined; })) return;
          extra.blanks = dragAssigned.map(function (cIdx) { return dragBank[cIdx] || ""; });
          ok = dragExpected.length > 0 && dragExpected.every(function (expRaw, idx) {
            var val = (extra.blanks[idx] || "").trim();
            var exp = (expRaw || "").trim();
            return item.caseSensitive ? val === exp : val.toLowerCase() === exp.toLowerCase();
          });
        } else if (item.type === "ordering") {
          extra.order = currentOrder.slice();
          ok = (item.orderingItems || []).every(function (v, idx) { return currentOrder[idx] === v; });
        }

        var nextCardAttempts = (state.attempts[item.id] || 0) + 1;
        state.attempts[item.id] = nextCardAttempts;
        var ansObj = Object.assign({ isCorrect: ok, earned: ok ? item.points : 0, attemptsUsed: nextCardAttempts }, extra);
        state.answers[item.id] = ansObj;
        if (item.type === "drag_text" && typeof drawDragUI === "function") drawDragUI();
        syncProgress(false);
        renderPins();
        renderCheckpointCards();
        showResultUI(ansObj);
      };

      rightFoot.appendChild(actionBtn);
      foot.appendChild(leftFoot);
      foot.appendChild(rightFoot);
      card.appendChild(body);
      card.appendChild(foot);
      ov.appendChild(card);
      overlayRoot.appendChild(ov);
    }

    renderBuiltinScene();
    renderPins();
    renderCheckpointCards();
    updateSubtitleControls();
    loadSavedProgress();
    syncProgress(false);
  </script>
</body>
</html>`;
}

function makeCourseSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'interactive-video'
  );
}

export async function buildScormPackageZip(
  course: CourseProject,
  version: ScormVersion
): Promise<{ blob: Blob; filename: string; files: string[] }> {
  const zip = new JSZip();
  const assetFiles: string[] = [];

  const packagedCourse: CourseProject & { packagedVideoPath?: string } = JSON.parse(
    JSON.stringify(course)
  );

  if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
    const videoBlob = await getVideoBlob(course.uploadedVideoKey);
    if (videoBlob) {
      const mediaPath = getUploadedMediaFilename(course.uploadedVideoName);
      zip.file(mediaPath, videoBlob);
      packagedCourse.packagedVideoPath = mediaPath;
      assetFiles.push(mediaPath);
    }
  }

  if (course.videoSourceType === 'builtin' && packagedCourse.builtInScenes) {
    const imageMap = new Map<string, string>();
    let imgCounter = 1;
    for (const scene of packagedCourse.builtInScenes as Array<
      NonNullable<CourseProject['builtInScenes']>[number] & { packagedImagePath?: string }
    >) {
      if (scene.imageUrl) {
        if (!imageMap.has(scene.imageUrl)) {
          try {
            const resp = await fetch(scene.imageUrl);
            if (resp.ok) {
              const imgBlob = await resp.blob();
              const outPath = `media/scene-${imgCounter}.jpg`;
              zip.file(outPath, imgBlob);
              assetFiles.push(outPath);
              imageMap.set(scene.imageUrl, outPath);
              imgCounter++;
            }
          } catch {
            // Skip gracefully
          }
        }
        const mapped = imageMap.get(scene.imageUrl);
        if (mapped) scene.packagedImagePath = mapped;
      }
    }
  }

  const courseJson = JSON.stringify(packagedCourse, null, 2);
  const manifestXml = generateImsManifest(course, version, assetFiles);
  const scormApiJs = generateScormApiWrapper(version);
  const indexHtml = generateStandalonePlayerHtml(JSON.stringify(packagedCourse), {
    includeScormScript: true,
    modeLabel: `SCORM ${version}`,
  });

  zip.file('imsmanifest.xml', manifestXml);
  zip.file('scorm-api.js', scormApiJs);
  zip.file('course-data.json', courseJson);
  zip.file('index.html', indexHtml);

  const allFiles = ['imsmanifest.xml', 'index.html', 'scorm-api.js', 'course-data.json', ...assetFiles];
  const blob = await zip.generateAsync({ type: 'blob' });
  const slug = makeCourseSlug(course.title);

  return {
    blob,
    filename: `${slug}-scorm-${version}.zip`,
    files: allFiles,
  };
}

export async function buildStandaloneInteractiveHtml(
  course: CourseProject
): Promise<{ blob: Blob; filename: string }> {
  const packagedCourse: CourseProject & { packagedVideoPath?: string } = JSON.parse(
    JSON.stringify(course)
  );

  // Embed uploaded video as Data URI inside single HTML file
  if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
    const videoBlob = await getVideoBlob(course.uploadedVideoKey);
    if (videoBlob) {
      packagedCourse.packagedVideoPath = await blobToDataUrl(videoBlob);
    }
  }

  // Embed built-in scene JPGs as Data URIs so single HTML works 100% offline in PPTX / Zoom / Teams
  if (course.videoSourceType === 'builtin' && packagedCourse.builtInScenes) {
    const imageMap = new Map<string, string>();
    for (const scene of packagedCourse.builtInScenes as Array<
      NonNullable<CourseProject['builtInScenes']>[number] & { packagedImagePath?: string }
    >) {
      if (scene.imageUrl) {
        if (!imageMap.has(scene.imageUrl)) {
          try {
            const resp = await fetch(scene.imageUrl);
            if (resp.ok) {
              const imgBlob = await resp.blob();
              const dataUri = await blobToDataUrl(imgBlob);
              imageMap.set(scene.imageUrl, dataUri);
            }
          } catch {
            // Skip gracefully
          }
        }
        const mapped = imageMap.get(scene.imageUrl);
        if (mapped) scene.packagedImagePath = mapped;
      }
    }
  }

  const html = generateStandalonePlayerHtml(JSON.stringify(packagedCourse), {
    includeScormScript: false,
    modeLabel: 'Trình chiếu Tương tác (PPTX / Train Online)',
  });

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const slug = makeCourseSlug(course.title);
  return {
    blob,
    filename: `${slug}-tuong-tac-pptx.html`,
  };
}

export async function buildWebBundleZip(
  course: CourseProject
): Promise<{ blob: Blob; filename: string; files: string[] }> {
  const zip = new JSZip();
  const assetFiles: string[] = [];

  const packagedCourse: CourseProject & { packagedVideoPath?: string } = JSON.parse(
    JSON.stringify(course)
  );

  if (course.videoSourceType === 'upload' && course.uploadedVideoKey) {
    const videoBlob = await getVideoBlob(course.uploadedVideoKey);
    if (videoBlob) {
      const mediaPath = getUploadedMediaFilename(course.uploadedVideoName);
      zip.file(mediaPath, videoBlob);
      packagedCourse.packagedVideoPath = mediaPath;
      assetFiles.push(mediaPath);
    }
  }

  if (course.videoSourceType === 'builtin' && packagedCourse.builtInScenes) {
    const imageMap = new Map<string, string>();
    let imgCounter = 1;
    for (const scene of packagedCourse.builtInScenes as Array<
      NonNullable<CourseProject['builtInScenes']>[number] & { packagedImagePath?: string }
    >) {
      if (scene.imageUrl) {
        if (!imageMap.has(scene.imageUrl)) {
          try {
            const resp = await fetch(scene.imageUrl);
            if (resp.ok) {
              const imgBlob = await resp.blob();
              const outPath = `media/scene-${imgCounter}.jpg`;
              zip.file(outPath, imgBlob);
              assetFiles.push(outPath);
              imageMap.set(scene.imageUrl, outPath);
              imgCounter++;
            }
          } catch {
            // Skip gracefully
          }
        }
        const mapped = imageMap.get(scene.imageUrl);
        if (mapped) scene.packagedImagePath = mapped;
      }
    }
  }

  const indexHtml = generateStandalonePlayerHtml(JSON.stringify(packagedCourse), {
    includeScormScript: false,
    modeLabel: 'Gói Web HTML5 (Train Online)',
  });

  zip.file('index.html', indexHtml);
  const blob = await zip.generateAsync({ type: 'blob' });
  const slug = makeCourseSlug(course.title);
  return {
    blob,
    filename: `${slug}-web-pptx.zip`,
    files: ['index.html', ...assetFiles],
  };
}
