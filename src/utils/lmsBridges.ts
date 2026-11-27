import { ScormVersion } from '../types/course';

/**
 * Các "cầu nối" LMS được nhúng vào gói xuất (chạy trong trình duyệt của learner).
 * Cả SCORM và xAPI dùng chung một giao diện để player không cần biết đang chạy chuẩn nào:
 *
 *   init()                                   -> boolean (đã kết nối LMS?)
 *   isConnected()                            -> boolean
 *   loadProgress(cb(rawString|null))         -> đọc tiến độ đã lưu (bất đồng bộ với xAPI)
 *   reportProgress(pct, passed, completed, suspendStr, timeSec)
 *   recordInteraction(rec)                   -> ghi kết quả từng câu (cmi.interactions / xAPI answered)
 *   event(name, data)                        -> sự kiện video (xAPI: played / paused / seeked)
 *   finish()
 *
 * Bản ghi tương tác (rec) do player tạo:
 *   { id, type: 'choice'|'fill-in'|'sequencing'|'other',
 *     response: string[], correct: string[], result: 'correct'|'incorrect',
 *     weight: number, description: string, latencyMs: number,
 *     choices?: {id, text}[] }
 */

export function generateScormApiWrapper(version: ScormVersion): string {
  return `(function (global) {
  var VERSION = "${version}";
  var apiHandle = null;
  var initialized = false;
  var finished = false;
  var startTime = Date.now();
  var lastCompleted = false;
  var interactionCount = -1;

  function findAPI(win) {
    var attempts = 0;
    while (win && attempts < 15) {
      try {
        if (VERSION === "2004" && win.API_1484_11) return win.API_1484_11;
        if (VERSION === "1.2" && win.API) return win.API;
        if (win.API_1484_11) return win.API_1484_11;
        if (win.API) return win.API;
        if (win.parent && win.parent !== win) win = win.parent;
        else break;
      } catch (e) { break; }
      attempts++;
    }
    return null;
  }

  function getAPI() {
    if (apiHandle) return apiHandle;
    apiHandle = findAPI(window);
    if (!apiHandle && window.opener) {
      try { apiHandle = findAPI(window.opener); } catch (e) {}
    }
    return apiHandle;
  }

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }

  function fmtSpan(ms, forLatency) {
    var totalSecs = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(totalSecs / 3600);
    var m = Math.floor((totalSecs % 3600) / 60);
    var s = totalSecs % 60;
    if (VERSION === "2004") return "PT" + h + "H" + m + "M" + s + "S";
    return pad(h, forLatency ? 4 : 2) + ":" + pad(m) + ":" + pad(s);
  }

  function nowStamp() {
    var d = new Date();
    var date = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    var time = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    return VERSION === "2004" ? date + "T" + time : time;
  }

  function set(key, value) {
    var api = getAPI();
    if (!api || !initialized || finished) return false;
    try {
      return VERSION === "2004" ? api.SetValue(key, String(value)) : api.LMSSetValue(key, String(value));
    } catch (e) { return false; }
  }

  function get(key) {
    var api = getAPI();
    if (!api || !initialized || finished) return "";
    try { return VERSION === "2004" ? api.GetValue(key) : api.LMSGetValue(key); } catch (e) { return ""; }
  }

  global.ScormBridge = {
    kind: "scorm",
    init: function () {
      var api = getAPI();
      if (!api) return false;
      var ok = VERSION === "2004" ? api.Initialize("") : api.LMSInitialize("");
      initialized = ok === "true" || ok === true;
      if (initialized) {
        if (VERSION === "2004") {
          var st = get("cmi.completion_status");
          if (!st || st === "unknown" || st === "not attempted") set("cmi.completion_status", "incomplete");
          set("cmi.exit", "suspend");
        } else {
          var st12 = get("cmi.core.lesson_status");
          if (!st12 || st12 === "not attempted") set("cmi.core.lesson_status", "incomplete");
          set("cmi.core.exit", "suspend");
        }
        this.commit();
      }
      return initialized;
    },
    isConnected: function () { return initialized && !finished; },
    loadProgress: function (cb) {
      var raw = initialized ? (get("cmi.suspend_data") || "") : "";
      cb(raw || null);
    },
    reportProgress: function (scorePct, passed, completed, suspendStr, timeSec) {
      lastCompleted = Boolean(completed);
      if (!initialized || finished) return;
      var locStr = String(Math.floor(timeSec || 0));
      if (VERSION === "2004") {
        set("cmi.score.min", "0");
        set("cmi.score.max", "100");
        set("cmi.score.raw", String(scorePct));
        set("cmi.score.scaled", (scorePct / 100).toFixed(2));
        set("cmi.completion_status", completed ? "completed" : "incomplete");
        set("cmi.success_status", completed ? (passed ? "passed" : "failed") : "unknown");
        set("cmi.location", locStr);
        set("cmi.exit", completed ? "normal" : "suspend");
        set("cmi.session_time", fmtSpan(Date.now() - startTime));
        set("cmi.suspend_data", suspendStr);
      } else {
        set("cmi.core.score.min", "0");
        set("cmi.core.score.max", "100");
        set("cmi.core.score.raw", String(scorePct));
        set("cmi.core.lesson_status", completed ? (passed ? "passed" : "failed") : "incomplete");
        set("cmi.core.lesson_location", locStr);
        set("cmi.core.exit", completed ? "" : "suspend");
        set("cmi.core.session_time", fmtSpan(Date.now() - startTime));
        set("cmi.suspend_data", suspendStr.length > 4096 ? suspendStr.slice(0, 4096) : suspendStr);
      }
      this.commit();
    },
    recordInteraction: function (rec) {
      if (!initialized || finished || !rec) return;
      if (interactionCount < 0) {
        interactionCount = parseInt(get("cmi.interactions._count"), 10);
        if (!isFinite(interactionCount) || interactionCount < 0) interactionCount = 0;
      }
      var n = interactionCount++;
      var p = "cmi.interactions." + n + ".";
      if (VERSION === "2004") {
        var sep = "[,]";
        set(p + "id", rec.id);
        set(p + "type", rec.type);
        set(p + "timestamp", nowStamp());
        set(p + "weighting", String(rec.weight || 0));
        if (rec.correct && rec.correct.length) set(p + "correct_responses.0.pattern", rec.correct.join(sep));
        set(p + "learner_response", (rec.response || []).join(sep));
        set(p + "result", rec.result === "correct" ? "correct" : "incorrect");
        set(p + "latency", fmtSpan(rec.latencyMs || 0, true));
        if (rec.description) set(p + "description", rec.description.slice(0, 250));
      } else {
        var t12 = rec.type === "other" ? "performance" : rec.type;
        var joiner = rec.type === "fill-in" || rec.type === "other" ? " | " : ",";
        set(p + "id", rec.id);
        set(p + "type", t12);
        set(p + "time", nowStamp());
        set(p + "weighting", String(rec.weight || 0));
        if (rec.correct && rec.correct.length) set(p + "correct_responses.0.pattern", rec.correct.join(joiner).slice(0, 255));
        set(p + "student_response", (rec.response || []).join(joiner).slice(0, 255));
        set(p + "result", rec.result === "correct" ? "correct" : "wrong");
        set(p + "latency", fmtSpan(rec.latencyMs || 0, true));
      }
      this.commit();
    },
    event: function () {},
    commit: function () {
      var api = getAPI();
      if (!api || !initialized || finished) return;
      try { if (VERSION === "2004") api.Commit(""); else api.LMSCommit(""); } catch (e) {}
    },
    finish: function () {
      var api = getAPI();
      if (!api || !initialized || finished) return;
      if (VERSION === "2004") {
        set("cmi.exit", lastCompleted ? "normal" : "suspend");
        set("cmi.session_time", fmtSpan(Date.now() - startTime));
      } else {
        set("cmi.core.exit", lastCompleted ? "" : "suspend");
        set("cmi.core.session_time", fmtSpan(Date.now() - startTime));
      }
      this.commit();
      finished = true;
      try { if (VERSION === "2004") api.Terminate(""); else api.LMSFinish(""); } catch (e) {}
      initialized = false;
    }
  };
})(window);`;
}

/**
 * xAPI (Tin Can) theo chuẩn khởi chạy của tincan.xml:
 * LMS mở index.html?endpoint=...&auth=...&actor=...&registration=...&activity_id=...
 * - Gửi statement: initialized, played, paused, seeked, answered, completed, passed/failed, terminated
 * - Lưu/khôi phục tiến độ qua State API (stateId = "lumicast_resume")
 */
export function generateXapiWrapper(defaultActivityId: string, courseTitle: string): string {
  return `(function (global) {
  var DEFAULT_ACTIVITY_ID = ${JSON.stringify(defaultActivityId)};
  var COURSE_TITLE = ${JSON.stringify(courseTitle)};
  var STATE_ID = "lumicast_resume";
  var VIDEO = "https://w3id.org/xapi/video/";

  function parseQuery() {
    var out = {};
    var q = (window.location.search || "").replace(/^\\?/, "");
    if (!q) return out;
    q.split("&").forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf("=");
      var k = i >= 0 ? pair.slice(0, i) : pair;
      var v = i >= 0 ? pair.slice(i + 1) : "";
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\\+/g, " ")); } catch (e) {}
    });
    return out;
  }

  function normalizeActor(a) {
    if (!a) return null;
    // Định dạng Tin Can cũ: {"name":["A"],"mbox":["mailto:a@b"]}
    var out = { objectType: "Agent" };
    function first(v) { return Array.isArray(v) ? v[0] : v; }
    if (a.name) out.name = first(a.name);
    if (a.mbox) out.mbox = first(a.mbox);
    if (a.mbox_sha1sum) out.mbox_sha1sum = first(a.mbox_sha1sum);
    if (a.openid) out.openid = first(a.openid);
    var acc = a.account ? first(a.account) : null;
    if (acc) out.account = { homePage: first(acc.homePage || acc.accountServiceHomePage), name: first(acc.name || acc.accountName) };
    if (!out.mbox && !out.mbox_sha1sum && !out.openid && !out.account) return null;
    return out;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function isoDuration(ms) {
    var s = Math.max(0, Math.round(ms / 10) / 100);
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s = Math.round((s - m * 60) * 100) / 100;
    return "PT" + h + "H" + m + "M" + s + "S";
  }

  var q = parseQuery();
  var endpoint = q.endpoint || "";
  if (endpoint && endpoint.slice(-1) !== "/") endpoint += "/";
  var auth = q.auth || "";
  var actor = null;
  try { actor = normalizeActor(JSON.parse(q.actor || "null")); } catch (e) { actor = null; }
  var registration = q.registration || "";
  var activityId = q.activity_id || DEFAULT_ACTIVITY_ID;
  var connected = false;
  var finished = false;
  var startTime = Date.now();
  var lastCompleted = false;
  var sentCompletion = false;

  function headers() {
    var h = { "X-Experience-API-Version": "1.0.3", "Content-Type": "application/json" };
    if (auth) h.Authorization = auth;
    return h;
  }

  function send(method, path, body, cb, keepalive) {
    if (!window.fetch) { if (cb) cb(null); return; }
    var opts = { method: method, headers: headers(), credentials: "omit" };
    if (body !== undefined) opts.body = typeof body === "string" ? body : JSON.stringify(body);
    if (keepalive) opts.keepalive = true;
    fetch(endpoint + path, opts).then(function (r) {
      if (!cb) return;
      if (r.status === 404 || r.status === 204) { cb(null); return; }
      if (!r.ok) { cb(null); return; }
      r.text().then(function (t) { cb(t); }, function () { cb(null); });
    }, function () { if (cb) cb(null); });
  }

  var queue = [];
  var flushTimer = null;
  function flush(keepalive) {
    if (!connected || !queue.length) return;
    var batch = queue.splice(0, queue.length);
    send("POST", "statements", batch, null, keepalive);
  }

  function courseObject() {
    return {
      objectType: "Activity",
      id: activityId,
      definition: {
        type: "http://adlnet.gov/expapi/activities/course",
        name: { "vi-VN": COURSE_TITLE }
      }
    };
  }

  function statement(verbId, verbVi, verbEn, object, result, extensions) {
    var st = {
      id: uuid(),
      actor: actor,
      verb: { id: verbId, display: { "vi-VN": verbVi, "en-US": verbEn } },
      object: object || courseObject(),
      timestamp: new Date().toISOString(),
      context: {}
    };
    if (object && object.id !== activityId) st.context.contextActivities = { parent: [{ id: activityId, objectType: "Activity" }] };
    if (extensions) st.context.extensions = extensions;
    if (registration) st.context.registration = registration;
    if (result) st.result = result;
    return st;
  }

  function enqueue(st, immediate) {
    if (!connected) return;
    queue.push(st);
    if (immediate) { flush(false); return; }
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { flush(false); }, 1500);
  }

  function stateUrl() {
    var u = "activities/state?activityId=" + encodeURIComponent(activityId) +
      "&agent=" + encodeURIComponent(JSON.stringify(actor)) +
      "&stateId=" + encodeURIComponent(STATE_ID);
    if (registration) u += "&registration=" + encodeURIComponent(registration);
    return u;
  }

  global.XapiBridge = {
    kind: "xapi",
    init: function () {
      connected = Boolean(endpoint && actor);
      if (connected) {
        enqueue(statement("http://adlnet.gov/expapi/verbs/initialized", "đã bắt đầu", "initialized"), true);
      }
      return connected;
    },
    isConnected: function () { return connected && !finished; },
    loadProgress: function (cb) {
      if (!connected) { cb(null); return; }
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; cb(null); } }, 6000);
      send("GET", stateUrl(), undefined, function (txt) {
        if (done) return;
        done = true; clearTimeout(timer);
        cb(txt || null);
      });
    },
    reportProgress: function (scorePct, passed, completed, suspendStr, timeSec) {
      lastCompleted = Boolean(completed);
      if (!connected || finished) return;
      send("PUT", stateUrl(), suspendStr, null);
      if (completed && !sentCompletion) {
        sentCompletion = true;
        var res = {
          completion: true,
          success: Boolean(passed),
          score: { scaled: Math.max(0, Math.min(1, scorePct / 100)), raw: scorePct, min: 0, max: 100 },
          duration: isoDuration(Date.now() - startTime)
        };
        enqueue(statement("http://adlnet.gov/expapi/verbs/completed", "đã hoàn thành", "completed", null, res));
        enqueue(statement(
          passed ? "http://adlnet.gov/expapi/verbs/passed" : "http://adlnet.gov/expapi/verbs/failed",
          passed ? "đã đạt" : "chưa đạt",
          passed ? "passed" : "failed",
          null, res
        ), true);
      }
    },
    recordInteraction: function (rec) {
      if (!connected || finished || !rec) return;
      var isChoiceLike = rec.type === "choice" || rec.type === "sequencing";
      var def = {
        type: "http://adlnet.gov/expapi/activities/cmi.interaction",
        name: { "vi-VN": rec.description || rec.id },
        interactionType: rec.type === "other" ? "other" : rec.type
      };
      if (rec.correct && rec.correct.length) def.correctResponsesPattern = [rec.correct.join("[,]")];
      if (isChoiceLike && rec.choices) {
        def.choices = rec.choices.map(function (c) {
          return { id: c.id, description: { "vi-VN": c.text } };
        });
      }
      var obj = { objectType: "Activity", id: activityId + "/q/" + encodeURIComponent(rec.id), definition: def };
      var res = {
        success: rec.result === "correct",
        response: (rec.response || []).join("[,]"),
        score: { raw: rec.result === "correct" ? (rec.weight || 0) : 0, min: 0, max: rec.weight || 0 },
        duration: isoDuration(rec.latencyMs || 0)
      };
      if (!rec.weight) delete res.score;
      enqueue(statement("http://adlnet.gov/expapi/verbs/answered", "đã trả lời", "answered", obj, res));
    },
    event: function (name, data) {
      if (!connected || finished) return;
      data = data || {};
      var ext = {};
      var verb = null, vi = "", en = "";
      if (name === "played") { verb = VIDEO + "verbs/played"; vi = "đã phát"; en = "played"; ext[VIDEO + "extensions/time"] = Math.round((data.time || 0) * 100) / 100; }
      else if (name === "paused") { verb = VIDEO + "verbs/paused"; vi = "đã tạm dừng"; en = "paused"; ext[VIDEO + "extensions/time"] = Math.round((data.time || 0) * 100) / 100; }
      else if (name === "seeked") { verb = VIDEO + "verbs/seeked"; vi = "đã tua"; en = "seeked"; ext[VIDEO + "extensions/time-from"] = Math.round((data.from || 0) * 100) / 100; ext[VIDEO + "extensions/time-to"] = Math.round((data.to || 0) * 100) / 100; }
      if (!verb) return;
      var st = statement(verb, vi, en, null, { extensions: ext });
      enqueue(st);
    },
    finish: function () {
      if (!connected || finished) return;
      enqueue(statement("http://adlnet.gov/expapi/verbs/terminated", "đã thoát", "terminated", null, {
        completion: lastCompleted,
        duration: isoDuration(Date.now() - startTime)
      }));
      flush(true);
      finished = true;
    }
  };
})(window);`;
}

export function generateTincanXml(activityId: string, title: string, description: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  return `<?xml version="1.0" encoding="utf-8" ?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="${esc(activityId)}" type="http://adlnet.gov/expapi/activities/course">
      <name lang="vi-VN">${esc(title)}</name>
      <description lang="vi-VN">${esc(description || title)}</description>
      <launch lang="vi-VN">index.html</launch>
    </activity>
  </activities>
</tincan>`;
}
