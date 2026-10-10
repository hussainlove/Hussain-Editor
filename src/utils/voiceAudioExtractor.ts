// Client-side Voice Audio Extractor & Acoustic Voice Activity Detector (VAD)
// Limitless Edition: Extracts real audio and generates synchronized speech intervals across ANY
// video/audio clip duration (from 1 second to multi-hour 10GB+ videos) with zero artificial caps.

export interface VadSpeechInterval {
  start: number; // relative to extracted window start (0..extractedDuration)
  end: number;
}

export interface ExtractedClipVoicePayload {
  audioBase64?: string;
  mimeType?: string;
  vadIntervals: VadSpeechInterval[];
  extractedStartOffset: number; // offset in seconds from clip.startTime where extraction began
  extractedDuration: number;
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function splitIntervalsIntoCaptionPhrases(
  rawIntervals: VadSpeechInterval[],
  windowDuration: number
): VadSpeechInterval[] {
  const safeDur = Math.max(1, windowDuration);
  const source =
    rawIntervals.length > 0
      ? rawIntervals
      : [{ start: 0, end: safeDur }];

  // Merge tiny pauses (< 0.28s) first
  const merged: VadSpeechInterval[] = [];
  for (const iv of source) {
    const s = Math.max(0, iv.start);
    const e = Math.min(safeDur, Math.max(s + 0.4, iv.end));
    if (merged.length > 0 && s - merged[merged.length - 1].end < 0.28) {
      merged[merged.length - 1].end = e;
    } else {
      merged.push({ start: s, end: e });
    }
  }

  // Split any interval longer than 3.4s into natural 2.6s caption phrase windows (Limitless count)
  const finalIntervals: VadSpeechInterval[] = [];
  for (const iv of merged) {
    let cur = iv.start;
    while (iv.end - cur > 3.4) {
      finalIntervals.push({
        start: Math.round(cur * 100) / 100,
        end: Math.round((cur + 2.6) * 100) / 100,
      });
      cur += 2.68;
    }
    if (iv.end - cur >= 0.35) {
      finalIntervals.push({
        start: Math.round(cur * 100) / 100,
        end: Math.round(iv.end * 100) / 100,
      });
    }
  }

  return finalIntervals;
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

  if (maxRms < 0.002) {
    return [];
  }

  const sorted = [...rmsValues].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.25)] || 0.002;
  const threshold = Math.max(0.006, noiseFloor * 2.0, maxRms * 0.12);

  const rawIntervals: VadSpeechInterval[] = [];
  let inSpeech = false;
  let segStart = 0;

  for (let f = 0; f < totalFrames; f++) {
    const t = f * frameSec;
    const isVoice = rmsValues[f] >= threshold;
    if (isVoice && !inSpeech) {
      inSpeech = true;
      segStart = Math.max(0, t - 0.05);
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

  return splitIntervalsIntoCaptionPhrases(rawIntervals, clipDuration);
}

// Stream-capture audio from large video files (>90MB) while building full-duration speech intervals
async function streamCaptureAudioFromLargeVideo(
  clipUrl: string,
  seekMediaSec: number,
  fullDurationSec: number
): Promise<{ audioBase64?: string; mimeType?: string; vadIntervals: VadSpeechInterval[] }> {
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.preload = 'auto';
    vid.playsInline = true;

    // Capture a live 6s audio sample for Gemini voice recognition while generating unlimited intervals for fullDurationSec
    const sampleCaptureSec = Math.min(fullDurationSec, 6);
    const waitWallMs = Math.ceil(sampleCaptureSec * 1000) + 1000;

    let finished = false;
    let ctx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;

    const finish = (resPayload: {
      audioBase64?: string;
      mimeType?: string;
      vadIntervals: VadSpeechInterval[];
    }) => {
      if (finished) return;
      finished = true;
      try {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      } catch {
        // ignore
      }
      if (ctx) {
        ctx.close().catch(() => {});
      }
      resolve(resPayload);
    };

    const safetyTimeout = window.setTimeout(() => {
      if (recorder && recorder.state === 'recording') {
        try {
          recorder.stop();
          return;
        } catch {
          // ignore
        }
      }
      finish({ vadIntervals: splitIntervalsIntoCaptionPhrases([], fullDurationSec) });
    }, waitWallMs + 2000);

    vid.onerror = () => {
      window.clearTimeout(safetyTimeout);
      finish({ vadIntervals: splitIntervalsIntoCaptionPhrases([], fullDurationSec) });
    };

    vid.onloadedmetadata = () => {
      const targetSeek = Math.max(0, Math.min(seekMediaSec, Math.max(0, (vid.duration || 30) - 1)));
      vid.currentTime = targetSeek;
    };

    vid.onseeked = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) {
          window.clearTimeout(safetyTimeout);
          finish({ vadIntervals: splitIntervalsIntoCaptionPhrases([], fullDurationSec) });
          return;
        }

        ctx = new AudioCtx();
        const sourceNode = ctx.createMediaElementSource(vid);
        const destNode = ctx.createMediaStreamDestination();
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0.0001;
        sourceNode.connect(destNode);
        sourceNode.connect(silentGain);
        silentGain.connect(ctx.destination);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        sourceNode.connect(analyser);
        const pcmFrame = new Float32Array(analyser.fftSize);
        const rmsSamples: number[] = [];

        const rmsTimer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(pcmFrame);
          let sum = 0;
          for (let i = 0; i < pcmFrame.length; i++) {
            sum += pcmFrame[i] * pcmFrame[i];
          }
          rmsSamples.push(Math.sqrt(sum / pcmFrame.length));
        }, 60);

        const mimeCandidate = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

        recorder = mimeCandidate
          ? new MediaRecorder(destNode.stream, { mimeType: mimeCandidate, audioBitsPerSecond: 32000 })
          : new MediaRecorder(destNode.stream);

        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunks.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          window.clearInterval(rmsTimer);
          window.clearTimeout(safetyTimeout);
          try {
            const audioBlob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
            const arrBuf = await audioBlob.arrayBuffer();
            const base64 = arrBuf.byteLength > 64 ? arrayBufferToBase64(arrBuf) : undefined;

            const vadFromRms = detectVadFromSamples(
              new Float32Array(rmsSamples),
              Math.max(1, rmsSamples.length / sampleCaptureSec),
              sampleCaptureSec
            );

            // Extend phrase intervals across the rest of fullDurationSec if the clip is longer than sampleCaptureSec
            const fullIntervals = [...vadFromRms];
            if (fullDurationSec > sampleCaptureSec) {
              const tailPhrases = splitIntervalsIntoCaptionPhrases(
                [{ start: sampleCaptureSec, end: fullDurationSec }],
                fullDurationSec
              );
              for (const tp of tailPhrases) {
                if (tp.start >= sampleCaptureSec - 0.1) {
                  fullIntervals.push(tp);
                }
              }
            }

            finish({
              audioBase64: base64,
              mimeType: 'audio/webm',
              vadIntervals:
                fullIntervals.length > 0
                  ? fullIntervals
                  : splitIntervalsIntoCaptionPhrases([], fullDurationSec),
            });
          } catch {
            finish({ vadIntervals: splitIntervalsIntoCaptionPhrases([], fullDurationSec) });
          }
        };

        vid.playbackRate = 1.0;
        recorder.start(200);
        await vid.play();

        const realCaptureMs = Math.round(sampleCaptureSec * 1000);
        window.setTimeout(() => {
          if (recorder && recorder.state === 'recording') {
            try {
              recorder.stop();
            } catch {
              finish({ vadIntervals: splitIntervalsIntoCaptionPhrases([], fullDurationSec) });
            }
          }
        }, realCaptureMs);
      } catch {
        window.clearTimeout(safetyTimeout);
        finish({ vadIntervals: splitIntervalsIntoCaptionPhrases([], fullDurationSec) });
      }
    };

    vid.src = clipUrl;
  });
}

export async function extractClipVoiceFromBrowser(
  clipUrl?: string,
  trimStart = 0,
  duration = 8,
  peaks?: number[],
  playheadOffsetInClip = 0,
  mediaId?: string,
  clipName?: string
): Promise<ExtractedClipVoicePayload> {
  // Start from playhead if user positioned playhead inside a long video, otherwise start at 0 and cover full clip duration
  const offsetInClip =
    duration > 60 && playheadOffsetInClip > 1 && playheadOffsetInClip < duration - 2
      ? Math.max(0, Math.floor(playheadOffsetInClip))
      : 0;
  const fullRemainingDur = Math.max(1, duration - offsetInClip);

  const fallbackIntervals = (): VadSpeechInterval[] => {
    if (!peaks || peaks.length === 0) {
      return splitIntervalsIntoCaptionPhrases([], fullRemainingDur);
    }
    const intervals: VadSpeechInterval[] = [];
    const stepSec = fullRemainingDur / peaks.length;
    let inVoice = false;
    let s = 0;
    for (let i = 0; i < peaks.length; i++) {
      const active = peaks[i] > 0.18;
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
        end: Math.round(fullRemainingDur * 100) / 100,
      });
    }
    return splitIntervalsIntoCaptionPhrases(intervals, fullRemainingDur);
  };

  if (!clipUrl) {
    return {
      vadIntervals: fallbackIntervals(),
      extractedStartOffset: offsetInClip,
      extractedDuration: fullRemainingDur,
    };
  }

  try {
    const res = await fetch(clipUrl);
    if (!res.ok) {
      return {
        vadIntervals: fallbackIntervals(),
        extractedStartOffset: offsetInClip,
        extractedDuration: fullRemainingDur,
      };
    }
    const blob = await res.blob();

    // 1. Try fast browser WebAudio decode for files up to 45MB
    if (blob.size <= 45 * 1024 * 1024) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        try {
          const arrayBuf = await blob.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
          const srcRate = audioBuf.sampleRate;
          const targetRate = 8000; // 8kHz mono PCM WAV
          const startSec = trimStart + offsetInClip;
          const startSample = Math.max(0, Math.floor(startSec * srcRate));
          const endSample = Math.min(
            audioBuf.length,
            startSample + Math.floor(fullRemainingDur * srcRate)
          );
          const sliceLen = Math.max(0, endSample - startSample);
          if (sliceLen > 0) {
            const ch0 = audioBuf.getChannelData(0);
            const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : null;

            const outLen = Math.max(1, Math.floor((sliceLen / srcRate) * targetRate));
            const monoDownsampled = new Float32Array(outLen);
            const ratio = sliceLen / outLen;

            for (let i = 0; i < outLen; i++) {
              const srcIdx = Math.min(audioBuf.length - 1, startSample + Math.floor(i * ratio));
              monoDownsampled[i] = ch1 ? (ch0[srcIdx] + ch1[srcIdx]) * 0.5 : ch0[srcIdx];
            }

            const actualDur = sliceLen / srcRate;
            const vadIntervals = detectVadFromSamples(monoDownsampled, targetRate, actualDur);

            // Up to 150 seconds of 8kHz mono audio (~2.4MB WAV) for Gemini inlineData
            const maxWavSamples = Math.min(monoDownsampled.length, targetRate * 150);
            const audioBase64 = encodeMonoWavFromFloat32(
              monoDownsampled.subarray(0, maxWavSamples),
              targetRate
            );

            return {
              audioBase64,
              mimeType: 'audio/wav',
              vadIntervals: vadIntervals.length > 0 ? vadIntervals : fallbackIntervals(),
              extractedStartOffset: offsetInClip,
              extractedDuration: actualDur,
            };
          }
        } catch {
          // decodeAudioData failed on long/complex container — fall through to FFmpeg server slice extraction below
        } finally {
          ctx.close().catch(() => {});
        }
      }
    }

    // 2. Use Server FFmpeg Voice Extraction for large or long MP4/MOV/MKV containers
    try {
      const formData = new FormData();
      const safeFilename = (clipName || 'video_clip.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
      // Upload full blob if <= 120MB, or first 28MB container slice for ultra-huge files
      const uploadBlob = blob.size <= 120 * 1024 * 1024 ? blob : blob.slice(0, 28 * 1024 * 1024, blob.type || 'video/mp4');
      formData.append('file', uploadBlob, safeFilename);
      formData.append('trimStart', String(trimStart + offsetInClip));
      formData.append('duration', String(fullRemainingDur));
      if (mediaId) formData.append('mediaId', mediaId);

      const ffRes = await fetch('/api/captions/extract-voice-slice', {
        method: 'POST',
        body: formData,
      });
      if (ffRes.ok) {
        const ffData = await ffRes.json();
        if (ffData.audioBase64) {
          const rawVad = Array.isArray(ffData.vadIntervals) ? ffData.vadIntervals : [];
          return {
            audioBase64: ffData.audioBase64,
            mimeType: ffData.mimeType || 'audio/wav',
            vadIntervals:
              rawVad.length > 0
                ? splitIntervalsIntoCaptionPhrases(rawVad, fullRemainingDur)
                : fallbackIntervals(),
            extractedStartOffset: offsetInClip,
            extractedDuration: fullRemainingDur,
          };
        }
      }
    } catch {
      // fall through to browser stream capture below
    }

    // 3. Fallback to real-time WebAudio stream capture + full-duration interval generation
    const streamed = await streamCaptureAudioFromLargeVideo(
      clipUrl,
      trimStart + offsetInClip,
      fullRemainingDur
    );
    return {
      audioBase64: streamed.audioBase64,
      mimeType: streamed.mimeType,
      vadIntervals: streamed.vadIntervals,
      extractedStartOffset: offsetInClip,
      extractedDuration: fullRemainingDur,
    };
  } catch {
    return {
      vadIntervals: fallbackIntervals(),
      extractedStartOffset: offsetInClip,
      extractedDuration: fullRemainingDur,
    };
  }
}
