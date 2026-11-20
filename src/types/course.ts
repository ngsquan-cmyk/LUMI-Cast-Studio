export enum InteractionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  MULTI_SELECT = 'multi_select',
  TRUE_FALSE = 'true_false',
  FILL_BLANK = 'fill_blank',
  DRAG_TEXT = 'drag_text',
  HOTSPOT = 'hotspot',
  ORDERING = 'ordering',
  INFO = 'info',
}

export type DisplayMode = 'poster' | 'button';
export type ScormVersion = '1.2' | '2004';
export type VideoSourceType = 'builtin' | 'upload' | 'url' | 'youtube';

export interface InteractionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface HotspotRegion {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 1-100
  height: number; // percentage 1-100
}

export interface InteractionItem {
  id: string;
  type: InteractionType;
  timestamp: number; // seconds
  duration: number; // visible window in seconds (for button mode)
  title: string;
  prompt: string;
  displayMode: DisplayMode;
  pauseVideo: boolean;
  points: number;
  position: {
    x: number; // percentage 5-95
    y: number; // percentage 5-95
  };
  options?: InteractionOption[]; // multiple_choice, multi_select, true_false
  blankSentence?: string; // fill_blank & drag_text: uses *answer* syntax
  distractorWords?: string[]; // drag_text: optional decoy words in word bank
  caseSensitive?: boolean;
  hotspot?: HotspotRegion; // hotspot target box
  orderingItems?: string[]; // ordering: items in correct canonical order
  infoBody?: string; // info card content
  imageUrl?: string; // optional illustration image (Data URL or external URL) inside question/info card
  maxAttempts?: number | null; // null or 0 = unlimited; >=1 = cap retry attempts
  explanation: string; // shown after submit
  branchOnWrong?: number | null; // optional timestamp (seconds) to jump to when wrong
  branchOnCorrect?: number | null; // optional timestamp (seconds) to jump to when correct
}

export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface BuiltInScene {
  startTime: number;
  endTime: number;
  title: string;
  subtitle: string;
  bulletPoints: string[];
  imageUrl?: string;
  accentColor: string;
  highlightZone?: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  };
}

export interface CourseProject {
  id: string;
  title: string;
  description: string;
  category: string;
  coverImage: string;
  videoSourceType: VideoSourceType;
  videoUrl: string; // external URL if videoSourceType === 'url'
  youtubeId?: string; // extracted YouTube video ID if videoSourceType === 'youtube'
  uploadedVideoKey?: string; // IndexedDB key if videoSourceType === 'upload'
  uploadedVideoName?: string;
  uploadedVideoMime?: string;
  duration: number; // seconds
  passingScore: number; // percentage 0-100
  preventSkipping: boolean;
  defaultScormVersion: ScormVersion;
  subtitles?: SubtitleCue[];
  subtitlesEnabledByDefault?: boolean;
  subtitleFileName?: string;
  interactions: InteractionItem[];
  builtInScenes?: BuiltInScene[];
  updatedAt: string;
}

export interface LearnerAnswer {
  interactionId: string;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
  attemptsUsed?: number;
  selectedOptionIds?: string[];
  blankInputs?: string[];
  orderedItems?: string[];
  clickedPoint?: { x: number; y: number };
  answeredAt: number;
}

export interface ScormLogEntry {
  id: string;
  time: string;
  method: string;
  key: string;
  value: string;
}
