/**
 * Trình phát video tương tác dùng chung cho:
 *  - Gói SCORM 1.2 / 2004, gói xAPI, gói Web HTML5, file HTML đơn
 *  - Màn "Trình chiếu học viên" và "Giả lập LMS" trong Studio (chạy trong iframe)
 * => Xem thử trong Studio thấy gì thì learner trên eLearning thấy y như vậy.
 *
 * Nguyên tắc bố cục:
 *  1. "Video layer" (#vlayer) luôn trùng khít vùng hình video thật (trừ viền đen),
 *     mọi toạ độ % của pin / hotspot đều tính theo lớp này.
 *  2. Cỡ chữ gốc của stage tự tính theo kích thước khung video; toàn bộ thẻ câu hỏi dùng đơn vị em
 *     nên phóng to/thu nhỏ đồng bộ (14px trên điện thoại -> tối đa 30px khi toàn màn hình).
 *  3. Toàn màn hình áp cho cả khối player (video + thanh điều khiển nổi, tự ẩn).
 */
export interface PlayerHtmlOptions {
  /** Thẻ <script> nạp cầu nối LMS (scorm-api.js / xapi-api.js) hoặc script inline. Rỗng = chạy độc lập. */
  bridgeScript: string;
  modeLabel: string;
  /** Ẩn tiêu đề/danh sách điểm tương tác bên ngoài (dùng khi nhúng xem trước trong Studio). */
  compactChrome?: boolean;
}

export function generatePlayerHtml(courseJson: string, options: PlayerHtmlOptions): string {
  const safeJson = courseJson.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>Video tương tác</title>
  <style>
    :root { --brand: #0284c7; --brand-d: #0369a1; --fs: 15px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { -webkit-text-size-adjust: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.5; }
    body.embed { background: transparent; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 16px 20px 28px; }
    body.embed .wrap { max-width: none; padding: 0; }
    .header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    body.embed .header { display: none; }
    .title { font-size: 19px; font-weight: 700; color: #0f172a; }
    .meta { font-size: 13px; color: #475569; }
    .score-pill { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; font-weight: 600; color: var(--brand-d); background: #ffffff; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; }

    /* ---------- Player & Stage ---------- */
    .player { position: relative; }
    .stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #020617; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; font-size: 15px; line-height: 1.45; }
    @supports not (aspect-ratio: 16 / 9) { .stage { height: 0; padding-top: 56.25%; } }
    video.media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; display: block; }
    .fit { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
    #ytWrap { background: #000; }
    #ytWrap iframe { width: 100%; height: 100%; border: 0; display: block; }
    .yt-shield { position: absolute; inset: 0; z-index: 10; }
    .vlayer { z-index: 24; pointer-events: none; }
    .vroot { position: absolute; inset: 0; pointer-events: none; }
    .vroot > * { pointer-events: auto; }
    .ui-layer { position: absolute; inset: 0; z-index: 30; pointer-events: none; }
    .ui-layer > * { pointer-events: auto; }

    .video-error-box { position: absolute; inset: 0; z-index: 28; background: rgba(2,6,23,0.95); color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5em; text-align: center; gap: .6em; }
    .video-error-title { font-size: 1em; font-weight: 700; color: #fcd34d; }
    .video-error-desc { font-size: .85em; color: #cbd5e1; max-width: 36em; line-height: 1.55; }
    .video-error-link { display: inline-block; margin-top: .3em; padding: .55em 1em; border-radius: .55em; background: var(--brand); color: #fff; font-size: .85em; font-weight: 600; text-decoration: none; }

    /* Bài giảng mẫu tích hợp (cảnh tĩnh) */
    .builtin-scene { display: flex; flex-direction: column; justify-content: space-between; padding: 1.6em 1.9em; color: #fff; background-size: cover; background-position: center; overflow: hidden; }
    .builtin-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.58) 55%, rgba(2,6,23,0.22) 100%); pointer-events: none; }
    .builtin-top { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; font-size: .8em; color: #cbd5e1; }
    .builtin-body { position: relative; z-index: 2; max-width: 37em; margin: auto 0; }
    .builtin-chap { display: inline-block; font-size: .72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: .25em .6em; border-radius: .3em; background: rgba(255,255,255,0.12); color: #7dd3fc; border: 1px solid rgba(255,255,255,0.18); margin-bottom: .7em; }
    .builtin-body h2 { font-size: 1.45em; font-weight: 700; margin-bottom: .4em; line-height: 1.3; }
    .builtin-body p { font-size: .95em; color: #e2e8f0; margin-bottom: .8em; }
    .builtin-body ul { list-style: disc; padding-left: 1.2em; font-size: .9em; color: #f1f5f9; }
    .builtin-body li { margin-bottom: .4em; }
    .scene-bars { position: relative; z-index: 2; display: flex; gap: .4em; padding-top: .5em; }
    .scene-bar { flex: 1; height: .28em; background: rgba(255,255,255,0.22); border-radius: 999px; overflow: hidden; }
    .scene-bar-fill { height: 100%; background: #38bdf8; width: 0%; transition: width 0.15s linear; }
    .highlight-zone { position: absolute; z-index: 3; border: 2px solid rgba(251,191,36,0.92); background: rgba(251,191,36,0.12); border-radius: .5em; pointer-events: none; }
    .highlight-label { position: absolute; top: -1.7em; left: 0; background: #fbbf24; color: #0f172a; font-size: .72em; font-weight: 700; padding: .15em .5em; border-radius: .3em; white-space: nowrap; }

    .center-play { position: absolute; inset: 0; z-index: 20; background: rgba(2,6,23,0.35); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: inherit; }
    .center-play-circle { width: 2.6em; height: 2.6em; font-size: 1.7em; border-radius: 999px; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(0,0,0,0.4); padding-left: .12em; }
    .toast-banner { position: absolute; top: .9em; left: 50%; transform: translateX(-50%); z-index: 45; background: rgba(15,23,42,0.95); border: 1px solid rgba(251,191,36,0.6); color: #fde68a; padding: .55em 1em; border-radius: .55em; font-size: .85em; font-weight: 500; box-shadow: 0 8px 20px rgba(0,0,0,0.35); max-width: 90%; text-align: center; }
    .resume-banner { position: absolute; bottom: .9em; left: .9em; right: .9em; z-index: 40; background: rgba(15,23,42,0.94); border: 1px solid rgba(56,189,248,0.45); color: #f8fafc; padding: .7em 1em; border-radius: .7em; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .7em; font-size: .9em; }
    .subtitle-overlay { position: absolute; bottom: 1.1em; left: 50%; transform: translateX(-50%); z-index: 22; max-width: 88%; padding: .4em .9em; border-radius: .5em; background: rgba(2,6,23,0.86); border: 1px solid rgba(255,255,255,0.14); color: #fff; font-size: 1em; font-weight: 500; text-align: center; line-height: 1.45; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,0.4); transition: bottom .2s; }

    /* ---------- Thanh điều khiển ---------- */
    .controls { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: .85em 1.15em; margin-top: 12px; font-size: 13px; transition: opacity .25s ease; }
    .timeline { position: relative; height: 2em; display: flex; align-items: center; margin-bottom: .6em; }
    .track { position: relative; width: 100%; height: .6em; background: #e2e8f0; border-radius: 999px; cursor: pointer; touch-action: none; }
    .track::before { content: ""; position: absolute; left: 0; right: 0; top: -0.9em; bottom: -0.9em; }
    .fill { height: 100%; background: var(--brand); border-radius: 999px; width: 0%; pointer-events: none; }
    .pin { position: absolute; top: 50%; width: 1.1em; height: 1.1em; transform: translate(-50%, -50%) rotate(45deg); background: var(--brand); border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer; z-index: 5; padding: 0; }
    .pin.done { background: #10b981; }
    .pin.wrong { background: #ef4444; }
    .btn-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .7em; }
    .btn-group { display: flex; flex-wrap: wrap; align-items: center; gap: .55em; }
    .btn { padding: .55em 1em; min-height: 2.5em; border-radius: .55em; border: 1px solid #cbd5e1; background: #fff; font-size: .92em; font-weight: 600; cursor: pointer; color: #0f172a; font-family: inherit; line-height: 1.2; }
    .btn:hover { background: #f1f5f9; }
    .btn:focus-visible, .opt:focus-visible, .pin-btn:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
    .btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
    .btn-primary:hover { background: var(--brand-d); }
    .btn-dark { background: #0f172a; border-color: #0f172a; color: #fff; }
    .btn-dark:hover { background: #1e293b; }
    .btn-warn { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .select-rate { padding: .45em .6em; min-height: 2.5em; border-radius: .55em; border: 1px solid #cbd5e1; font-size: .92em; font-family: monospace; background: #fff; color: #0f172a; cursor: pointer; }
    .time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; color: #475569; margin-left: .3em; }
    .cc-wrap { display: inline-flex; align-items: center; gap: .45em; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: .55em; padding: .2em .45em; font-size: .92em; color: #334155; }
    .cc-seg { display: inline-flex; align-items: center; background: #fff; border: 1px solid #cbd5e1; border-radius: .4em; padding: 2px; }
    .cc-btn { border: none; background: transparent; padding: .25em .7em; border-radius: .3em; font-size: .9em; font-weight: 600; color: #475569; cursor: pointer; font-family: inherit; }
    .cc-btn.active-on { background: var(--brand); color: #fff; }
    .cc-btn.active-off { background: #0f172a; color: #fff; }

    /* ---------- Toàn màn hình (thật hoặc giả lập cho iPhone / iframe không cho phép) ---------- */
    .player.is-fs { position: fixed; inset: 0; z-index: 2147483000; width: 100vw; height: 100vh; height: 100dvh; background: #000; }
    .player.is-fs .stage { width: 100%; height: 100%; aspect-ratio: auto; padding-top: 0; border-radius: 0; border: 0; }
    .player.is-fs .controls { position: absolute; left: 0; right: 0; bottom: 0; z-index: 60; margin: 0; border: 0; border-radius: 0; color: #fff; background: linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.88) 38%, rgba(2,6,23,0.95) 100%); padding: 2.4em 1.6em calc(1em + env(safe-area-inset-bottom)); font-size: calc(var(--fs) * 0.82); }
    .player.is-fs .controls .btn, .player.is-fs .controls .select-rate { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.28); color: #fff; }
    .player.is-fs .controls .btn:hover { background: rgba(255,255,255,0.22); }
    .player.is-fs .controls .btn-dark { background: #fff; color: #0f172a; border-color: #fff; }
    .player.is-fs .controls .select-rate option { color: #0f172a; }
    .player.is-fs .controls .time { color: #e2e8f0; }
    .player.is-fs .controls .track { background: rgba(255,255,255,0.28); }
    .player.is-fs .controls .cc-wrap { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.28); color: #e2e8f0; }
    .player.is-fs .controls .cc-seg { background: transparent; border-color: rgba(255,255,255,0.28); }
    .player.is-fs .controls .cc-btn { color: #e2e8f0; }
    .player.is-fs.idle .controls, .player.is-fs.modal-open .controls { opacity: 0; pointer-events: none; }
    .player.is-fs.idle { cursor: none; }
    .player.is-fs:not(.idle):not(.modal-open) .subtitle-overlay { bottom: 5.2em; }
    .score-fs { display: none; }
    .player.is-fs .score-fs { display: inline-block; font-family: ui-monospace, monospace; font-weight: 600; color: #e0f2fe; }

    /* ---------- Thẻ câu hỏi (tất cả theo em -> co giãn theo khung video) ---------- */
    .overlay { position: absolute; inset: 0; z-index: 30; background: rgba(2,6,23,0.72); display: flex; align-items: center; justify-content: center; padding: .8em; overflow: hidden; }
    .card { width: min(100%, 40em); max-height: 100%; background: #fff; border-radius: .8em; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.35); display: flex; flex-direction: column; }
    .card-head { flex-shrink: 0; padding: .55em 1.1em; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: .82em; font-weight: 600; color: var(--brand-d); gap: 1em; }
    .card-body { flex: 1 1 auto; min-height: 0; padding: 1em 1.1em; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    .card-body h3 { font-size: 1.05em; font-weight: 700; margin-bottom: .35em; color: #0f172a; }
    .card-body p.prompt { font-size: 1.12em; font-weight: 600; color: #0f172a; margin-bottom: .8em; line-height: 1.45; }
    .opt { width: 100%; text-align: left; padding: .6em .9em; min-height: 2.75em; border: 1px solid #cbd5e1; border-radius: .55em; background: #fff; margin-bottom: .45em; cursor: pointer; font-size: 1em; display: block; color: #0f172a; font-family: inherit; line-height: 1.4; }
    .opt:hover { border-color: #94a3b8; }
    .opt.selected { border-color: var(--brand); background: #f0f9ff; box-shadow: inset 0 0 0 1px var(--brand); }
    .opt.correct { border-color: #10b981; background: #ecfdf5; }
    .opt.incorrect { border-color: #ef4444; background: #fef2f2; }
    .card-foot { flex-shrink: 0; padding: .65em 1.1em; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .55em; }
    .feedback { padding: .7em .85em; border-radius: .55em; font-size: .95em; margin-top: .7em; }
    .feedback.ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .feedback.bad { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .info-body { padding: .8em; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: .55em; font-size: 1em; white-space: pre-line; }
    .q-img { width: 100%; max-height: 11em; object-fit: contain; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: .55em; margin-bottom: .8em; display: block; }
    .muted { font-size: .85em; color: #64748b; }

    .hotspot-bar { position: absolute; top: .8em; left: .8em; right: .8em; z-index: 35; background: rgba(2,6,23,0.88); color: #fff; padding: .6em 1em; border-radius: .7em; display: flex; justify-content: space-between; align-items: center; gap: .8em; border: 1px solid rgba(255,255,255,0.15); }
    .ui-layer > .hotspot-bar { pointer-events: none; }
    .hotspot-bar .btn { pointer-events: auto; }
    .hotspot-bar .hs-q { font-size: 1.02em; font-weight: 600; }
    .hotspot-bar .hs-hint { font-size: .8em; color: #7dd3fc; }
    .hotspot-foot { position: absolute; bottom: .8em; left: .8em; right: .8em; z-index: 35; background: #fff; color: #0f172a; padding: .7em 1em; border-radius: .7em; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .8em; box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-size: .95em; max-height: 45%; overflow-y: auto; }
    .hotspot-area { position: absolute; inset: 0; z-index: 32; cursor: crosshair; }
    .hotspot-target { position: absolute; border: 2px solid #10b981; background: rgba(16,185,129,0.2); border-radius: .4em; pointer-events: none; }
    .hotspot-dot { position: absolute; width: 1.4em; height: 1.4em; border-radius: 999px; border: 2px solid #fff; transform: translate(-50%, -50%); pointer-events: none; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
    .pin-btn { position: absolute; z-index: 25; transform: translate(-50%, -50%); padding: .5em .9em; min-height: 2.4em; border-radius: .55em; background: var(--brand); color: #fff; border: 2px solid #bae6fd; font-size: .92em; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 16em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: inherit; animation: pinPulse 1.6s ease-in-out infinite; }
    @keyframes pinPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(2,132,199,.55), 0 4px 12px rgba(0,0,0,.3); } 50% { box-shadow: 0 0 0 .5em rgba(2,132,199,0), 0 4px 12px rgba(0,0,0,.3); } }
    @media (prefers-reduced-motion: reduce) { .pin-btn { animation: none; } }

    .blank-box { padding: .9em; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: .55em; font-size: 1em; line-height: 2.2; }
    .blank-input { padding: .2em .5em; border: 1px solid #94a3b8; border-radius: .4em; font-size: .95em; width: 8em; margin: 0 .25em; font-family: inherit; }
    .drag-slot { display: inline-flex; align-items: center; justify-content: center; min-width: 7em; min-height: 2em; margin: 0 .3em; padding: .15em .7em; border: 2px dashed #cbd5e1; border-radius: .55em; background: #fff; font-size: .9em; font-weight: 600; color: #94a3b8; cursor: pointer; vertical-align: middle; font-family: inherit; }
    .drag-slot.focus, .drag-slot.over { border-color: var(--brand); background: #e0f2fe; color: var(--brand-d); }
    .drag-slot.filled { border-style: solid; border-color: var(--brand); background: #f0f9ff; color: #0c4a6e; }
    .drag-slot.ok { border-style: solid; border-color: #10b981; background: #ecfdf5; color: #065f46; }
    .drag-slot.bad { border-style: solid; border-color: #ef4444; background: #fef2f2; color: #991b1b; }
    .drag-bank { margin-top: .8em; padding: .8em; border: 1px solid #e2e8f0; border-radius: .55em; background: #fff; }
    .drag-bank-title { font-size: .85em; color: #475569; margin-bottom: .5em; font-weight: 500; }
    .drag-chips { display: flex; flex-wrap: wrap; gap: .5em; }
    .word-chip { padding: .45em .8em; min-height: 2.3em; border: 1px solid #cbd5e1; border-radius: .55em; background: #f8fafc; font-size: .92em; font-weight: 600; color: #0f172a; cursor: grab; font-family: inherit; }
    .word-chip:hover { border-color: var(--brand); background: #f0f9ff; color: var(--brand-d); }
    .word-chip.used { opacity: 0.45; text-decoration: line-through; cursor: default; background: #f1f5f9; }
    .order-row { display: flex !important; justify-content: space-between; align-items: center; gap: .6em; cursor: default; }
    .order-row .btn { min-height: 2.2em; padding: .3em .75em; }

    /* Màn hình nhỏ (điện thoại / khung LMS hẹp): thẻ câu hỏi bật lên dạng bottom-sheet để không bị chật */
    .player.compact .overlay { position: fixed; inset: 0; z-index: 2147483001; align-items: flex-end; padding: 0; font-size: 15px; }
    .player.compact .card { width: 100%; max-width: 640px; max-height: 88vh; max-height: 88dvh; border-radius: 1em 1em 0 0; }
    .player.compact .subtitle-overlay { font-size: .92em; bottom: .5em; max-width: 94%; }
    .player.compact .card-foot { padding-bottom: calc(.65em + env(safe-area-inset-bottom)); }

    .checkpoint-list { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-top: 12px; }
    body.embed .checkpoint-list { display: none; }
    .checkpoint-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 10px; }
    .cp-item { text-align: left; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; font-family: inherit; }
    .cp-item:hover { border-color: #38bdf8; background: #f0f9ff; }
    .hidden { display: none !important; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  </style>
</head>
<body${options.compactChrome ? ' class="embed"' : ''}>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="title" id="courseTitle"></div>
      </div>
      <div class="score-pill" id="scoreBadge">Điểm: 0%</div>
    </div>

    <div class="player" id="player">
      <div class="stage" id="stage">
        <video id="videoEl" class="media hidden" playsinline webkit-playsinline preload="metadata"></video>
        <div id="ytWrap" class="fit hidden">
          <div id="ytPlayerMount" style="width:100%;height:100%"></div>
          <div class="yt-shield"></div>
        </div>
        <div id="builtinScene" class="fit builtin-scene hidden">
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
        <div id="videoErrorBox" class="video-error-box hidden"></div>
        <button type="button" class="center-play" id="centerPlayBtn" aria-label="Phát video">
          <span class="center-play-circle">&#9654;</span>
        </button>
        <div id="vlayer" class="fit vlayer">
          <div id="vRoot" class="vroot"></div>
          <div id="subtitleBox" class="subtitle-overlay hidden" aria-live="polite"></div>
        </div>
        <div id="overlayRoot" class="ui-layer"></div>
        <div id="toastBanner" class="toast-banner hidden" role="status"></div>
        <div id="resumeBanner" class="resume-banner hidden">
          <span id="resumeText"></span>
          <div class="btn-group">
            <button type="button" class="btn btn-primary" id="resumeContinueBtn">Học tiếp</button>
            <button type="button" class="btn" id="resumeRestartBtn">Học lại từ đầu</button>
          </div>
        </div>
        <div id="liveRegion" class="sr-only" aria-live="assertive"></div>
      </div>

      <div class="controls" id="controls">
        <div class="timeline">
          <div class="track" id="track" role="slider" aria-label="Thanh tiến độ video" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="fill" id="fill"></div>
          </div>
        </div>
        <div class="btn-row">
          <div class="btn-group">
            <button type="button" class="btn btn-dark" id="playBtn">Phát video</button>
            <span class="time" id="timeText">00:00 / 00:00</span>
            <button type="button" class="btn hidden" id="muteBtn">Tắt tiếng</button>
            <span class="score-fs" id="scoreFs"></span>
          </div>
          <div class="btn-group">
            <div id="ccWrap" class="cc-wrap hidden">
              <span style="font-weight:600">Phụ đề:</span>
              <div class="cc-seg" role="group" aria-label="Bật hoặc tắt phụ đề">
                <button type="button" class="cc-btn" id="ccOnBtn">Bật</button>
                <button type="button" class="cc-btn" id="ccOffBtn">Tắt</button>
              </div>
            </div>
            <button type="button" class="btn" id="textSizeBtn" title="Đổi cỡ chữ câu hỏi">Aa · Vừa</button>
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
    </div>

    <div class="checkpoint-list">
      <div class="meta" style="font-weight:600;color:#334155" id="cpHeader">Danh sách điểm tương tác</div>
      <div class="checkpoint-grid" id="cpGrid"></div>
    </div>
  </div>

  ${options.bridgeScript}
  <script>
  (function () {
    var COURSE = ${safeJson};
    var SORTED = (COURSE.interactions || []).slice().sort(function (a, b) { return a.timestamp - b.timestamp; });
    var IDX = {};
    SORTED.forEach(function (it, i) { IDX[it.id] = i; });
    var LMS = window.ScormBridge || window.XapiBridge || null;
    var LOCAL_KEY = window.LUMICAST_EPHEMERAL ? "" : "mm_lumicast_progress_" + COURSE.id;
    var TEXT_KEY = "mm_lumicast_text_scale";
    var TEXT_SCALES = [{ v: 1, label: "Vừa" }, { v: 1.15, label: "Lớn" }, { v: 1.3, label: "Rất lớn" }, { v: 0.9, label: "Nhỏ" }];

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
      openedAt: {},
      activeId: null,
      expanded: false,
      summary: false,
      textScaleIdx: 0
    };

    function $(id) { return document.getElementById(id); }
    var playerEl = $("player");
    var stageEl = $("stage");
    var videoEl = $("videoEl");
    var ytWrapEl = $("ytWrap");
    var builtinEl = $("builtinScene");
    var vlayerEl = $("vlayer");
    var vRoot = $("vRoot");
    var overlayRoot = $("overlayRoot");
    var subtitleBox = $("subtitleBox");
    var ccWrap = $("ccWrap");
    var ccOnBtn = $("ccOnBtn");
    var ccOffBtn = $("ccOffBtn");
    var trackEl = $("track");
    var fillEl = $("fill");
    var playBtn = $("playBtn");
    var muteBtn = $("muteBtn");
    var centerPlayBtn = $("centerPlayBtn");
    var timeText = $("timeText");
    var scoreBadge = $("scoreBadge");
    var scoreFs = $("scoreFs");
    var toastEl = $("toastBanner");
    var resumeBanner = $("resumeBanner");
    var fsBtn = $("fullscreenBtn");
    var textSizeBtn = $("textSizeBtn");
    var liveRegion = $("liveRegion");
    var toastTimer = null;

    $("courseTitle").textContent = COURSE.title;
    $("sceneCourseName").textContent = COURSE.title;

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function fmt(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
    }
    function announce(msg) { liveRegion.textContent = ""; setTimeout(function () { liveRegion.textContent = msg; }, 30); }
    function showToast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.remove("hidden");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.add("hidden"); }, 3500);
    }

    /* ================= BỐ CỤC: video layer + cỡ chữ co giãn ================= */
    try {
      var savedScale = Number(localStorage.getItem(TEXT_KEY));
      TEXT_SCALES.forEach(function (s, i) { if (s.v === savedScale) state.textScaleIdx = i; });
    } catch (e) {}

    function getVideoRatio() {
      if ((COURSE.videoSourceType === "upload" || COURSE.videoSourceType === "url") && videoEl.videoWidth && videoEl.videoHeight) {
        return videoEl.videoWidth / videoEl.videoHeight;
      }
      return 16 / 9;
    }

    function layoutStage() {
      var w = stageEl.clientWidth, h = stageEl.clientHeight;
      if (!w || !h) return;
      var ratio = getVideoRatio();
      var vw, vh;
      if (w / h > ratio) { vh = h; vw = h * ratio; } else { vw = w; vh = w / ratio; }
      var left = (w - vw) / 2, top = (h - vh) / 2;
      [vlayerEl, ytWrapEl, builtinEl].forEach(function (el) {
        el.style.left = left + "px"; el.style.top = top + "px";
        el.style.width = vw + "px"; el.style.height = vh + "px";
      });
      var base = Math.max(14, Math.min(30, Math.min(w / 52, h / 29)));
      var fs = base * TEXT_SCALES[state.textScaleIdx].v;
      stageEl.style.fontSize = fs.toFixed(2) + "px";
      playerEl.style.setProperty("--fs", fs.toFixed(2) + "px");
      playerEl.classList.toggle("compact", !playerEl.classList.contains("is-fs") && h < 300);
      postHeight();
    }
    var lastPostedH = 0;
    function postHeight() {
      if (window.parent === window) return;
      var wrapEl = document.querySelector(".wrap");
      var hh = Math.ceil(wrapEl ? wrapEl.getBoundingClientRect().height : document.body.scrollHeight);
      if (Math.abs(hh - lastPostedH) < 2) return;
      lastPostedH = hh;
      try { window.parent.postMessage({ type: "lumicast-height", height: hh }, "*"); } catch (e) {}
    }
    if (window.ResizeObserver) { new ResizeObserver(layoutStage).observe(stageEl); }
    window.addEventListener("resize", layoutStage);
    window.addEventListener("orientationchange", function () { setTimeout(layoutStage, 250); });

    textSizeBtn.textContent = "Aa · " + TEXT_SCALES[state.textScaleIdx].label;
    textSizeBtn.onclick = function () {
      state.textScaleIdx = (state.textScaleIdx + 1) % TEXT_SCALES.length;
      textSizeBtn.textContent = "Aa · " + TEXT_SCALES[state.textScaleIdx].label;
      try { localStorage.setItem(TEXT_KEY, String(TEXT_SCALES[state.textScaleIdx].v)); } catch (e) {}
      layoutStage();
    };

    /* ================= TOÀN MÀN HÌNH ================= */
    var fakeFsOn = false;
    function isFs() { return playerEl.classList.contains("is-fs"); }
    function setFsUI(on) {
      playerEl.classList.toggle("is-fs", on);
      fsBtn.textContent = on ? "Thoát toàn màn hình" : "Toàn màn hình";
      layoutStage();
      bumpIdle();
    }
    function fakeFs(on) {
      fakeFsOn = on;
      document.documentElement.style.overflow = on ? "hidden" : "";
      setFsUI(on);
    }
    function enterFs() {
      var req = playerEl.requestFullscreen || playerEl.webkitRequestFullscreen;
      if (req) {
        try {
          var p = req.call(playerEl);
          if (p && p.catch) p.catch(function () { fakeFs(true); });
          return;
        } catch (e) {}
      }
      fakeFs(true);
    }
    function exitFs() {
      if (fakeFsOn) { fakeFs(false); return; }
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { try { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    }
    function onFsChange() {
      var el = document.fullscreenElement || document.webkitFullscreenElement;
      if (fakeFsOn) return;
      setFsUI(el === playerEl);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    fsBtn.onclick = function () { isFs() ? exitFs() : enterFs(); };

    var idleTimer = null;
    function bumpIdle() {
      playerEl.classList.remove("idle");
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (isFs() && state.playing) playerEl.classList.add("idle");
      }, 2800);
    }
    ["mousemove", "touchstart", "pointerdown", "keydown"].forEach(function (ev) {
      playerEl.addEventListener(ev, bumpIdle, { passive: true });
    });

    /* ================= LƯU TIẾN ĐỘ GỌN (an toàn với giới hạn 4.096 ký tự của SCORM 1.2) ================= */
    function optIndex(it, id) {
      var opts = it.options || [];
      for (var i = 0; i < opts.length; i++) if (opts[i].id === id) return i;
      return -1;
    }
    function encodeAnswer(it, a, lite) {
      var row = [IDX[it.id], a.isCorrect ? 1 : 0, a.earned || 0, a.attemptsUsed || state.attempts[it.id] || 1];
      if (lite) return row;
      if (a.selected) row.push("s:" + a.selected.map(function (id) { return optIndex(it, id); }).join("."));
      else if (a.order) row.push("o:" + a.order.map(function (t) { return (it.orderingItems || []).indexOf(t); }).join("."));
      else if (a.blanks) row.push(["b"].concat(a.blanks));
      else if (a.clickedPoint) row.push("p:" + a.clickedPoint.x + "," + a.clickedPoint.y);
      return row;
    }
    function decodeAnswer(row) {
      var it = SORTED[row[0]];
      if (!it) return null;
      var a = { isCorrect: row[1] === 1, earned: row[2] || 0, attemptsUsed: row[3] || 1 };
      var p = row[4];
      if (Object.prototype.toString.call(p) === "[object Array]" && p[0] === "b") a.blanks = p.slice(1);
      else if (typeof p === "string") {
        var k = p.slice(0, 2), v = p.slice(2);
        if (k === "s:") a.selected = v === "" ? [] : v.split(".").map(function (n) { var o = (it.options || [])[Number(n)]; return o ? o.id : null; }).filter(Boolean);
        else if (k === "o:") a.order = v.split(".").map(function (n) { return (it.orderingItems || [])[Number(n)]; });
        else if (k === "p:") { var xy = v.split(","); a.clickedPoint = { x: Number(xy[0]), y: Number(xy[1]) }; }
      }
      return { id: it.id, ans: a };
    }
    var pendingResume = null;
    function currentSaveTime() {
      return pendingResume !== null ? Math.max(pendingResume, state.time) : state.time;
    }
    function encodeProgress() {
      var answered = SORTED.filter(function (it) { return state.answers[it.id]; });
      var obj = { v: 2, t: Math.floor(currentSaveTime()), a: answered.map(function (it) { return encodeAnswer(it, state.answers[it.id], false); }) };
      var s = JSON.stringify(obj);
      if (s.length > 3800) {
        obj.a = answered.map(function (it) { return encodeAnswer(it, state.answers[it.id], true); });
        s = JSON.stringify(obj);
      }
      return s;
    }
    function decodeProgress(raw) {
      if (!raw) return null;
      var o;
      try { o = JSON.parse(raw); } catch (e) { return null; }
      if (!o) return null;
      if (o.v === 2) {
        var answers = {}, attempts = {};
        (o.a || []).forEach(function (r) {
          var d = decodeAnswer(r);
          if (d) { answers[d.id] = d.ans; attempts[d.id] = d.ans.attemptsUsed || 1; }
        });
        return { time: o.t || 0, answers: answers, attempts: attempts };
      }
      return { time: o.time || 0, answers: o.answers || {}, attempts: o.attempts || {} };
    }

    /* ================= GHI KẾT QUẢ TỪNG CÂU (cmi.interactions / xAPI answered) ================= */
    function letter(i) { return i >= 0 && i < 26 ? "abcdefghijklmnopqrstuvwxyz".charAt(i) : "o" + i; }
    function safeId(s) { return String(s || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 60); }
    function cleanTxt(s) { return String(s || "").replace(/\\[,\\]/g, ", ").replace(/\\s+/g, " ").trim(); }
    function buildInteractionRecord(item, ans) {
      var rec = {
        id: "Q" + (IDX[item.id] + 1) + "_" + safeId(item.id),
        type: "other",
        response: [],
        correct: [],
        result: ans.isCorrect ? "correct" : "incorrect",
        weight: item.points || 0,
        description: cleanTxt(item.prompt || item.title).slice(0, 250),
        latencyMs: state.openedAt[item.id] ? Date.now() - state.openedAt[item.id] : 0
      };
      var opts = item.options || [];
      if (item.type === "multiple_choice" || item.type === "multi_select" || item.type === "true_false") {
        rec.type = "choice";
        rec.response = (ans.selected || []).map(function (id) { return letter(optIndex(item, id)); });
        rec.correct = opts.map(function (o, i) { return o.isCorrect ? letter(i) : null; }).filter(Boolean);
        rec.choices = opts.map(function (o, i) { return { id: letter(i), text: cleanTxt(o.text) }; });
      } else if (item.type === "fill_blank" || item.type === "drag_text") {
        rec.type = "fill-in";
        rec.response = (ans.blanks || []).map(cleanTxt);
        rec.correct = parseBlanks(item.blankSentence || "").filter(function (p) { return p.type === "blank"; }).map(function (p) { return cleanTxt(p.value); });
      } else if (item.type === "ordering") {
        var items = item.orderingItems || [];
        rec.type = "sequencing";
        rec.response = (ans.order || []).map(function (t) { return letter(items.indexOf(t)); });
        rec.correct = items.map(function (_, i) { return letter(i); });
        rec.choices = items.map(function (t, i) { return { id: letter(i), text: cleanTxt(t) }; });
      } else if (item.type === "hotspot") {
        rec.type = "other";
        rec.response = ans.clickedPoint ? [ans.clickedPoint.x + "," + ans.clickedPoint.y] : [];
      }
      return rec;
    }
    function reportInteraction(item, ans) {
      if (!LMS || !LMS.recordInteraction || item.type === "info") return;
      try { LMS.recordInteraction(buildInteractionRecord(item, ans)); } catch (e) {}
    }
    function lmsEvent(name, data) {
      if (LMS && LMS.event) { try { LMS.event(name, data); } catch (e) {} }
    }

    /* ================= TIỆN ÍCH NỘI DUNG ================= */
    function shuffleDeterministic(items, seedStr) {
      if (!items || items.length <= 1) return (items || []).slice();
      var arr = items.slice();
      var seed = 0;
      for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000;
      for (var j = arr.length - 1; j > 0; j--) {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        var k = seed % (j + 1);
        var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
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
      sentence = sentence || "";
      while ((m = regex.exec(sentence)) !== null) {
        if (m.index > last) parts.push({ type: "text", value: sentence.slice(last, m.index) });
        parts.push({ type: "blank", value: m[1], index: idx++ });
        last = regex.lastIndex;
      }
      if (last < sentence.length) parts.push({ type: "text", value: sentence.slice(last) });
      return parts;
    }
    function buildWordBank(item) {
      var targets = parseBlanks(item.blankSentence || "").filter(function (p) { return p.type === "blank"; }).map(function (p) { return p.value.trim(); }).filter(Boolean);
      var dist = (item.distractorWords || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
      return shuffleDeterministic(targets.concat(dist), item.id || "drag");
    }
    function getCleanLabel(it) {
      return it.title && it.title.indexOf("Điểm tương tác mới") !== 0 ? it.title : (it.prompt || "Câu hỏi tương tác");
    }

    /* ================= KẾT NỐI LMS & KHÔI PHỤC TIẾN ĐỘ ================= */
    function applySaved(saved) {
      if (!saved || !(Object.keys(saved.answers || {}).length > 0 || (saved.time && saved.time > 2))) return;
      state.answers = saved.answers || {};
      state.attempts = saved.attempts || {};
      SORTED.forEach(function (it) {
        if (state.answers[it.id] && !state.attempts[it.id]) state.attempts[it.id] = state.answers[it.id].attemptsUsed || 1;
        if (state.answers[it.id] || it.timestamp < (saved.time || 0)) state.triggered[it.id] = true;
      });
      var savedTime = Math.min(state.duration, saved.time || 0);
      pendingResume = savedTime;
      $("resumeText").textContent = "Đã lưu tiến độ tại " + fmt(savedTime) + " (" + Object.keys(state.answers).length + " tương tác đã làm).";
      resumeBanner.classList.remove("hidden");
      centerPlayBtn.classList.add("hidden");
      $("resumeContinueBtn").onclick = function () {
        pendingResume = null;
        resumeBanner.classList.add("hidden");
        seekVideo(savedTime, true);
        playVideo();
      };
      $("resumeRestartBtn").onclick = function () {
        pendingResume = null;
        resumeBanner.classList.add("hidden");
        resetCourse();
      };
      renderPins();
      renderCheckpointCards();
      syncProgress(false);
    }

    function loadSavedProgress() {
      var localRaw = null;
      try { if (LOCAL_KEY) localRaw = localStorage.getItem(LOCAL_KEY); } catch (e) {}
      var done = function (raw) {
        progressReady = true;
        applySaved(decodeProgress(raw));
        syncProgress(false);
      };
      if (LMS && LMS.isConnected && LMS.isConnected()) {
        // Đã kết nối LMS: chỉ dùng dữ liệu của LMS (tránh lấy nhầm tiến độ của người khác trên máy dùng chung)
        LMS.loadProgress(done);
      } else {
        done(localRaw);
      }
    }

    if (LMS) {
      LMS.init();
      var finished = false;
      var finishOnce = function () { if (finished) return; finished = true; syncProgress(false); LMS.finish(); };
      window.addEventListener("pagehide", finishOnce);
      window.addEventListener("beforeunload", finishOnce);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") syncProgress(false);
      });
    }

    /* ================= NGUỒN VIDEO ================= */
    var videoErrorBox = $("videoErrorBox");
    function showVideoError(title, desc, linkHref, linkLabel) {
      centerPlayBtn.classList.add("hidden");
      videoErrorBox.innerHTML = "";
      var tEl = document.createElement("div"); tEl.className = "video-error-title"; tEl.textContent = title;
      var dEl = document.createElement("p"); dEl.className = "video-error-desc"; dEl.textContent = desc;
      videoErrorBox.appendChild(tEl); videoErrorBox.appendChild(dEl);
      if (linkHref) {
        var aEl = document.createElement("a");
        aEl.className = "video-error-link"; aEl.href = linkHref; aEl.target = "_blank"; aEl.rel = "noopener noreferrer";
        aEl.textContent = linkLabel || "Mở video trên YouTube";
        videoErrorBox.appendChild(aEl);
      }
      videoErrorBox.classList.remove("hidden");
    }

    var ytPlayer = null;
    if (COURSE.videoSourceType === "builtin") {
      builtinEl.classList.remove("hidden");
    } else if (COURSE.videoSourceType === "youtube" && COURSE.youtubeId) {
      ytWrapEl.classList.remove("hidden");
      muteBtn.classList.remove("hidden");
      var proto = window.location.protocol;
      var ytWatchUrl = "https://www.youtube.com/watch?v=" + COURSE.youtubeId;
      var pageOrigin = "";
      try {
        var o1 = window.origin, o2 = window.location.origin;
        pageOrigin = o1 && o1 !== "null" ? o1 : (o2 && o2 !== "null" ? o2 : "");
      } catch (e) {}
      if (proto === "file:") {
        showVideoError(
          "Không thể phát video YouTube khi mở file trực tiếp trên máy (Lỗi 153)",
          "YouTube chặn nhúng video khi file HTML được mở theo đường dẫn file:// trên ổ đĩa. Hãy tải gói lên hệ thống eLearning / web HTTPS, hoặc dùng video .mp4 tải từ máy rồi xuất lại.",
          ytWatchUrl, "Mở video gốc trên YouTube"
        );
      } else {
        var ytReady = false;
        var ytBlockedMsg = function () {
          if (ytReady) return;
          showVideoError(
            "Không tải được video YouTube",
            "Mạng đang dùng có thể chặn YouTube (thường gặp ở mạng nội bộ công ty, Wi-Fi tại Trung tâm MM hoặc máy đã cài phần mềm lọc web), hoặc mạng quá chậm. Cách xử lý: thử mạng khác (4G), nhờ bộ phận IT mở truy cập youtube.com và *.googlevideo.com, hoặc dùng video MP4 tải lên Studio rồi xuất lại bài.",
            ytWatchUrl, "Mở video trên YouTube"
          );
        };
        var ytTimer = setTimeout(ytBlockedMsg, 15000);
        window.onYouTubeIframeAPIReady = function () {
          var pVars = { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, enablejsapi: 1, fs: 0 };
          if (pageOrigin) { pVars.origin = pageOrigin; pVars.widget_referrer = document.referrer || window.location.href; }
          ytPlayer = new window.YT.Player("ytPlayerMount", {
            width: "100%", height: "100%", host: "https://www.youtube.com", videoId: COURSE.youtubeId, playerVars: pVars,
            events: {
              onReady: function (e) {
                ytReady = true;
                clearTimeout(ytTimer);
                videoErrorBox.classList.add("hidden");
                try { var fr = e.target.getIframe && e.target.getIframe(); if (fr) fr.referrerPolicy = "strict-origin-when-cross-origin"; } catch (err) {}
                var d = e.target.getDuration();
                if (d && isFinite(d)) { state.duration = d; renderPins(); renderCheckpointCards(); }
              },
              onStateChange: function (e) {
                if (e.data === 1) {
                  videoErrorBox.classList.add("hidden");
                  state.playing = true; playBtn.textContent = "Tạm dừng"; centerPlayBtn.classList.add("hidden");
                  var d = e.target.getDuration(); if (d && isFinite(d)) state.duration = d;
                } else if (e.data === 2) {
                  state.playing = false; playBtn.textContent = "Phát video"; bumpIdle();
                } else if (e.data === 0) {
                  pauseVideo(); state.summary = true; renderOverlay(); syncProgress(true);
                }
              },
              onError: function (e) {
                var code = e && e.data;
                if (code === 101 || code === 150) {
                  showVideoError("Video YouTube không cho phép nhúng ngoài (Lỗi " + code + ")", "Chủ sở hữu video đã tắt quyền nhúng. Vui lòng dùng video khác hoặc tải tệp .mp4 lên Lumi Cast Studio.", ytWatchUrl, "Xem trực tiếp trên YouTube");
                } else if (code === 153) {
                  showVideoError("YouTube chặn nhúng trong khung hiện tại (Lỗi 153)", "Hệ thống eLearning đang ẩn thông tin nguồn (Referer) khi tải khung bài học. Hãy cho phép gửi Referer, hoặc dùng video .mp4 rồi xuất lại gói.", ytWatchUrl, "Mở video gốc trên YouTube");
                } else {
                  showVideoError("Không tải được video YouTube (Mã lỗi " + code + ")", "Vui lòng kiểm tra kết nối Internet hoặc thay bằng tệp video .mp4.", ytWatchUrl, "Mở video trên YouTube");
                }
              }
            }
          });
          setInterval(function () {
            if (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 1) {
              state.time = ytPlayer.getCurrentTime();
              onTick();
            }
          }, 120);
        };
        var ytTag = document.createElement("script");
        ytTag.onerror = function () { clearTimeout(ytTimer); ytBlockedMsg(); };
        ytTag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(ytTag);
      }
    } else {
      videoEl.classList.remove("hidden");
      muteBtn.classList.remove("hidden");
      videoEl.src = COURSE.packagedVideoPath || COURSE.videoUrl || "";
      videoEl.addEventListener("loadedmetadata", function () {
        if (videoEl.duration && isFinite(videoEl.duration)) state.duration = videoEl.duration;
        layoutStage();
        renderPins();
        renderCheckpointCards();
      });
      videoEl.addEventListener("timeupdate", function () { state.time = videoEl.currentTime; onTick(); });
      videoEl.addEventListener("ended", function () { pauseVideo(); state.summary = true; renderOverlay(); syncProgress(true); });
      videoEl.addEventListener("error", function () {
        showVideoError("Không thể mở nguồn video", "Nếu bạn đang mở file trong tệp .zip, hãy giải nén toàn bộ thư mục trước khi mở index.html. Nếu dùng link MP4 ngoài, hãy kiểm tra lại đường dẫn hoặc quyền truy cập (CORS) của máy chủ chứa video.", "", "");
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
      $("sceneChap").textContent = "Phân đoạn " + (scIdx + 1) + " / " + scenes.length;
      $("sceneTitle").textContent = sc.title;
      $("sceneSub").textContent = sc.subtitle;
      $("sceneTimerText").textContent = fmt(state.time) + " / " + fmt(state.duration);
      var ul = $("sceneBullets");
      ul.innerHTML = "";
      (sc.bulletPoints || []).forEach(function (b) { var li = document.createElement("li"); li.textContent = b; ul.appendChild(li); });
      var hz = $("highlightZone");
      if (sc.highlightZone) {
        hz.classList.remove("hidden");
        hz.style.left = sc.highlightZone.x + "%"; hz.style.top = sc.highlightZone.y + "%";
        hz.style.width = sc.highlightZone.w + "%"; hz.style.height = sc.highlightZone.h + "%";
        $("highlightLabel").textContent = sc.highlightZone.label;
      } else {
        hz.classList.add("hidden");
      }
      var bars = $("sceneBars");
      bars.innerHTML = "";
      scenes.forEach(function (sItem) {
        var b = document.createElement("div"); b.className = "scene-bar";
        var f = document.createElement("div"); f.className = "scene-bar-fill";
        var span = Math.max(1, sItem.endTime - sItem.startTime);
        var pct = state.time >= sItem.endTime ? 100 : state.time <= sItem.startTime ? 0 : Math.round(((state.time - sItem.startTime) / span) * 100);
        f.style.width = pct + "%";
        b.appendChild(f); bars.appendChild(b);
      });
    }

    function renderPins() {
      trackEl.querySelectorAll(".pin").forEach(function (el) { el.remove(); });
      SORTED.forEach(function (item, i) {
        var pin = document.createElement("button");
        pin.type = "button";
        pin.className = "pin";
        var ans = state.answers[item.id];
        if (ans && item.type !== "info") pin.className += ans.isCorrect ? " done" : " wrong";
        else if (ans) pin.className += " done";
        pin.style.left = Math.min(100, Math.max(0, (item.timestamp / state.duration) * 100)) + "%";
        pin.title = fmt(item.timestamp) + " · " + getCleanLabel(item);
        pin.setAttribute("aria-label", "Điểm tương tác " + (i + 1) + " tại " + fmt(item.timestamp));
        pin.onclick = function (e) { e.stopPropagation(); tryOpenCheckpoint(item); };
        trackEl.appendChild(pin);
      });
    }

    function renderCheckpointCards() {
      var grid = $("cpGrid");
      grid.innerHTML = "";
      $("cpHeader").textContent = "Danh sách điểm tương tác (" + SORTED.length + ")" + (COURSE.preventSkipping ? " · Bắt buộc làm theo thứ tự" : "");
      SORTED.forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cp-item";
        var ans = state.answers[item.id];
        var statusTxt = item.type === "info" ? "Ghi chú" : ans ? (ans.isCorrect ? "Đúng (+" + ans.earned + ")" : "Sai (0)") : "Chưa làm";
        var statusColor = item.type === "info" ? "#64748b" : ans ? (ans.isCorrect ? "#059669" : "#dc2626") : "#d97706";
        btn.innerHTML = '<div style="min-width:0"><div style="font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(getCleanLabel(item)) + '</div><div style="color:#0369a1;font-family:monospace;font-size:11px">' + fmt(item.timestamp) + '</div></div><span style="font-weight:600;color:' + statusColor + ';white-space:nowrap">' + statusTxt + '</span>';
        btn.onclick = function () { tryOpenCheckpoint(item); };
        grid.appendChild(btn);
      });
    }

    function computeScore() {
      var gradable = SORTED.filter(function (i) { return i.type !== "info"; });
      var maxPts = gradable.reduce(function (s, i) { return s + (i.points || 0); }, 0);
      var earned = gradable.reduce(function (s, i) { return s + (state.answers[i.id] ? state.answers[i.id].earned || 0 : 0); }, 0);
      var pct = maxPts > 0 ? Math.round((earned / maxPts) * 100) : 100;
      var answered = gradable.filter(function (i) { return !!state.answers[i.id]; }).length;
      return {
        pct: pct, earned: earned, max: maxPts, answered: answered, totalGradable: gradable.length,
        passed: pct >= COURSE.passingScore && (answered === gradable.length || gradable.length === 0),
        allAnswered: answered === gradable.length
      };
    }

    var progressReady = false;
    function syncProgress(completedFlag) {
      var sc = computeScore();
      var isDone = Boolean(completedFlag) || (state.time >= state.duration - 0.5 && sc.allAnswered);
      scoreBadge.textContent = "Điểm: " + sc.pct + "% (" + sc.earned + "/" + sc.max + ")";
      scoreFs.textContent = "Điểm " + sc.pct + "%";
      // Chưa đọc xong tiến độ cũ từ LMS thì không ghi đè (tránh mất tiến độ khi mạng chậm)
      if (!progressReady) return;
      var raw = encodeProgress();
      try { if (LOCAL_KEY) localStorage.setItem(LOCAL_KEY, raw); } catch (e) {}
      if (LMS) LMS.reportProgress(sc.pct, sc.passed, isDone, raw, currentSaveTime());
    }

    function updateSubtitleControls() {
      var subs = COURSE.subtitles || [];
      if (!subs.length) { ccWrap.classList.add("hidden"); subtitleBox.classList.add("hidden"); return; }
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
      var cue = null;
      for (var i = 0; i < subs.length; i++) {
        if (state.time >= subs[i].startTime && state.time <= subs[i].endTime) { cue = subs[i]; break; }
      }
      if (cue) {
        if (subtitleBox.textContent !== cue.text) subtitleBox.textContent = cue.text;
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
        var p = videoEl.play();
        if (p && p.catch) p.catch(function () { state.playing = false; playBtn.textContent = "Phát video"; centerPlayBtn.classList.remove("hidden"); });
      }
      lmsEvent("played", { time: state.time });
      bumpIdle();
    }

    function pauseVideo() {
      var wasPlaying = state.playing;
      state.playing = false;
      playBtn.textContent = "Phát video";
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
      else if (COURSE.videoSourceType !== "builtin") videoEl.pause();
      if (wasPlaying) lmsEvent("paused", { time: state.time });
      bumpIdle();
    }

    function findBlocker(target) {
      if (!COURSE.preventSkipping) return null;
      return SORTED.find(function (i) {
        return i.type !== "info" && i.timestamp > state.time + 0.5 && i.timestamp < target && !state.answers[i.id];
      }) || null;
    }

    function seekVideo(t, bypass) {
      t = Math.max(0, Math.min(state.duration, t));
      if (!bypass && t > state.time) {
        var blocker = findBlocker(t);
        if (blocker) {
          showToast('Vui lòng hoàn thành "' + getCleanLabel(blocker) + '" tại ' + fmt(blocker.timestamp) + ' trước khi tua tiếp.');
          return false;
        }
      }
      state.prevTime = t;
      state.time = t;
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(t, true);
      else if (COURSE.videoSourceType !== "builtin") { try { videoEl.currentTime = t; } catch (e) {} }
      SORTED.forEach(function (it) { if (it.timestamp >= t - 0.3) delete state.triggered[it.id]; });
      onTick();
      return true;
    }

    function userSeek(t) {
      var from = state.time;
      if (seekVideo(t, false)) lmsEvent("seeked", { from: from, to: state.time });
    }

    function tryOpenCheckpoint(item) {
      var blocker = findBlocker(item.timestamp + 0.01);
      if (blocker && blocker.id !== item.id && !state.answers[item.id]) {
        showToast('Vui lòng hoàn thành "' + getCleanLabel(blocker) + '" tại ' + fmt(blocker.timestamp) + ' trước.');
        return;
      }
      openCheckpoint(item);
    }

    function openCheckpoint(item) {
      pauseVideo();
      seekVideo(item.timestamp, true);
      state.triggered[item.id] = true;
      state.activeId = item.id;
      state.expanded = true;
      state.summary = false;
      renderOverlay();
    }

    function closeActive(resume) {
      state.activeId = null;
      state.expanded = false;
      renderOverlay();
      if (resume) playVideo();
    }

    function resetCourse() {
      pauseVideo();
      state.answers = {}; state.attempts = {}; state.triggered = {}; state.openedAt = {};
      state.activeId = null; state.expanded = false; state.summary = false;
      seekVideo(0, true);
      renderPins(); renderCheckpointCards(); renderOverlay();
      syncProgress(false);
      centerPlayBtn.classList.remove("hidden");
    }

    /* ================= ĐIỀU KHIỂN ================= */
    playBtn.onclick = function () { state.playing ? pauseVideo() : playVideo(); };
    centerPlayBtn.onclick = playVideo;
    muteBtn.onclick = function () {
      state.muted = !state.muted;
      if (COURSE.videoSourceType === "youtube" && ytPlayer) { if (state.muted) ytPlayer.mute(); else ytPlayer.unMute(); }
      else videoEl.muted = state.muted;
      muteBtn.textContent = state.muted ? "Bật tiếng" : "Tắt tiếng";
    };
    $("rateSelect").onchange = function (e) {
      state.rate = Number(e.target.value) || 1;
      if (COURSE.videoSourceType === "youtube" && ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(state.rate);
      else if (COURSE.videoSourceType !== "builtin") videoEl.playbackRate = state.rate;
    };
    $("summaryBtn").onclick = function () { pauseVideo(); state.summary = !state.summary; renderOverlay(); };

    (function initTrack() {
      var dragging = false;
      function pctFromEvent(e) {
        var rect = trackEl.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      }
      trackEl.addEventListener("pointerdown", function (e) {
        if (e.target && e.target.classList && e.target.classList.contains("pin")) return;
        dragging = true;
        try { trackEl.setPointerCapture(e.pointerId); } catch (err) {}
        fillEl.style.width = pctFromEvent(e) * 100 + "%";
      });
      trackEl.addEventListener("pointermove", function (e) {
        if (dragging) fillEl.style.width = pctFromEvent(e) * 100 + "%";
      });
      trackEl.addEventListener("pointerup", function (e) {
        if (!dragging) return;
        dragging = false;
        userSeek(pctFromEvent(e) * state.duration);
        fillEl.style.width = Math.min(100, (state.time / state.duration) * 100) + "%";
      });
      trackEl.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); userSeek(state.time - 5); }
        else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); userSeek(state.time + 5); }
      });
    })();

    ccOnBtn.onclick = function () { state.subtitlesEnabled = true; updateSubtitleControls(); };
    ccOffBtn.onclick = function () { state.subtitlesEnabled = false; updateSubtitleControls(); };

    document.addEventListener("keydown", function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" && fakeFsOn) { fakeFs(false); return; }
      if (tag === "BUTTON" && (e.code === "Space" || e.key === "Enter")) return;
      if (e.code === "Space" || e.key === "k" || e.key === "K") { e.preventDefault(); state.playing ? pauseVideo() : playVideo(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); userSeek(state.time - 5); }
      else if (e.code === "ArrowRight") { e.preventDefault(); userSeek(state.time + 5); }
      else if (e.key === "f" || e.key === "F") { fsBtn.click(); }
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

    setInterval(function () { if (state.playing) syncProgress(false); }, 15000);

    function onTick() {
      var prevT = state.prevTime;
      state.prevTime = state.time;
      var pct = Math.min(100, (state.time / state.duration) * 100);
      fillEl.style.width = pct + "%";
      trackEl.setAttribute("aria-valuenow", String(Math.round(pct)));
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
            if (item.pauseVideo || state.expanded) pauseVideo();
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

    /* ================= LỚP TƯƠNG TÁC ================= */
    function renderOverlay() {
      renderOverlayInner();
      var modal = state.summary || (state.activeId && state.expanded);
      playerEl.classList.toggle("modal-open", Boolean(modal));
      if (modal) playerEl.classList.remove("idle");
    }

    function renderOverlayInner() {
      overlayRoot.innerHTML = "";
      vRoot.innerHTML = "";
      renderSubtitleCue();

      if (state.summary) {
        var sc = computeScore();
        var missingCount = sc.totalGradable - sc.answered;
        var div = document.createElement("div");
        div.className = "overlay";
        var missingHtml = missingCount > 0 ? '<div class="feedback bad" style="margin:0 0 .8em">Bạn còn <strong>' + missingCount + '</strong> câu hỏi chưa hoàn thành. Bấm vào từng mục bên dưới để làm nốt.</div>' : '';
        var listHtml = SORTED.map(function (it) {
          var a = state.answers[it.id];
          var tag = it.type === "info" ? "Ghi chú" : a ? (a.isCorrect ? "Đạt +" + a.earned : "Chưa đúng (0)") : "Chưa làm";
          return '<button type="button" class="opt" data-jump-id="' + esc(it.id) + '" style="display:flex;justify-content:space-between;gap:1em"><span>' + fmt(it.timestamp) + ' · ' + esc(getCleanLabel(it)) + '</span><strong style="white-space:nowrap">' + tag + '</strong></button>';
        }).join("");
        div.innerHTML = '<div class="card" role="dialog" aria-modal="true" aria-label="Tổng kết"><div class="card-head"><span>TỔNG KẾT BÀI HỌC</span><span>' + (sc.passed ? "ĐẠT CHUẨN" : "CHƯA ĐẠT") + '</span></div><div class="card-body"><h3>' + esc(COURSE.title) + '</h3><p class="prompt">Kết quả: <strong>' + sc.pct + '%</strong> (' + sc.earned + '/' + sc.max + ' điểm). Chuẩn yêu cầu: ' + COURSE.passingScore + '%.</p>' + missingHtml + listHtml + '</div><div class="card-foot"><button type="button" class="btn" id="sumRestartBtn">Học lại từ đầu</button><button type="button" class="btn btn-primary" id="closeSumBtn">Đóng</button></div></div>';
        overlayRoot.appendChild(div);
        div.querySelectorAll("[data-jump-id]").forEach(function (b) {
          b.onclick = function () {
            var target = SORTED.find(function (x) { return x.id === b.getAttribute("data-jump-id"); });
            if (target) tryOpenCheckpoint(target);
          };
        });
        $("sumRestartBtn").onclick = resetCourse;
        $("closeSumBtn").onclick = function () { state.summary = false; renderOverlay(); };
        setTimeout(function () { var c = $("closeSumBtn"); if (c) c.focus({ preventScroll: true }); }, 30);
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
        vRoot.appendChild(pinBtn);
        return;
      }

      if (!state.openedAt[item.id]) state.openedAt[item.id] = Date.now();

      if (item.type === "hotspot") {
        renderHotspot(item);
        return;
      }
      renderCard(item);
    }

    function renderHotspot(item) {
      var existingHs = state.answers[item.id];
      var bar = document.createElement("div");
      bar.className = "hotspot-bar";
      bar.innerHTML = '<div><div class="hs-hint">Bấm trực tiếp vào vị trí đúng trên video · ' + (item.points || 0) + ' điểm</div><div class="hs-q">' + esc(item.prompt || "") + '</div></div><button type="button" class="btn" id="hsClose">Bỏ qua</button>';
      var area = document.createElement("div");
      area.className = "hotspot-area";
      area.setAttribute("aria-label", "Vùng chọn vị trí trên video");

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
              : '<span class="muted">Đã hết lượt (' + usedHs + '/' + maxHs + ')</span>')
          : '';
        footBar.innerHTML = '<div><strong style="color:' + (ans.isCorrect ? "#059669" : "#dc2626") + '">' + (ans.isCorrect ? "Chính xác (+" + item.points + " điểm)" : "Chưa đúng vị trí mục tiêu") + '</strong><div class="muted">' + esc(item.explanation || "") + '</div></div><div class="btn-group">' + retryHsHtml + (!ans.isCorrect && typeof item.branchOnWrong === "number" ? '<button type="button" class="btn btn-warn" id="hsBranch">Xem lại ' + fmt(item.branchOnWrong) + '</button>' : '') + '<button type="button" class="btn btn-primary" id="hsNext">Tiếp tục video</button></div>';
        overlayRoot.appendChild(footBar);
        announce(ans.isCorrect ? "Chính xác" : "Chưa đúng vị trí");
        if ($("hsRetry")) {
          $("hsRetry").onclick = function () {
            delete state.answers[item.id];
            state.openedAt[item.id] = Date.now();
            renderOverlay(); renderPins(); renderCheckpointCards();
          };
        }
        if ($("hsBranch")) {
          $("hsBranch").onclick = function () { closeActive(false); seekVideo(item.branchOnWrong, true); playVideo(); };
        }
        $("hsNext").onclick = function () { closeActive(true); };
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
        reportInteraction(item, ans);
        syncProgress(false);
        renderPins(); renderCheckpointCards();
        showHotspotFeedback(ans);
      };

      vRoot.appendChild(area);
      overlayRoot.appendChild(bar);
      $("hsClose").onclick = function () { closeActive(true); };
      if (existingHs) showHotspotFeedback(existingHs);
    }

    function renderCard(item) {
      var ov = document.createElement("div");
      ov.className = "overlay";
      var card = document.createElement("div");
      card.className = "card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-label", getCleanLabel(item));
      card.innerHTML = '<div class="card-head"><span>' + fmt(item.timestamp) + ' · Câu ' + (IDX[item.id] + 1) + '/' + SORTED.length + '</span><span>' + (item.type === "info" ? "Thông tin" : item.points + " điểm") + '</span></div>';
      var body = document.createElement("div");
      body.className = "card-body";
      if (item.prompt) {
        var pr = document.createElement("p");
        pr.className = "prompt";
        pr.textContent = item.prompt;
        body.appendChild(pr);
      }
      if (item.type === "multi_select" && !state.answers[item.id]) {
        var hint = document.createElement("p");
        hint.className = "muted";
        hint.style.margin = "-.4em 0 .6em";
        hint.textContent = "Chọn tất cả đáp án đúng.";
        body.appendChild(hint);
      }
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
      var drawDragUI = null;

      if (item.type === "info") {
        var p = document.createElement("div");
        p.className = "info-body";
        p.textContent = item.infoBody || "";
        body.appendChild(p);
      } else if (item.type === "multiple_choice" || item.type === "multi_select" || item.type === "true_false") {
        (item.options || []).forEach(function (opt) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "opt" + (selected.indexOf(opt.id) >= 0 ? " selected" : "");
          b.setAttribute("aria-pressed", selected.indexOf(opt.id) >= 0 ? "true" : "false");
          if (existingAns) {
            if (opt.isCorrect) b.className += " correct";
            else if (selected.indexOf(opt.id) >= 0) b.className += " incorrect";
          }
          b.textContent = opt.text;
          b.onclick = function () {
            if (state.answers[item.id]) return;
            if (item.type === "multi_select") {
              var idx = selected.indexOf(opt.id);
              if (idx >= 0) { selected.splice(idx, 1); b.classList.remove("selected"); b.setAttribute("aria-pressed", "false"); }
              else { selected.push(opt.id); b.classList.add("selected"); b.setAttribute("aria-pressed", "true"); }
            } else {
              selected = [opt.id];
              body.querySelectorAll(".opt").forEach(function (el) { el.classList.remove("selected"); el.setAttribute("aria-pressed", "false"); });
              b.classList.add("selected");
              b.setAttribute("aria-pressed", "true");
            }
          };
          body.appendChild(b);
        });
      } else if (item.type === "fill_blank") {
        var box = document.createElement("div");
        box.className = "blank-box";
        parseBlanks(item.blankSentence || "").forEach(function (part) {
          if (part.type === "blank") {
            var inp = document.createElement("input");
            inp.className = "blank-input";
            inp.placeholder = "...";
            inp.setAttribute("aria-label", "Ô trống " + (part.index + 1));
            inp.setAttribute("data-expected", part.value);
            if (existingAns && existingAns.blanks && existingAns.blanks[part.index] !== undefined) {
              inp.value = existingAns.blanks[part.index];
              inp.disabled = true;
            }
            inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") actionBtn.click(); });
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

        drawDragUI = function () {
          var locked = Boolean(state.answers[item.id]);
          dragBox.innerHTML = "";
          dragParts.forEach(function (part) {
            if (part.type === "text") { dragBox.appendChild(document.createTextNode(part.value)); return; }
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
              slot.ondragstart = function (e) { e.dataTransfer.setData("text/plain", JSON.stringify({ cIdx: cIdx, fromSlot: sIdx })); };
            } else if (activeDragSlot === sIdx) {
              slot.className += " focus";
            }
            slot.textContent = word || "Chọn từ";
            slot.ondragover = function (e) { if (locked) return; e.preventDefault(); slot.classList.add("over"); };
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
              if (dragAssigned[sIdx] !== null && dragAssigned[sIdx] !== undefined) { dragAssigned[sIdx] = null; activeDragSlot = sIdx; }
              else activeDragSlot = activeDragSlot === sIdx ? null : sIdx;
              drawDragUI();
            };
            dragBox.appendChild(slot);
          });

          bankBox.innerHTML = '<div class="drag-bank-title">Kho từ — bấm vào từ để điền vào ô trống (hoặc kéo thả):</div>';
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
            chip.ondragstart = function (e) { e.dataTransfer.setData("text/plain", JSON.stringify({ cIdx: cIdx })); };
            chip.onclick = function () {
              if (locked || isUsed) return;
              var target = activeDragSlot !== null ? activeDragSlot : dragAssigned.indexOf(null);
              if (target < 0) target = 0;
              if (target < dragExpected.length) { dragAssigned[target] = cIdx; activeDragSlot = null; drawDragUI(); }
            };
            chipsRow.appendChild(chip);
          });
          bankBox.appendChild(chipsRow);
        };
        drawDragUI();
        dragWrap.appendChild(dragBox);
        dragWrap.appendChild(bankBox);
        body.appendChild(dragWrap);
      } else if (item.type === "ordering") {
        var list = document.createElement("div");
        var drawOrder = function () {
          list.innerHTML = "";
          currentOrder.forEach(function (txt, idx) {
            var row = document.createElement("div");
            row.className = "opt order-row";
            var label = document.createElement("span");
            label.textContent = (idx + 1) + ". " + txt;
            var btns = document.createElement("span");
            btns.className = "btn-group";
            row.appendChild(label);
            row.appendChild(btns);
            if (!state.answers[item.id]) {
              if (idx > 0) {
                var up = document.createElement("button"); up.type = "button";
                up.className = "btn"; up.textContent = "↑"; up.setAttribute("aria-label", "Đưa lên");
                up.onclick = function () { var t = currentOrder[idx - 1]; currentOrder[idx - 1] = currentOrder[idx]; currentOrder[idx] = t; drawOrder(); };
                btns.appendChild(up);
              }
              if (idx < currentOrder.length - 1) {
                var dn = document.createElement("button"); dn.type = "button";
                dn.className = "btn"; dn.textContent = "↓"; dn.setAttribute("aria-label", "Đưa xuống");
                dn.onclick = function () { var t = currentOrder[idx + 1]; currentOrder[idx + 1] = currentOrder[idx]; currentOrder[idx] = t; drawOrder(); };
                btns.appendChild(dn);
              }
            } else {
              var okRow = (item.orderingItems || [])[idx] === txt;
              row.className += okRow ? " correct" : " incorrect";
            }
            list.appendChild(row);
          });
        };
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
        var strong = document.createElement("strong");
        strong.textContent = ans.isCorrect ? "Chính xác (+" + item.points + " điểm)" : "Chưa chính xác (0 điểm)";
        var expl = document.createElement("div");
        expl.textContent = item.explanation || "";
        fb.appendChild(strong); fb.appendChild(expl);
        body.appendChild(fb);
        announce(strong.textContent);
        setTimeout(function () { try { fb.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }, 30);
        leftFoot.innerHTML = "";
        if (!ans.isCorrect) {
          var maxCard = item.maxAttempts && item.maxAttempts > 0 ? item.maxAttempts : null;
          var usedCard = state.attempts[item.id] || ans.attemptsUsed || 1;
          if (!maxCard || usedCard < maxCard) {
            var retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.className = "btn";
            retryBtn.textContent = maxCard ? "Làm lại (" + usedCard + "/" + maxCard + ")" : "Làm lại câu này";
            retryBtn.onclick = function () {
              delete state.answers[item.id];
              state.openedAt[item.id] = Date.now();
              renderPins(); renderCheckpointCards(); renderOverlay();
            };
            leftFoot.appendChild(retryBtn);
          } else {
            var exhaustedTxt = document.createElement("span");
            exhaustedTxt.className = "muted";
            exhaustedTxt.textContent = "Đã hết lượt làm lại (" + usedCard + "/" + maxCard + ")";
            leftFoot.appendChild(exhaustedTxt);
          }
          if (typeof item.branchOnWrong === "number") {
            var bw = document.createElement("button");
            bw.type = "button";
            bw.className = "btn btn-warn";
            bw.textContent = "Xem lại đoạn " + fmt(item.branchOnWrong);
            bw.onclick = function () { closeActive(false); seekVideo(item.branchOnWrong, true); playVideo(); };
            leftFoot.appendChild(bw);
          }
        } else if (typeof item.branchOnCorrect === "number") {
          var bc = document.createElement("button");
          bc.type = "button";
          bc.className = "btn";
          bc.textContent = "Chuyển tới đoạn " + fmt(item.branchOnCorrect);
          bc.onclick = function () { closeActive(false); seekVideo(item.branchOnCorrect, true); playVideo(); };
          leftFoot.appendChild(bc);
        }
        actionBtn.setAttribute("data-checked", "1");
        actionBtn.textContent = "Tiếp tục xem video";
        actionBtn.className = "btn btn-dark";
        setTimeout(function () { actionBtn.focus({ preventScroll: true }); }, 40);
      }

      if (item.type === "info") actionBtn.textContent = "Đã hiểu & Tiếp tục";
      else if (existingAns) showResultUI(existingAns);
      else actionBtn.textContent = "Kiểm tra đáp án";

      actionBtn.onclick = function () {
        if (item.type === "info") {
          state.answers[item.id] = { isCorrect: true, earned: 0 };
          syncProgress(false);
          renderPins(); renderCheckpointCards();
          closeActive(true);
          return;
        }
        if (actionBtn.getAttribute("data-checked") === "1") { closeActive(true); return; }
        var ok = false;
        var extra = {};
        if (item.type === "multiple_choice" || item.type === "true_false") {
          if (!selected.length) { showToast("Hãy chọn một đáp án."); return; }
          var cor = (item.options || []).find(function (o) { return o.isCorrect; });
          ok = Boolean(cor && selected[0] === cor.id);
          extra.selected = selected.slice();
        } else if (item.type === "multi_select") {
          if (!selected.length) { showToast("Hãy chọn ít nhất một đáp án."); return; }
          var cors = (item.options || []).filter(function (o) { return o.isCorrect; }).map(function (o) { return o.id; });
          ok = cors.length > 0 && selected.length === cors.length && cors.every(function (id) { return selected.indexOf(id) >= 0; });
          extra.selected = selected.slice();
        } else if (item.type === "fill_blank") {
          extra.blanks = blankInputs.map(function (inp) { return inp.value; });
          ok = blankInputs.length > 0 && blankInputs.every(function (inp) {
            var val = inp.value.trim();
            var exp = (inp.getAttribute("data-expected") || "").trim();
            return item.caseSensitive ? val === exp : val.toLowerCase() === exp.toLowerCase();
          });
          blankInputs.forEach(function (inp) { inp.disabled = true; });
        } else if (item.type === "drag_text") {
          if (dragAssigned.some(function (c) { return c === null || c === undefined; })) { showToast("Hãy điền đủ các ô trống."); return; }
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
        var ansObj = { isCorrect: ok, earned: ok ? item.points : 0, attemptsUsed: nextCardAttempts };
        for (var k in extra) ansObj[k] = extra[k];
        state.answers[item.id] = ansObj;
        reportInteraction(item, ansObj);
        if (drawDragUI) drawDragUI();
        if (item.type === "multiple_choice" || item.type === "multi_select" || item.type === "true_false") {
          body.querySelectorAll(".opt").forEach(function (el, i) {
            var opt = (item.options || [])[i];
            if (!opt) return;
            if (opt.isCorrect) el.classList.add("correct");
            else if (selected.indexOf(opt.id) >= 0) el.classList.add("incorrect");
          });
        }
        if (item.type === "ordering") renderOverlay();
        syncProgress(false);
        renderPins(); renderCheckpointCards();
        if (item.type !== "ordering") showResultUI(ansObj);
      };

      rightFoot.appendChild(actionBtn);
      foot.appendChild(leftFoot);
      foot.appendChild(rightFoot);
      card.appendChild(body);
      card.appendChild(foot);
      ov.appendChild(card);
      overlayRoot.appendChild(ov);
      setTimeout(function () {
        var first = card.querySelector(".opt:not([disabled]), .blank-input:not([disabled]), .word-chip:not([disabled])");
        if (first && first.focus) first.focus({ preventScroll: true });
      }, 40);
    }

    /* ================= KHỞI ĐỘNG ================= */
    layoutStage();
    renderBuiltinScene();
    renderPins();
    renderCheckpointCards();
    updateSubtitleControls();
    loadSavedProgress();
    syncProgress(false);
    window.LumiCastPlayer = { layout: layoutStage, state: state };
  })();
  </script>
</body>
</html>`;
}
