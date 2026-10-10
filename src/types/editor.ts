export const APP_CONFIG = {
  appName: 'Hussain Video Editor',
  shortName: 'HVE Studio',
  version: '1.0.0',
  platform: 'Windows 10 / 11 64-bit',
  projectExtension: '.hveproject',
  defaultAutoSaveIntervalSec: 30,
};

export type AspectRatioOption = '16:9' | '9:16' | '1:1' | '4:5';
export type PreviewResolutionOption = 'Auto' | '360p' | '540p' | '720p' | '1080p';
export type SidebarTabId =
  | 'Media'
  | 'Audio'
  | 'Text'
  | 'Captions'
  | 'Stickers'
  | 'Effects'
  | 'Transitions'
  | 'Filters'
  | 'Adjust'
  | 'Templates';

export interface KeyframePoint {
  id: string;
  timeOffset: number; // Seconds from start of clip
  property: 'positionX' | 'positionY' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity' | 'volume';
  value: number;
}

export interface ColorAdjustments {
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  saturation: number;   // -100 to 100
  exposure: number;     // -100 to 100
  temperature: number;  // -100 to 100
  tint: number;         // -100 to 100
  highlights: number;   // -100 to 100
  shadows: number;      // -100 to 100
  sharpness: number;    // 0 to 100
  vignette: number;     // 0 to 100
}

export interface WordStyleOverride {
  color?: string;
  bgColor?: string;
  strokeColor?: string;
  glowColor?: string;
  scale?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
}

export type CaptionPresetType =
  | 'YellowVoiceSync'
  | 'GreenVoiceSync'
  | 'YellowGreenMultiline'
  | 'MultilineYellowSync'
  | 'MultilineGreenSync'
  | 'YellowBoxSync'
  | 'GreenBoxSync'
  | 'SingleWordYellowGreen'
  | 'WordGlowing'
  | 'Multiline'
  | 'Karaoke'
  | 'Highlight'
  | 'Bold'
  | 'Modern'
  | 'Cinematic'
  | 'Podcast'
  | 'Minimal'
  | 'Clean';

export interface VoiceSyncCaptionFormatInfo {
  id: CaptionPresetType;
  label: string;
  desc: string;
  badge: string;
  baseColor: string;
  activeWordColor: string;
  activeWordBgColor?: string;
  activeWordGlowColor?: string;
  isMultiline?: boolean;
  isSingleWordPop?: boolean;
}

export const VOICE_SYNC_CAPTION_FORMATS: VoiceSyncCaptionFormatInfo[] = [
  {
    id: 'YellowVoiceSync',
    label: '⚡ Yellow Voice Sync',
    desc: 'Spoken word turns Yellow (#FACC15), other words stay White',
    badge: 'WORD-BY-WORD',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
    activeWordGlowColor: '#FACC15',
  },
  {
    id: 'GreenVoiceSync',
    label: '⚡ Green Voice Sync',
    desc: 'Spoken word turns Neon Green (#22C55E), other words stay White',
    badge: 'WORD-BY-WORD',
    baseColor: '#FFFFFF',
    activeWordColor: '#22C55E',
    activeWordGlowColor: '#22C55E',
  },
  {
    id: 'YellowGreenMultiline',
    label: '☰ Yellow & Green Multiline',
    desc: 'Stacked multiline: active voice word syncs Green/Yellow',
    badge: 'MULTILINE SYNC',
    baseColor: '#FFFFFF',
    activeWordColor: '#22C55E',
    activeWordBgColor: '#FACC15',
    isMultiline: true,
  },
  {
    id: 'MultilineYellowSync',
    label: '☰ Multiline Yellow Sync',
    desc: 'Multi-line stack where spoken word turns Yellow (#FACC15)',
    badge: 'MULTILINE SYNC',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
    activeWordGlowColor: '#FACC15',
    isMultiline: true,
  },
  {
    id: 'MultilineGreenSync',
    label: '☰ Multiline Green Sync',
    desc: 'Multi-line stack where spoken word turns Green (#22C55E)',
    badge: 'MULTILINE SYNC',
    baseColor: '#FFFFFF',
    activeWordColor: '#22C55E',
    activeWordGlowColor: '#22C55E',
    isMultiline: true,
  },
  {
    id: 'YellowBoxSync',
    label: '🟨 Yellow Box Word Sync',
    desc: 'Spoken word gets a Yellow pill box, rest stay White',
    badge: 'PILL SYNC',
    baseColor: '#FFFFFF',
    activeWordColor: '#090D16',
    activeWordBgColor: '#FACC15',
  },
  {
    id: 'GreenBoxSync',
    label: '🟩 Green Box Word Sync',
    desc: 'Spoken word gets a Green pill box, rest stay White',
    badge: 'PILL SYNC',
    baseColor: '#FFFFFF',
    activeWordColor: '#090D16',
    activeWordBgColor: '#22C55E',
  },
  {
    id: 'SingleWordYellowGreen',
    label: '🎯 1-Word Pop (Yellow/Green)',
    desc: 'Pops active voice word in alternating Yellow & Green',
    badge: '1-WORD POP',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
    isSingleWordPop: true,
  },
  {
    id: 'WordGlowing',
    label: '✦ Word Glowing',
    desc: 'Active spoken word neon glow, rest stay same',
    badge: 'NEON GLOW',
    baseColor: '#FFFFFF',
    activeWordColor: '#38BDF8',
    activeWordGlowColor: '#E879F9',
  },
  {
    id: 'Multiline',
    label: '☰ Multiline Stack',
    desc: 'Stacked multi-line box with voice word highlight',
    badge: 'MULTILINE',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
    isMultiline: true,
  },
  {
    id: 'Karaoke',
    label: '♪ Karaoke Sync',
    desc: 'Synced lyric word highlight',
    badge: 'LYRICS',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
  },
  {
    id: 'Highlight',
    label: '★ Highlight Box',
    desc: 'Active word highlight pill',
    badge: 'HIGHLIGHT',
    baseColor: '#FFFFFF',
    activeWordColor: '#22C55E',
    activeWordBgColor: '#0F172A',
  },
  {
    id: 'Bold',
    label: 'Bold Impact',
    desc: 'Heavy creator headline',
    badge: 'CREATOR',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
  },
  {
    id: 'Modern',
    label: 'Modern Clean',
    desc: 'Sleek social subtitle',
    badge: 'STUDIO',
    baseColor: '#FFFFFF',
    activeWordColor: '#22C55E',
  },
  {
    id: 'Cinematic',
    label: 'Cinematic',
    desc: 'Wide letterspaced film subtitle',
    badge: 'FILM',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
  },
  {
    id: 'Podcast',
    label: 'Podcast Bar',
    desc: 'High-contrast speaker caption bar',
    badge: 'PODCAST',
    baseColor: '#FFFFFF',
    activeWordColor: '#22C55E',
  },
  {
    id: 'Minimal',
    label: 'Minimal',
    desc: 'Crisp transparent text',
    badge: 'CLEAN',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
  },
  {
    id: 'Clean',
    label: 'Broadcast Clean',
    desc: 'Standard TV caption',
    badge: 'TV',
    baseColor: '#FFFFFF',
    activeWordColor: '#FACC15',
  },
];

export interface TextStyleConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOpacity: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backgroundColor: string;
  backgroundOpacity: number;
  padding: number;
  cornerRadius: number;
  captionPreset?: CaptionPresetType;
  activeWordColor?: string;
  activeWordBgColor?: string;
  activeWordGlowColor?: string;
  activeWordScale?: number;
  inactiveWordSameColor?: boolean;
  wordStyles?: Record<number, WordStyleOverride>;
}

export type MaskShapeType =
  | 'none'
  | 'circle'
  | 'rectangle'
  | 'diamond'
  | 'star'
  | 'hexagon'
  | 'heart'
  | 'split-left'
  | 'split-right'
  | 'filmstrip'
  | 'custom-polygon';

export interface ClipMaskConfig {
  shape: MaskShapeType;
  customPolygon?: string; // e.g. "50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%"
  scale: number;          // 20 to 150%
  feather?: number;
  invert?: boolean;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'caption';
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  mediaId?: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'text' | 'caption' | 'sticker';
  url?: string;
  filePath?: string;
  thumbnailUrl?: string;
  startTime: number;     // Timeline start time in seconds
  duration: number;      // Active timeline duration in seconds
  trimStart: number;     // Source media in-point offset in seconds
  sourceDuration: number;
  // Transform & Crop
  positionX: number;     // -1000 to 1000 px offset from center
  positionY: number;     // -1000 to 1000 px offset from center
  scaleX: number;        // % (100 = 100%)
  scaleY: number;        // % (100 = 100%)
  rotation: number;      // degrees (0, 90, 180, 270 or free)
  flipH: boolean;
  flipV: boolean;
  anchorX: number;       // 0 to 100%
  anchorY: number;       // 0 to 100%
  opacity: number;       // 0 to 100%
  blendMode: 'normal' | 'screen' | 'multiply' | 'overlay';
  cropTop: number;       // 0 to 50%
  cropBottom: number;    // 0 to 50%
  cropLeft: number;      // 0 to 50%
  cropRight: number;     // 0 to 50%
  // Speed & Time
  speed: number;         // 0.1 to 10
  reversed: boolean;
  // Audio
  volume: number;        // 0 to 200%
  muted: boolean;
  fadeIn: number;        // seconds
  fadeOut: number;       // seconds
  pitch: number;         // -12 to +12 semitones
  noiseReduction: boolean;
  peaks?: number[];
  // Visual Effects, Filters, Transitions, Animations
  effects: string[];
  filterPreset: string;
  transitionIn: {
    type: string;
    duration: number;
  };
  transitionOut: {
    type: string;
    duration: number;
  };
  animationIn: string;
  animationOut: string;
  animationLoop?: string;
  audioEffects?: string[];
  adjustments: ColorAdjustments;
  // Text / Caption / Sticker properties
  textContent?: string;
  textStyle?: TextStyleConfig;
  stickerShape?: string;
  stickerColor?: string;
  customSvgDataUrl?: string;
  customPolygonPoints?: string;
  mask?: ClipMaskConfig;
  // Keyframes & Grouping
  keyframes: KeyframePoint[];
  groupId?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  aspectRatio: AspectRatioOption;
  resolution: string; // e.g. '1920x1080'
  fps: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  savedAt?: string;
}

export interface ImportedMediaItem {
  id: string;
  filename: string;
  originalName: string;
  filePath: string;
  url: string;
  thumbnailUrl?: string;
  type: 'video' | 'audio' | 'image';
  format: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  hasVideo: boolean;
  hasAudio: boolean;
  fileSize: number;
  createdAt: string;
  peaks?: number[];
  isOffline?: boolean;
}

export const DEFAULT_ADJUSTMENTS: ColorAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
  vignette: 0,
};

export const DEFAULT_TEXT_STYLE: TextStyleConfig = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 48,
  fontWeight: '700',
  italic: false,
  underline: false,
  align: 'center',
  letterSpacing: 0,
  lineHeight: 1.25,
  color: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: '#000000',
  shadowBlur: 8,
  shadowOpacity: 65,
  backgroundColor: '#0F172A',
  backgroundOpacity: 0,
  padding: 12,
  cornerRadius: 6,
  captionPreset: 'Modern',
};

export const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'track-c1', name: 'CAPTIONS', type: 'caption', locked: false, hidden: false, muted: false, solo: false },
  { id: 'track-v3', name: 'V3 Overlay', type: 'video', locked: false, hidden: false, muted: false, solo: false },
  { id: 'track-v2', name: 'V2 B-Roll', type: 'video', locked: false, hidden: false, muted: false, solo: false },
  { id: 'track-v1', name: 'V1 Main', type: 'video', locked: false, hidden: false, muted: false, solo: false },
  { id: 'track-a1', name: 'AUDIO 1', type: 'audio', locked: false, hidden: false, muted: false, solo: false },
  { id: 'track-a2', name: 'AUDIO 2', type: 'audio', locked: false, hidden: false, muted: false, solo: false },
  { id: 'track-a3', name: 'AUDIO 3', type: 'audio', locked: false, hidden: false, muted: false, solo: false },
];

export function isTrackCompatibleWithClip(
  trackType: TimelineTrack['type'],
  clipType: TimelineClip['type']
): boolean {
  if (clipType === 'audio') {
    return trackType === 'audio';
  }
  if (clipType === 'video' || clipType === 'image' || clipType === 'text' || clipType === 'sticker') {
    return trackType === 'video';
  }
  if (clipType === 'caption') {
    return trackType === 'caption' || trackType === 'video';
  }
  return trackType === 'video';
}

export const BUILTIN_EFFECTS = [
  { id: 'Blur', name: 'Blur', category: 'Lens', desc: 'Softens image detail evenly', isOnlineAsset: false },
  { id: 'Gaussian Blur', name: 'Gaussian Blur', category: 'Lens', desc: 'Cinema-grade optical defocus', isOnlineAsset: false },
  { id: 'Sharpen', name: 'Sharpen', category: 'Detail', desc: 'Enhances edge crispness', isOnlineAsset: false },
  { id: 'Vignette', name: 'Vignette', category: 'Cinema', desc: 'Darkens frame periphery', isOnlineAsset: false },
  { id: 'Glow', name: 'Glow', category: 'Light', desc: 'Diffused highlight bloom', isOnlineAsset: false },
  { id: 'Film Grain', name: 'Film Grain', category: 'Texture', desc: '35mm analog emulsion grain', isOnlineAsset: false },
  { id: 'Pixelate', name: 'Pixelate', category: 'Stylize', desc: 'Mosaic block sensor effect', isOnlineAsset: false },
  { id: 'Noise', name: 'Noise', category: 'Texture', desc: 'High-ISO broadcast grain', isOnlineAsset: false },
  { id: 'Color Tint', name: 'Color Tint', category: 'Color', desc: 'Stylized duotone wash', isOnlineAsset: false },
  { id: 'Grayscale', name: 'Grayscale', category: 'Color', desc: 'Monochrome luminance conversion', isOnlineAsset: false },
  { id: 'Chromatic Split', name: 'Chromatic RGB Split', category: 'Online Store', desc: 'Prism RGB lens shift', isOnlineAsset: true },
  { id: 'VHS Retro', name: 'VHS 1994 Tape', category: 'Online Store', desc: 'Analog scanline & color bleed', isOnlineAsset: true },
  { id: 'Cyber Halation', name: 'Anamorphic Halation', category: 'Online Store', desc: 'Cinema highlight bloom', isOnlineAsset: true },
  { id: 'Dreamy Mist', name: 'Pro-Mist 1/4 Filter', category: 'Online Store', desc: 'Soft highlight diffusion', isOnlineAsset: true },
];

export const BUILTIN_FILTERS = [
  { id: 'None', name: 'Original', css: 'none' },
  { id: 'Cinematic', name: 'Cinematic', css: 'contrast(1.18) saturate(0.92) brightness(0.96)' },
  { id: 'Warm', name: 'Warm Golden', css: 'sepia(0.28) saturate(1.25) brightness(1.03)' },
  { id: 'Cold', name: 'Cold Nordic', css: 'hue-rotate(185deg) saturate(0.85) contrast(1.08)' },
  { id: 'Vintage', name: 'Vintage 16mm', css: 'sepia(0.45) contrast(0.95) brightness(0.98)' },
  { id: 'Black & White', name: 'Black & White', css: 'grayscale(1) contrast(1.2)' },
  { id: 'Film', name: 'Kodak Film', css: 'contrast(1.12) saturate(1.15) sepia(0.1)' },
  { id: 'Dramatic', name: 'Dramatic', css: 'contrast(1.35) saturate(0.8) brightness(0.9)' },
  { id: 'Moody', name: 'Moody Slate', css: 'saturate(0.7) contrast(1.15) brightness(0.92)' },
  { id: 'Clean', name: 'Clean Studio', css: 'brightness(1.06) contrast(1.05) saturate(1.05)' },
  { id: 'Bright', name: 'Bright Airy', css: 'brightness(1.15) contrast(0.98) saturate(1.1)' },
];

export const BUILTIN_TRANSITIONS = [
  { id: 'None', name: 'Cut (No Transition)', defaultDuration: 0, isOnlineAsset: false },
  { id: 'Fade', name: 'Fade', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Cross Dissolve', name: 'Cross Dissolve', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Dip to Black', name: 'Dip to Black', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Dip to White', name: 'Dip to White', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Wipe', name: 'Wipe Right', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Slide', name: 'Slide Left', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Zoom', name: 'Zoom Warp', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Blur', name: 'Blur Dissolve', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Push', name: 'Push Frame', defaultDuration: 0.5, isOnlineAsset: false },
  { id: 'Flash Whip', name: 'Flash Camera Whip', defaultDuration: 0.5, isOnlineAsset: true },
  { id: 'Spin Warp', name: '360° Spin Zoom', defaultDuration: 0.5, isOnlineAsset: true },
  { id: 'Glitch Cut', name: 'Digital Glitch Cut', defaultDuration: 0.25, isOnlineAsset: true },
  { id: 'Film Burn', name: 'Kodak Light Leak Burn', defaultDuration: 0.5, isOnlineAsset: true },
];

export const BUILTIN_MASKS: Array<{
  id: MaskShapeType;
  name: string;
  clipPath: string;
}> = [
  { id: 'none', name: 'No Mask (Full Frame)', clipPath: 'none' },
  { id: 'circle', name: 'Circle Spotlight', clipPath: 'circle(42% at 50% 50%)' },
  { id: 'rectangle', name: 'Rounded Cinema Box', clipPath: 'inset(10% 10% 10% 10% round 16px)' },
  { id: 'diamond', name: 'Diamond Rhombus', clipPath: 'polygon(50% 4%, 96% 50%, 50% 96%, 4% 50%)' },
  {
    id: 'star',
    name: '5-Point Star Mask',
    clipPath:
      'polygon(50% 2%, 63% 36%, 98% 36%, 70% 57%, 81% 92%, 50% 71%, 19% 92%, 30% 57%, 2% 36%, 37% 36%)',
  },
  {
    id: 'hexagon',
    name: 'Hexagon Portal',
    clipPath: 'polygon(25% 5%, 75% 5%, 98% 50%, 75% 95%, 25% 95%, 2% 50%)',
  },
  {
    id: 'heart',
    name: 'Heart Frame Mask',
    clipPath:
      'polygon(50% 22%, 65% 8%, 85% 10%, 96% 26%, 92% 48%, 50% 92%, 8% 48%, 4% 26%, 15% 10%, 35% 8%)',
  },
  { id: 'split-left', name: 'Left Half Split', clipPath: 'inset(0% 50% 0% 0%)' },
  { id: 'split-right', name: 'Right Half Split', clipPath: 'inset(0% 0% 0% 50%)' },
  { id: 'filmstrip', name: 'Anamorphic Widescreen', clipPath: 'inset(18% 0% 18% 0%)' },
  {
    id: 'custom-polygon',
    name: 'Custom User Shape (Own Points)',
    clipPath: 'polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)',
  },
];

export const BUILTIN_ANIMATIONS = [
  'None',
  'Fade In',
  'Fade Out',
  'Zoom In',
  'Zoom Out',
  'Slide Left',
  'Slide Right',
  'Slide Up',
  'Slide Down',
  'Pop',
  'Bounce',
  'Rotate',
];

export const BUILTIN_LOOP_ANIMATIONS = [
  'None',
  'Pulse Loop',
  'Float Loop',
  'Bounce Loop',
  'Spin Loop',
  'Shake Loop',
  'Neon Flicker',
  'Pendulum',
  'Heartbeat',
  'Zoom Breathe',
  'RGB Glitch Loop',
];

export interface OnlineAnimationItem {
  id: string;
  name: string;
  target: 'in' | 'out' | 'loop';
  desc: string;
  badge: string;
}

export const ONLINE_ANIMATION_CATALOG: OnlineAnimationItem[] = [
  { id: '3D Flip In', name: '3D Perspective Flip In', target: 'in', desc: 'Cinematic 3D card flip entrance', badge: '3D IN' },
  { id: 'Elastic Pop In', name: 'Elastic Spring Pop', target: 'in', desc: 'High-energy springy scale entrance', badge: 'SPRING IN' },
  { id: 'Cyber Glitch In', name: 'Cyberpunk Glitch In', target: 'in', desc: 'Digital RGB slice entrance', badge: 'GLITCH IN' },
  { id: 'Whip Zoom Out', name: 'Whip Pan Zoom Out', target: 'out', desc: 'Fast motion-blur zoom exit', badge: 'WHIP OUT' },
  { id: 'Vortex Spin Out', name: 'Vortex Spiral Exit', target: 'out', desc: 'Rotational spiral shrink exit', badge: 'SPIN OUT' },
  { id: 'Shutter Dissolve Out', name: 'Strobe Shutter Exit', target: 'out', desc: 'Flash strobe fade out', badge: 'STROBE OUT' },
  { id: 'Hologram Float Loop', name: 'Hologram Levitate Loop', target: 'loop', desc: 'Continuous zero-gravity hover + glow', badge: 'LOOP' },
  { id: 'Bass Thump Loop', name: 'Bass Beat Pump Loop', target: 'loop', desc: 'Rhythmic beat-synced zoom pulse', badge: 'LOOP' },
  { id: 'Cinema Shake Loop', name: 'Handheld Camera Loop', target: 'loop', desc: 'Organic documentary camera motion', badge: 'LOOP' },
  { id: 'Neon Glow Pulse Loop', name: 'Neon Halation Loop', target: 'loop', desc: 'Continuous glowing aura cycle', badge: 'LOOP' },
];

export const BUILTIN_AUDIO_EFFECTS = [
  { id: 'Bass Boost', name: 'Bass Boost (+8dB Low)', category: 'EQ', desc: 'Deep sub-bass punch for music & reels' },
  { id: 'Studio Reverb', name: 'Studio Hall Reverb', category: 'Space', desc: 'Warm acoustic room ambiance' },
  { id: 'Vocal Enhancer', name: 'AI Vocal Presence', category: 'Voice', desc: 'Crisp speech clarity & de-essing' },
  { id: 'Podcast Warmth', name: 'Broadcast Tube Warmth', category: 'Voice', desc: 'Rich FM radio compressor tone' },
  { id: 'Echo Delay', name: 'Slapback Echo Delay', category: 'FX', desc: 'Rhythmic stereo repeat echo' },
  { id: 'Lo-Fi Radio', name: 'Lo-Fi Telephone Filter', category: 'FX', desc: 'Vintage narrow-band speaker tone' },
  { id: 'Crisp Treble', name: 'Air & Treble Sparkle', category: 'EQ', desc: 'High-frequency studio sheen' },
  { id: 'Cinema Sub', name: 'Cinema Impact Sub', category: 'Cinema', desc: 'Theater low-end rumble enhancer' },
];

export const BUILTIN_FONTS = [
  'Plus Jakarta Sans',
  'Inter',
  'Montserrat',
  'Bebas Neue',
  'Oswald',
  'Anton',
  'Poppins',
  'Roboto Condensed',
  'Playfair Display',
  'Cinzel',
  'Pacifico',
  'Dancing Script',
  'Lobster',
  'Righteous',
  'Permanent Marker',
  'Orbitron',
  'Bangers',
  'JetBrains Mono',
  'Impact',
  'Georgia',
  'Arial Black',
  'Courier New',
  'Trebuchet MS',
  'Verdana',
  'Palatino',
  'System Sans',
];

export type StickerPackCategory = 'All' | 'Emojis' | 'Arrows' | 'Circles' | 'Shapes' | 'Badges';

export interface OnlineStickerPackItem {
  shape: string;
  label: string;
  category: Exclude<StickerPackCategory, 'All'>;
  color: string;
  glyph?: string;
  online: boolean;
}

export const ONLINE_STICKER_PACK_CATALOG: OnlineStickerPackItem[] = [
  // Emojis Pack (Online Mode Download)
  { shape: 'emoji-fire', label: 'Fire Hype 🔥', category: 'Emojis', color: '#F97316', glyph: '🔥', online: true },
  { shape: 'emoji-laugh', label: 'Laughing Joy 😂', category: 'Emojis', color: '#FACC15', glyph: '😂', online: true },
  { shape: 'emoji-love', label: 'Heart Eyes 😍', category: 'Emojis', color: '#F43F5E', glyph: '😍', online: true },
  { shape: 'emoji-cool', label: 'Cool Shades 😎', category: 'Emojis', color: '#38BDF8', glyph: '😎', online: true },
  { shape: 'emoji-mindblown', label: 'Mind Blown 🤯', category: 'Emojis', color: '#EC4899', glyph: '🤯', online: true },
  { shape: 'emoji-100', label: '100% Score 💯', category: 'Emojis', color: '#EF4444', glyph: '💯', online: true },
  { shape: 'emoji-rocket', label: 'Viral Rocket 🚀', category: 'Emojis', color: '#FB923C', glyph: '🚀', online: true },
  { shape: 'emoji-crown', label: 'Royal Crown 👑', category: 'Emojis', color: '#EAB308', glyph: '👑', online: true },
  { shape: 'emoji-trophy', label: 'Gold Trophy 🏆', category: 'Emojis', color: '#F59E0B', glyph: '🏆', online: true },
  { shape: 'emoji-lightning', label: 'High Voltage ⚡', category: 'Emojis', color: '#FDE047', glyph: '⚡', online: true },
  { shape: 'emoji-party', label: 'Party Popper 🎉', category: 'Emojis', color: '#A855F7', glyph: '🎉', online: true },
  { shape: 'emoji-money', label: 'Money Cash 💸', category: 'Emojis', color: '#22C55E', glyph: '💸', online: true },
  { shape: 'emoji-boom', label: 'Comic Boom 💥', category: 'Emojis', color: '#F97316', glyph: '💥', online: true },
  { shape: 'emoji-star', label: 'Glowing Star ⭐', category: 'Emojis', color: '#EAB308', glyph: '⭐', online: true },
  { shape: 'emoji-clap', label: 'Applause Clap 👏', category: 'Emojis', color: '#38BDF8', glyph: '👏', online: true },
  { shape: 'emoji-eyes', label: 'Look Eyes 👀', category: 'Emojis', color: '#E2E8F0', glyph: '👀', online: true },

  // Arrows Pack (Online Mode Download)
  { shape: 'arrow-right', label: 'Right Pointer →', category: 'Arrows', color: '#EF4444', glyph: '➔', online: true },
  { shape: 'arrow-left', label: 'Left Pointer ←', category: 'Arrows', color: '#38BDF8', glyph: '⬅', online: true },
  { shape: 'arrow-up', label: 'Up Boost Arrow ↑', category: 'Arrows', color: '#22C55E', glyph: '⬆', online: true },
  { shape: 'arrow-down', label: 'Down Drop Arrow ↓', category: 'Arrows', color: '#F59E0B', glyph: '⬇', online: true },
  { shape: 'arrow-curve', label: 'Curved Callout ↪', category: 'Arrows', color: '#EC4899', glyph: '↪', online: true },
  { shape: 'arrow-double', label: 'Double Swap ⇄', category: 'Arrows', color: '#A855F7', glyph: '⇄', online: true },
  { shape: 'arrow-neon-chevron', label: 'Triple Chevron ≫', category: 'Arrows', color: '#06B6D4', glyph: '⋙', online: true },
  { shape: 'arrow-target-hand', label: 'Hand Pointer ☞', category: 'Arrows', color: '#FACC15', glyph: '☞', online: true },

  // Circles & Rings Pack (Online Mode Download)
  { shape: 'circle', label: 'Focus Circle ◯', category: 'Circles', color: '#22C55E', online: true },
  { shape: 'circle-dashed', label: 'Dashed Orbit Ring', category: 'Circles', color: '#38BDF8', online: true },
  { shape: 'circle-neon-glow', label: 'Neon Glow Circle', category: 'Circles', color: '#EC4899', online: true },
  { shape: 'circle-crosshair', label: 'Target Crosshair ⌖', category: 'Circles', color: '#EF4444', online: true },
  { shape: 'circle-double', label: 'Double Ring ⊚', category: 'Circles', color: '#FACC15', online: true },
  { shape: 'circle-dotted', label: 'Dotted Marker Ring', category: 'Circles', color: '#A855F7', online: true },
  { shape: 'circle-radar', label: 'Radar Pulse Circle', category: 'Circles', color: '#10B981', online: true },

  // Shapes & Frames Pack (Online Mode Download)
  { shape: 'rectangle', label: 'Cinema Frame Box', category: 'Shapes', color: '#38BDF8', online: true },
  { shape: 'shape-triangle', label: 'Neon Triangle △', category: 'Shapes', color: '#F43F5E', online: true },
  { shape: 'shape-diamond', label: 'Rhombus Diamond ◇', category: 'Shapes', color: '#06B6D4', online: true },
  { shape: 'shape-hexagon', label: 'Cyber Hexagon ⬢', category: 'Shapes', color: '#A855F7', online: true },
  { shape: 'shape-octagon', label: 'Octagon Frame ⯃', category: 'Shapes', color: '#EF4444', online: true },
  { shape: 'shape-starburst', label: '12-Pt Starburst ✸', category: 'Shapes', color: '#FACC15', online: true },
  { shape: 'shape-pentagon', label: 'Studio Pentagon ⬠', category: 'Shapes', color: '#10B981', online: true },
  { shape: 'shape-shield', label: 'Crest Shield 🛡', category: 'Shapes', color: '#3B82F6', online: true },
  { shape: 'callout', label: 'Speech Callout 💬', category: 'Shapes', color: '#A855F7', online: true },
  { shape: 'line', label: 'Neon Divider Line', category: 'Shapes', color: '#F8FAFC', online: true },
  { shape: 'neon-heart', label: 'Neon Heart Glow ♥', category: 'Shapes', color: '#F43F5E', online: true },
  { shape: 'sparkle-burst', label: 'Sparkle Burst ✦', category: 'Shapes', color: '#FACC15', online: true },

  // Creator & Broadcast Badges Pack (Online Mode Download)
  { shape: 'subscribe-pill', label: 'YouTube Subscribe', category: 'Badges', color: '#EF4444', online: true },
  { shape: 'rec-badge', label: 'Broadcast REC ●', category: 'Badges', color: '#F43F5E', online: true },
  { shape: 'badge-live', label: 'LIVE Stream Badge', category: 'Badges', color: '#EF4444', online: true },
  { shape: 'badge-like-bell', label: 'LIKE & BELL Pill', category: 'Badges', color: '#38BDF8', online: true },
  { shape: 'check-shield', label: 'Verified Badge ✔', category: 'Badges', color: '#10B981', online: true },
  { shape: 'cinema-clap', label: 'Director Slate 🎬', category: 'Badges', color: '#38BDF8', online: true },
  { shape: 'badge-new', label: 'NEW EPISODE Tag', category: 'Badges', color: '#F59E0B', online: true },
  { shape: 'badge-4k', label: '4K ULTRA HD Tag', category: 'Badges', color: '#E2E8F0', online: true },
];


