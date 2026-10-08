import { KeyframePoint, TimelineClip, BUILTIN_FILTERS, BUILTIN_MASKS } from '../types/editor';

export function formatTimecode(seconds: number, fps = 30): string {
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = Math.floor(safeSec % 60);
  const frames = Math.floor((safeSec % 1) * fps);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function evaluateKeyframedProperty(
  clip: TimelineClip,
  property: KeyframePoint['property'],
  playheadTime: number
): number {
  const baseValue = Number(clip[property] ?? 0);
  const clipLocalTime = Math.max(0, playheadTime - clip.startTime);
  const kfs = (clip.keyframes || [])
    .filter((k) => k.property === property)
    .sort((a, b) => a.timeOffset - b.timeOffset);

  if (kfs.length === 0) return baseValue;
  if (clipLocalTime <= kfs[0].timeOffset) return kfs[0].value;
  if (clipLocalTime >= kfs[kfs.length - 1].timeOffset) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const k1 = kfs[i];
    const k2 = kfs[i + 1];
    if (clipLocalTime >= k1.timeOffset && clipLocalTime <= k2.timeOffset) {
      const span = k2.timeOffset - k1.timeOffset;
      if (span <= 0.0001) return k2.value;
      const t = (clipLocalTime - k1.timeOffset) / span;
      return k1.value + (k2.value - k1.value) * t;
    }
  }
  return baseValue;
}

export function computeClipFilterStyle(clip: TimelineClip): string {
  const adj = clip.adjustments;
  const parts: string[] = [];

  const brightness = 1 + (adj.brightness + adj.exposure * 0.6) / 100;
  const contrast = 1 + adj.contrast / 100;
  const saturate = Math.max(0, 1 + adj.saturation / 100);

  if (Math.abs(brightness - 1) > 0.01) parts.push(`brightness(${brightness.toFixed(2)})`);
  if (Math.abs(contrast - 1) > 0.01) parts.push(`contrast(${contrast.toFixed(2)})`);
  if (Math.abs(saturate - 1) > 0.01) parts.push(`saturate(${saturate.toFixed(2)})`);

  if (adj.temperature > 0) {
    parts.push(`sepia(${(adj.temperature / 220).toFixed(2)})`);
  } else if (adj.temperature < 0) {
    parts.push(`hue-rotate(${(adj.temperature * 0.4).toFixed(0)}deg)`);
  }

  if (adj.tint !== 0) {
    parts.push(`hue-rotate(${(adj.tint * 0.9).toFixed(0)}deg)`);
  }

  if (clip.filterPreset && clip.filterPreset !== 'None') {
    const found = BUILTIN_FILTERS.find((f) => f.id === clip.filterPreset);
    if (found && found.css !== 'none') {
      parts.push(found.css);
    }
  }

  if (clip.effects?.includes('Blur')) parts.push('blur(4px)');
  if (clip.effects?.includes('Gaussian Blur')) parts.push('blur(10px)');
  if (clip.effects?.includes('Grayscale')) parts.push('grayscale(1)');
  if (clip.effects?.includes('Color Tint')) parts.push('sepia(0.6) hue-rotate(280deg)');
  if (clip.effects?.includes('Glow')) parts.push('drop-shadow(0 0 12px rgba(56,189,248,0.65))');
  if (clip.effects?.includes('Chromatic Split')) parts.push('contrast(1.22) saturate(1.4) drop-shadow(-3px 0 0 rgba(239,68,68,0.75)) drop-shadow(3px 0 0 rgba(56,189,248,0.75))');
  if (clip.effects?.includes('VHS Retro')) parts.push('sepia(0.35) contrast(1.15) saturate(1.3) hue-rotate(-8deg)');
  if (clip.effects?.includes('Cyber Halation')) parts.push('brightness(1.08) contrast(1.15) drop-shadow(0 0 14px rgba(244,63,94,0.65))');
  if (clip.effects?.includes('Dreamy Mist')) parts.push('brightness(1.07) contrast(0.92) blur(1.2px)');

  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function computeClipMaskPath(clip: TimelineClip, wipeRightInset?: number): string {
  const mask = clip.mask;
  if (mask && mask.shape && mask.shape !== 'none') {
    if (mask.shape === 'custom-polygon' && mask.customPolygon) {
      return `polygon(${mask.customPolygon})`;
    }
    const preset = BUILTIN_MASKS.find((m) => m.id === mask.shape);
    if (preset && preset.clipPath !== 'none') {
      return preset.clipPath;
    }
  }
  const right = wipeRightInset !== undefined ? wipeRightInset : clip.cropRight;
  return `inset(${clip.cropTop}% ${right}% ${clip.cropBottom}% ${clip.cropLeft}%)`;
}

export function splitClipAtTime(
  clip: TimelineClip,
  splitTime: number
): [TimelineClip, TimelineClip] | null {
  const clipEnd = clip.startTime + clip.duration;
  if (splitTime <= clip.startTime + 0.1 || splitTime >= clipEnd - 0.1) {
    return null;
  }

  const firstDuration = Math.round((splitTime - clip.startTime) * 100) / 100;
  const secondDuration = Math.round((clipEnd - splitTime) * 100) / 100;

  const firstClip: TimelineClip = {
    ...clip,
    duration: firstDuration,
    keyframes: clip.keyframes.filter((k) => k.timeOffset <= firstDuration),
  };

  const secondClip: TimelineClip = {
    ...clip,
    id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${clip.name} (Part 2)`,
    startTime: splitTime,
    duration: secondDuration,
    trimStart: Math.round((clip.trimStart + firstDuration * clip.speed) * 100) / 100,
    keyframes: clip.keyframes
      .filter((k) => k.timeOffset > firstDuration)
      .map((k) => ({
        ...k,
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timeOffset: Math.round((k.timeOffset - firstDuration) * 100) / 100,
      })),
  };

  return [firstClip, secondClip];
}
