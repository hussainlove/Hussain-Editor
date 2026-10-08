// Client-side Voice Audio Extractor & Acoustic Voice Activity Detector (VAD)
// Extracts real audio from a video/audio clip URL (including browser blob: URLs)
// so the caption engine can trace the exact spoken voice and timestamps.

export interface VadSpeechInterval {
  start: number; // relative to clip start (0..duration)
  end: number;
}

export interface ExtractedClipVoicePayload {
  audioBase64?: string;
  mimeType?: string;
  vadIntervals: VadSpeechInterval[];
}

function encodeMonoWavFromFloat32(samples: Float32Array, sampleRate: number): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function detectVadFromSamples(
  samples: Float32Array,
  sampleRate: number,
  clipDuration: number
): VadSpeechInterval[] {
  const frameSec = 0.08; // 80ms frame
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate * frameSec));
  const totalFrames = Math.floor(samples.length / samplesPerFrame);
  if (totalFrames === 0) return [];

  const rmsValues: number[] = [];
  let maxRms = 0;
  for (let f = 0; f < totalFrames; f++) {
    let sumSq = 0;
    const base = f * samplesPerFrame;
    for (let i = 0; i < samplesPerFrame; i++) {
      const v = samples[base + i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / samplesPerFrame);
    rmsValues.push(rms);
    if (rms > maxRms) maxRms = rms;
  }

  if (maxRms < 0.003) {
    // Nearly silent track
    return [];
  }

  // Adaptive voice threshold based on track dynamic range
  const sorted = [...rmsValues].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.25)] || 0.002;
  const threshold = Math.max(0.008, noiseFloor * 2.2, maxRms * 0.14);

  const rawIntervals: VadSpeechInterval[] = [];
  let inSpeech = false;
  let segStart = 0;

  for (let f = 0; f < totalFrames; f++) {
    const t = f * frameSec;
    const isVoice = rmsValues[f] >= threshold;
    if (isVoice && !inSpeech) {
      inSpeech = true;
      segStart = Math.max(0, t - 0.06);
    } else if (!isVoice && inSpeech) {
      inSpeech = false;
      const segEnd = Math.min(clipDuration, t + 0.08);
      if (segEnd - segStart >= 0.25) {
        rawIntervals.push({
          start: Math.round(segStart * 100) / 100,
          end: Math.round(segEnd * 100) / 100,
        });
      }
    }
  }
  if (inSpeech) {
    rawIntervals.push({
      start: Math.round(segStart * 100) / 100,
      end: Math.round(clipDuration * 100) / 100,
    });
  }

  // Merge intervals separated by tiny pauses (< 0.35s) and split overly long intervals (> 4.2s)
  const merged: VadSpeechInterval[] = [];
  for (const iv of rawIntervals) {
    if (merged.length > 0 && iv.start - merged[merged.length - 1].end < 0.35) {
      merged[merged.length - 1].end = iv.end;
    } else {
      merged.push({ ...iv });
    }
  }

  const finalIntervals: VadSpeechInterval[] = [];
  for (const iv of merged) {
    let cur = iv.start;
    while (iv.end - cur > 4.2) {
      finalIntervals.push({
        start: Math.round(cur * 100) / 100,
        end: Math.round((cur + 3.2) * 100) / 100,
      });
      cur += 3.25;
    }
    if (iv.end - cur >= 0.3) {
      finalIntervals.push({
        start: Math.round(cur * 100) / 100,
        end: Math.round(iv.end * 100) / 100,
      });
    }
  }

  return finalIntervals;
}

export async function extractClipVoiceFromBrowser(
  clipUrl?: string,
  trimStart = 0,
  duration = 8,
  peaks?: number[]
): Promise<ExtractedClipVoicePayload> {
  const fallbackFromPeaks = (): VadSpeechInterval[] => {
    if (!peaks || peaks.length === 0) return [];
    const intervals: VadSpeechInterval[] = [];
    const stepSec = duration / peaks.length;
    let inVoice = false;
    let s = 0;
    for (let i = 0; i < peaks.length; i++) {
      const active = peaks[i] > 0.22;
      if (active && !inVoice) {
        inVoice = true;
        s = i * stepSec;
      } else if (!active && inVoice) {
        inVoice = false;
        const e = i * stepSec;
        if (e - s >= 0.35) {
          intervals.push({
            start: Math.round(s * 100) / 100,
            end: Math.round(e * 100) / 100,
          });
        }
      }
    }
    if (inVoice) {
      intervals.push({
        start: Math.round(s * 100) / 100,
        end: Math.round(duration * 100) / 100,
      });
    }
    return intervals;
  };

  if (!clipUrl) {
    return { vadIntervals: fallbackFromPeaks() };
  }

  try {
    const res = await fetch(clipUrl);
    if (!res.ok) return { vadIntervals: fallbackFromPeaks() };
    const blob = await res.blob();
    // Avoid decoding multi-hundred-MB files in RAM on client if server has it
    if (blob.size > 95 * 1024 * 1024) {
      return { vadIntervals: fallbackFromPeaks() };
    }

    const arrayBuf = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return { vadIntervals: fallbackFromPeaks() };

    const ctx = new AudioCtx();
    try {
      const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
      const srcRate = audioBuf.sampleRate;
      const targetRate = 12000; // 12kHz mono WAV for crisp speech recognition
      const maxExtractSec = Math.min(duration, 90);
      const startSample = Math.max(0, Math.floor(trimStart * srcRate));
      const endSample = Math.min(
        audioBuf.length,
        startSample + Math.floor(maxExtractSec * srcRate)
      );
      const sliceLen = Math.max(0, endSample - startSample);
      if (sliceLen <= 0) {
        return { vadIntervals: fallbackFromPeaks() };
      }

      const ch0 = audioBuf.getChannelData(0);
      const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : null;

      const outLen = Math.max(1, Math.floor((sliceLen / srcRate) * targetRate));
      const monoDownsampled = new Float32Array(outLen);
      const ratio = sliceLen / outLen;

      for (let i = 0; i < outLen; i++) {
        const srcIdx = Math.min(audioBuf.length - 1, startSample + Math.floor(i * ratio));
        monoDownsampled[i] = ch1 ? (ch0[srcIdx] + ch1[srcIdx]) * 0.5 : ch0[srcIdx];
      }

      const vadIntervals = detectVadFromSamples(
        monoDownsampled,
        targetRate,
        sliceLen / srcRate
      );
      const audioBase64 = encodeMonoWavFromFloat32(monoDownsampled, targetRate);

      return {
        audioBase64,
        mimeType: 'audio/wav',
        vadIntervals: vadIntervals.length > 0 ? vadIntervals : fallbackFromPeaks(),
      };
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    return { vadIntervals: fallbackFromPeaks() };
  }
}
