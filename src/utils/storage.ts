import { CourseProject, InteractionItem, InteractionType, LearnerAnswer, SubtitleCue } from '../types/course';

const COURSES_STORAGE_KEY = 'lumacast_courses_v1';
const DB_NAME = 'lumacast_media_db';
const STORE_NAME = 'videos';
const DEMO_COURSE_IDS = new Set(['course-loto-safety', 'course-phishing-awareness']);
const DEMO_SUBTITLE_FILES = new Set(['loto-safety-vi.vtt', 'phishing-awareness-vi.vtt']);

export function isDemoCourseId(id: string): boolean {
  return DEMO_COURSE_IDS.has(id);
}

export function isDemoSubtitleFile(fileName?: string): boolean {
  return Boolean(fileName && DEMO_SUBTITLE_FILES.has(fileName));
}

function parseSrtTimeToSeconds(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return Number(cleaned) || 0;
}

export function parseSubtitleFile(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n+/i, '').trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const timeLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIndex === -1) return;
    const [startRaw, endRawWithMeta] = lines[timeLineIndex].split('-->');
    const endRaw = (endRawWithMeta || '').trim().split(/\s+/)[0];
    const startTime = parseSrtTimeToSeconds(startRaw);
    const endTime = parseSrtTimeToSeconds(endRaw);
    const text = lines
      .slice(timeLineIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (text && endTime > startTime) {
      cues.push({
        id: `sub-${idx}-${Date.now()}`,
        startTime: Number(startTime.toFixed(2)),
        endTime: Number(endTime.toFixed(2)),
        text,
      });
    }
  });

  return cues;
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match && match[1]) return match[1];
  }
  return null;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatTimePrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function getInteractionTypeLabel(type: InteractionType): string {
  switch (type) {
    case InteractionType.MULTIPLE_CHOICE:
      return 'Trắc nghiệm 1 đáp án';
    case InteractionType.MULTI_SELECT:
      return 'Trắc nghiệm nhiều đáp án';
    case InteractionType.TRUE_FALSE:
      return 'Đúng / Sai';
    case InteractionType.FILL_BLANK:
      return 'Điền vào chỗ trống';
    case InteractionType.DRAG_TEXT:
      return 'Kéo thả từ vào chỗ trống';
    case InteractionType.HOTSPOT:
      return 'Điểm nóng (Hotspot)';
    case InteractionType.ORDERING:
      return 'Sắp xếp quy trình';
    case InteractionType.INFO:
      return 'Thẻ thông tin';
  }
}

export function parseFillBlankParts(sentence: string): Array<{ type: 'text' | 'blank'; value: string; blankIndex?: number }> {
  const parts: Array<{ type: 'text' | 'blank'; value: string; blankIndex?: number }> = [];
  const regex = /\*([^*]+)\*/g;
  let lastIndex = 0;
  let blankIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: sentence.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'blank', value: match[1], blankIndex });
    blankIndex += 1;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < sentence.length) {
    parts.push({ type: 'text', value: sentence.slice(lastIndex) });
  }

  return parts;
}

export function buildDragWordBank(item: InteractionItem): string[] {
  const targets = parseFillBlankParts(item.blankSentence || '')
    .filter((p) => p.type === 'blank')
    .map((p) => p.value.trim())
    .filter(Boolean);
  const distractors = (item.distractorWords || [])
    .map((w) => w.trim())
    .filter(Boolean);
  const combined = [...targets, ...distractors];
  if (combined.length <= 1) return combined;

  let seed = 0;
  for (let i = 0; i < item.id.length; i++) {
    seed = (seed * 31 + item.id.charCodeAt(i)) % 100000;
  }
  const arr = [...combined];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function evaluateInteractionAnswer(
  item: InteractionItem,
  payload: {
    selectedOptionIds?: string[];
    blankInputs?: string[];
    orderedItems?: string[];
    clickedPoint?: { x: number; y: number };
  }
): LearnerAnswer {
  const maxPoints = item.type === InteractionType.INFO ? 0 : item.points;
  let isCorrect = false;

  if (item.type === InteractionType.INFO) {
    isCorrect = true;
  } else if (item.type === InteractionType.MULTIPLE_CHOICE || item.type === InteractionType.TRUE_FALSE) {
    const selected = payload.selectedOptionIds?.[0];
    const correctOption = item.options?.find((o) => o.isCorrect);
    isCorrect = Boolean(selected && correctOption && selected === correctOption.id);
  } else if (item.type === InteractionType.MULTI_SELECT) {
    const selectedSet = new Set(payload.selectedOptionIds || []);
    const correctIds = (item.options || []).filter((o) => o.isCorrect).map((o) => o.id);
    isCorrect =
      correctIds.length > 0 &&
      selectedSet.size === correctIds.length &&
      correctIds.every((id) => selectedSet.has(id));
  } else if (item.type === InteractionType.FILL_BLANK || item.type === InteractionType.DRAG_TEXT) {
    const blanks = parseFillBlankParts(item.blankSentence || '').filter((p) => p.type === 'blank');
    const inputs = payload.blankInputs || [];
    isCorrect =
      blanks.length > 0 &&
      blanks.every((b, idx) => {
        const expected = b.value.trim();
        const actual = (inputs[idx] || '').trim();
        return item.caseSensitive ? expected === actual : expected.toLowerCase() === actual.toLowerCase();
      });
  } else if (item.type === InteractionType.HOTSPOT) {
    const pt = payload.clickedPoint;
    const region = item.hotspot;
    if (pt && region) {
      isCorrect =
        pt.x >= region.x &&
        pt.x <= region.x + region.width &&
        pt.y >= region.y &&
        pt.y <= region.y + region.height;
    }
  } else if (item.type === InteractionType.ORDERING) {
    const expected = item.orderingItems || [];
    const actual = payload.orderedItems || [];
    isCorrect =
      expected.length > 0 &&
      expected.length === actual.length &&
      expected.every((val, idx) => val === actual[idx]);
  }

  return {
    interactionId: item.id,
    isCorrect,
    earnedPoints: isCorrect ? maxPoints : 0,
    maxPoints,
    selectedOptionIds: payload.selectedOptionIds,
    blankInputs: payload.blankInputs,
    orderedItems: payload.orderedItems,
    clickedPoint: payload.clickedPoint,
    answeredAt: Date.now(),
  };
}

export function loadStoredCourses(fallback: CourseProject[]): CourseProject[] {
  try {
    const raw = localStorage.getItem(COURSES_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as CourseProject[];
    if (!Array.isArray(parsed)) return fallback;
    const fallbackMap = new Map(fallback.map((c) => [c.id, c]));
    return parsed.map((c) => {
      const fb = fallbackMap.get(c.id);
      if (!fb) return c;
      let nextCourse = c;
      if (c.subtitles === undefined && fb.subtitles) {
        nextCourse = {
          ...nextCourse,
          subtitles: fb.subtitles,
          subtitleFileName: fb.subtitleFileName,
          subtitlesEnabledByDefault: fb.subtitlesEnabledByDefault ?? true,
        };
      }
      // Upgrade untouched demo checkpoint sec-int-4 to drag_text so learners get the word-drag bank
      if (c.id === 'course-phishing-awareness') {
        const fbSec4 = fb.interactions.find((i) => i.id === 'sec-int-4');
        if (fbSec4) {
          nextCourse = {
            ...nextCourse,
            interactions: nextCourse.interactions.map((i) =>
              i.id === 'sec-int-4' && i.type === InteractionType.FILL_BLANK && !i.distractorWords
                ? fbSec4
                : i
            ),
          };
        }
      }
      return nextCourse;
    });
  } catch {
    return fallback;
  }
}

export function saveStoredCourses(courses: CourseProject[]): void {
  try {
    localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVideoBlob(key: string, blob: Blob): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVideoBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteVideoBlob(key: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
