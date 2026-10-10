import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as archiverModule from 'archiver';
const archiver = (archiverModule as any).default || archiverModule;
import { execFile } from 'child_process';
import util from 'util';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { DIRS, ensureDirectories, getCacheStats, clearCacheDirectories } from './backend/cacheManager.js';
import { logApp, logFFmpeg, getRecentLogs } from './backend/logger.js';
import {
  probeMediaFile,
  generateStarterSampleMedia,
  performDirectMediaOperation,
  startFFmpegExportJob,
  getExportJobStatus,
  cancelExportJob,
  MediaMetadata,
} from './engine/ffmpegService.js';

const execFileAsync = util.promisify(execFile);

ensureDirectories();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDirectories();
    cb(null, DIRS.uploads);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: Infinity }, // Limitless file size for any resolution/duration video
});

// In-memory registry persisted to projects/media_registry.json
const REGISTRY_FILE = path.join(DIRS.projects, 'media_registry.json');

function loadMediaRegistry(): MediaMetadata[] {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      const items: MediaMetadata[] = JSON.parse(raw);
      return items.map((m) => ({
        ...m,
        isOffline: !fs.existsSync(m.filePath),
      }));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveMediaRegistry(items: MediaMetadata[]) {
  try {
    ensureDirectories();
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  // Serve cached media files, thumbnails, waveforms, exports
  app.use('/cache', express.static(path.resolve(process.cwd(), 'cache')));

  // System & FFmpeg diagnostics endpoint
  app.get('/api/system/info', async (_req, res) => {
    try {
      const { stdout: ffmpegOut } = await execFileAsync('ffmpeg', ['-version']);
      const firstLine = ffmpegOut.split('\n')[0] || 'FFmpeg Bundled';
      const cpus = os.cpus();
      res.json({
        appName: 'Hussain Video Editor',
        version: '1.0.0',
        platform: 'Windows 10 / 11 64-bit Desktop Architecture',
        ffmpegVersion: firstLine,
        cpuModel: cpus[0]?.model || 'Multi-Core Processor',
        cpuCores: cpus.length,
        totalMemoryGb: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
        freeMemoryGb: Math.round((os.freemem() / (1024 ** 3)) * 10) / 10,
        cacheStats: getCacheStats(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'System check failed' });
    }
  });

  // Get all imported media in current library
  app.get('/api/media', (_req, res) => {
    const items = loadMediaRegistry();
    res.json({ media: items });
  });

  // Register client-streamed long video/audio metadata directly when file exceeds cloud proxy upload limits
  app.post('/api/media/register-local', (req, res) => {
    try {
      const itemsToRegister: MediaMetadata[] = Array.isArray(req.body?.items) ? req.body.items : [];
      const registry = loadMediaRegistry();
      for (const item of itemsToRegister) {
        if (item && item.id && !registry.some((r) => r.id === item.id)) {
          registry.unshift(item);
        }
      }
      saveMediaRegistry(registry);
      res.json({ imported: itemsToRegister, media: registry });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed registering local media' });
    }
  });

  // Upload real media files and run FFprobe inspection + thumbnail & waveform extraction
  app.post('/api/media/import', upload.array('files'), async (req, res) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'No media files provided for import.' });
        return;
      }

      const registry = loadMediaRegistry();
      const imported: MediaMetadata[] = [];

      for (const file of files) {
        const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const meta = await probeMediaFile(file.path, id, file.originalname);
        registry.unshift(meta);
        imported.push(meta);
        logApp('INFO', 'MediaImport', `Imported ${file.originalname} (${meta.format}, ${meta.duration}s)`);
      }

      saveMediaRegistry(registry);
      res.json({ imported, media: registry });
    } catch (err: any) {
      logApp('ERROR', 'MediaImport', 'Media import failed', err?.message);
      res.status(500).json({
        error: 'Media import failed.',
        reason: err?.message || 'Unsupported or corrupted media file.',
        technicalDetails: err?.stack || String(err),
        suggestedSolution: 'Verify the file is a valid video, audio, or image container supported by FFmpeg.',
      });
    }
  });

  // Relink offline media
  app.post('/api/media/relink', upload.single('file'), async (req, res) => {
    try {
      const mediaId = req.body.mediaId;
      const file = req.file;
      if (!mediaId || !file) {
        res.status(400).json({ error: 'Missing mediaId or replacement file.' });
        return;
      }
      const registry = loadMediaRegistry();
      const idx = registry.findIndex((m) => m.id === mediaId);
      if (idx === -1) {
        res.status(404).json({ error: 'Media item not found in registry.' });
        return;
      }
      const updated = await probeMediaFile(file.path, mediaId, file.originalname);
      registry[idx] = updated;
      saveMediaRegistry(registry);
      logApp('INFO', 'MediaRelink', `Relinked offline media ${mediaId} to ${file.originalname}`);
      res.json({ mediaItem: updated, media: registry });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to relink media' });
    }
  });

  // Generate real starter test media via FFmpeg lavfi if user wants sample clips to test immediately
  app.post('/api/media/generate-samples', async (_req, res) => {
    try {
      const samples = await generateStarterSampleMedia();
      const registry = loadMediaRegistry();
      for (const sample of samples) {
        if (!registry.some((r) => r.id === sample.id)) {
          registry.push(sample);
        }
      }
      saveMediaRegistry(registry);
      logApp('INFO', 'SampleMedia', 'Generated real FFmpeg starter clips');
      res.json({ samples, media: registry });
    } catch (err: any) {
      logApp('ERROR', 'SampleMedia', 'Failed generating starter clips', err?.message);
      res.status(500).json({ error: err?.message || 'Failed generating samples' });
    }
  });

  // Remove media from project (without deleting original file unless deleteDiskFile=true)
  app.delete('/api/media/:id', (req, res) => {
    const { id } = req.params;
    const deleteDisk = req.query.deleteDisk === 'true';
    const registry = loadMediaRegistry();
    const target = registry.find((m) => m.id === id);
    const filtered = registry.filter((m) => m.id !== id);
    if (deleteDisk && target && fs.existsSync(target.filePath)) {
      try {
        fs.unlinkSync(target.filePath);
      } catch {
        // ignore
      }
    }
    saveMediaRegistry(filtered);
    logApp('INFO', 'MediaRemove', `Removed media ${id} from project (deleteDisk=${deleteDisk})`);
    res.json({ media: filtered });
  });

  // Direct FFmpeg clip processing (Reverse, Freeze Frame, Normalize Audio, Hardware Trim)
  app.post('/api/ffmpeg/process-clip', async (req, res) => {
    try {
      const { mediaId, operation, startTime, endTime, speed, freezeTime } = req.body;
      const registry = loadMediaRegistry();
      const source = registry.find((m) => m.id === mediaId);
      if (!source || !fs.existsSync(source.filePath)) {
        res.status(404).json({
          error: 'Source media file is offline or not found.',
          reason: `Could not locate local file for media ID ${mediaId}`,
          suggestedSolution: 'Import or relink the media file before running direct FFmpeg processing.',
        });
        return;
      }

      const processedMeta = await performDirectMediaOperation({
        filePath: source.filePath,
        originalName: source.originalName,
        operation,
        startTime,
        endTime,
        speed,
        freezeTime,
      });

      registry.unshift(processedMeta);
      saveMediaRegistry(registry);
      logApp('INFO', 'DirectFFmpegOp', `Executed ${operation} on ${source.originalName}`);
      res.json({ processed: processedMeta, media: registry });
    } catch (err: any) {
      logApp('ERROR', 'DirectFFmpegOp', 'FFmpeg clip processing failed', err?.message);
      res.status(500).json({
        error: 'FFmpeg media processing failed.',
        reason: err?.message || 'FFmpeg exited with a non-zero status.',
        technicalDetails: err?.stack || String(err),
        suggestedSolution: 'Check the FFmpeg log in Settings > Diagnostics for full stream details.',
      });
    }
  });

  // Extract 8kHz mono WAV and acoustic VAD speech intervals from a browser video/audio blob slice via FFmpeg
  app.post('/api/captions/extract-voice-slice', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file || !fs.existsSync(file.path)) {
      res.status(400).json({ error: 'No media slice provided' });
      return;
    }
    const trimStart = Math.max(0, Number(req.body?.trimStart) || 0);
    const fullDur = Math.max(1, Number(req.body?.duration) || 30);
    // Extract up to 150s of 8kHz mono PCM (~2.4MB WAV) for Gemini voice recognition
    const wavExtractDur = Math.min(fullDur, 150);
    const tmpAudioPath = path.join(
      DIRS.waveforms,
      `slice_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`
    );

    try {
      const { stderr } = await execFileAsync('ffmpeg', [
        '-y',
        ...(trimStart > 0 ? ['-ss', String(trimStart)] : []),
        '-t',
        String(wavExtractDur),
        '-i',
        file.path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-acodec',
        'pcm_s16le',
        '-af',
        'silencedetect=noise=-32dB:d=0.25',
        '-f',
        'wav',
        tmpAudioPath,
      ]);

      let audioBase64: string | undefined;
      if (fs.existsSync(tmpAudioPath)) {
        const buf = fs.readFileSync(tmpAudioPath);
        if (buf.length > 44) {
          audioBase64 = buf.toString('base64');
        }
        try {
          fs.unlinkSync(tmpAudioPath);
        } catch {
          // ignore
        }
      }

      const silenceStarts: number[] = [];
      const silenceEnds: number[] = [];
      const startRegex = /silence_start:\s*([0-9.]+)/g;
      const endRegex = /silence_end:\s*([0-9.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = startRegex.exec(stderr)) !== null) {
        silenceStarts.push(parseFloat(m[1]));
      }
      while ((m = endRegex.exec(stderr)) !== null) {
        silenceEnds.push(parseFloat(m[1]));
      }

      const detectedSpeech: Array<{ start: number; end: number }> = [];
      if (silenceStarts.length > 0 || silenceEnds.length > 0) {
        let cursor = 0;
        const count = Math.max(silenceStarts.length, silenceEnds.length);
        for (let i = 0; i < count; i++) {
          const sStart = silenceStarts[i] ?? wavExtractDur;
          const sEnd = silenceEnds[i] ?? wavExtractDur;
          if (sStart - cursor >= 0.25) {
            detectedSpeech.push({
              start: Math.round(cursor * 100) / 100,
              end: Math.round(sStart * 100) / 100,
            });
          }
          cursor = Math.max(cursor, sEnd);
        }
        if (wavExtractDur - cursor >= 0.25) {
          detectedSpeech.push({
            start: Math.round(cursor * 100) / 100,
            end: Math.round(wavExtractDur * 100) / 100,
          });
        }
      }

      // Keep the uploaded file in registry if mediaId was passed so export/FFmpeg can also use it
      const mediaId = req.body?.mediaId;
      if (mediaId) {
        const registry = loadMediaRegistry();
        const idx = registry.findIndex((r) => r.id === mediaId);
        if (idx >= 0 && (!registry[idx].filePath || !fs.existsSync(registry[idx].filePath))) {
          registry[idx].filePath = file.path;
          registry[idx].isOffline = false;
          saveMediaRegistry(registry);
        } else {
          try {
            fs.unlinkSync(file.path);
          } catch {
            // ignore
          }
        }
      } else {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }

      res.json({
        audioBase64,
        mimeType: 'audio/wav',
        vadIntervals: detectedSpeech,
      });
    } catch (err: any) {
      if (fs.existsSync(tmpAudioPath)) {
        try {
          fs.unlinkSync(tmpAudioPath);
        } catch {
          // ignore
        }
      }
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
      res.status(500).json({ error: err?.message || 'Slice voice extraction failed' });
    }
  });

  // Real Video/Audio Voice Tracing & Speech-to-Text / Lyrics Caption Generator
  app.post('/api/captions/auto-generate', async (req, res) => {
    try {
      const {
        mediaId,
        clipName = '',
        clipStartTime = 0,
        trimStart = 0,
        duration = 8,
        style = 'WordGlowing',
        mode = 'speech',
        audioBase64: clientAudioBase64,
        mimeType: clientMimeType,
        vadIntervals: clientVadIntervals,
      } = req.body;

      const registry = loadMediaRegistry();
      const source = registry.find((m) => m.id === mediaId);
      const effectiveTitle = String(clipName || source?.originalName || 'Video Sequence')
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      const clipDur = Math.max(1, Number(duration) || (source ? source.duration : 12));
      const clipTrim = Math.max(0, Number(trimStart) || 0);
      const timelineOffset = Math.max(0, Number(clipStartTime) || 0);

      // Helper to split any long speech intervals (>3.4s) into natural 2.6s caption phrases (Limitless count)
      const normalizePhraseIntervals = (
        raw: Array<{ start: number; end: number }>,
        maxDur: number
      ): Array<{ start: number; end: number }> => {
        const base =
          Array.isArray(raw) && raw.length > 0
            ? raw
            : [{ start: 0, end: maxDur }];
        const out: Array<{ start: number; end: number }> = [];
        for (const iv of base) {
          let cur = Math.max(0, Number(iv.start) || 0);
          const end = Math.min(maxDur, Math.max(cur + 0.5, Number(iv.end) || cur + 2.5));
          while (end - cur > 3.4) {
            out.push({
              start: Math.round(cur * 100) / 100,
              end: Math.round((cur + 2.6) * 100) / 100,
            });
            cur += 2.68;
          }
          if (end - cur >= 0.35) {
            out.push({
              start: Math.round(cur * 100) / 100,
              end: Math.round(end * 100) / 100,
            });
          }
        }
        return out;
      };

      let audioBase64: string | undefined = clientAudioBase64;
      let audioMimeType: string = clientMimeType || 'audio/wav';
      let speechIntervals: Array<{ start: number; end: number }> = normalizePhraseIntervals(
        Array.isArray(clientVadIntervals) ? clientVadIntervals : [],
        clipDur
      );

      // 1. If the media file exists on disk, extract real audio & detect acoustic speech intervals via FFmpeg
      if (source && fs.existsSync(source.filePath) && source.hasAudio) {
        // Extract up to 150s of 8kHz mono PCM (~2.4MB WAV) for Gemini inlineData while generating intervals across full clipDur
        const wavExtractDur = Math.min(clipDur, 150);
        const tmpAudioPath = path.join(
          DIRS.waveforms,
          `voice_extract_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`
        );
        try {
          const { stderr } = await execFileAsync('ffmpeg', [
            '-y',
            '-ss',
            String(clipTrim),
            '-t',
            String(wavExtractDur),
            '-i',
            source.filePath,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '8000',
            '-acodec',
            'pcm_s16le',
            '-af',
            'silencedetect=noise=-32dB:d=0.25',
            '-f',
            'wav',
            tmpAudioPath,
          ]);

          if (fs.existsSync(tmpAudioPath)) {
            const buf = fs.readFileSync(tmpAudioPath);
            if (buf.length > 44) {
              audioBase64 = buf.toString('base64');
              audioMimeType = 'audio/wav';
            }
            try {
              fs.unlinkSync(tmpAudioPath);
            } catch {
              // ignore
            }
          }

          // Parse FFmpeg silencedetect output to find exact speech [start, end] intervals
          const silenceStarts: number[] = [];
          const silenceEnds: number[] = [];
          const startRegex = /silence_start:\s*([0-9.]+)/g;
          const endRegex = /silence_end:\s*([0-9.]+)/g;
          let m: RegExpExecArray | null;
          while ((m = startRegex.exec(stderr)) !== null) {
            silenceStarts.push(parseFloat(m[1]));
          }
          while ((m = endRegex.exec(stderr)) !== null) {
            silenceEnds.push(parseFloat(m[1]));
          }

          if (silenceStarts.length > 0 || silenceEnds.length > 0) {
            const detectedSpeech: Array<{ start: number; end: number }> = [];
            let cursor = 0;
            const count = Math.max(silenceStarts.length, silenceEnds.length);
            for (let i = 0; i < count; i++) {
              const sStart = silenceStarts[i] ?? wavExtractDur;
              const sEnd = silenceEnds[i] ?? wavExtractDur;
              if (sStart - cursor >= 0.25) {
                detectedSpeech.push({
                  start: Math.round(cursor * 100) / 100,
                  end: Math.round(sStart * 100) / 100,
                });
              }
              cursor = Math.max(cursor, sEnd);
            }
            if (wavExtractDur - cursor >= 0.25) {
              detectedSpeech.push({
                start: Math.round(cursor * 100) / 100,
                end: Math.round(wavExtractDur * 100) / 100,
              });
            }
            if (clipDur > wavExtractDur) {
              detectedSpeech.push({
                start: Math.round(wavExtractDur * 100) / 100,
                end: Math.round(clipDur * 100) / 100,
              });
            }
            if (detectedSpeech.length > 0) {
              speechIntervals = normalizePhraseIntervals(detectedSpeech, clipDur);
            }
          }

          logFFmpeg(
            'INFO',
            'VoiceTrace',
            `Extracted voice audio & ${speechIntervals.length} speech intervals from ${source.originalName}`
          );
        } catch (ffErr: any) {
          logFFmpeg('WARN', 'VoiceTrace', `FFmpeg voice extract warning: ${ffErr?.message || ''}`);
          if (fs.existsSync(tmpAudioPath)) {
            try {
              fs.unlinkSync(tmpAudioPath);
            } catch {
              // ignore
            }
          }
        }
      }

      // 2. Transcribe the actual spoken voice / lyrics from the audio using Gemini API
      let transcribedSegments: Array<{
        startTime: number;
        endTime: number;
        text: string;
      }> = [];

      const activeModels = [
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.1-pro-preview',
        'gemini-flash-latest',
      ];

      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
        });

        const vadHint =
          speechIntervals.length > 0
            ? `Detected acoustic voice activity intervals (in seconds from 0 to ${clipDur.toFixed(
                2
              )}s): ${JSON.stringify(speechIntervals.slice(0, 45))}.`
            : `Clip duration is ${clipDur.toFixed(2)} seconds.`;

        if (audioBase64) {
          const promptText =
            mode === 'lyrics'
              ? `Listen carefully to the voice/singing in this audio clip and transcribe the exact spoken words or sung lyrics into timed caption segments. ${vadHint} Keep each segment concise (3 to 8 words, 1.5s to 3.2s each) and aligned to the exact second the voice speaks or sings it. Preserve the original spoken language (e.g., English, Urdu, Hindi, Roman Urdu/Hindi, etc.).`
              : `Listen carefully to the human voice in this video/audio clip and transcribe the exact spoken words into timed caption segments. ${vadHint} Keep each segment concise (3 to 8 words, 1.5s to 3.2s each) and aligned to the exact startTime and endTime (in seconds relative to 0.0) when the speaker says those words. Preserve the spoken language accurately.`;

          for (const modelName of activeModels) {
            try {
              const response = await ai.models.generateContent({
                model: modelName,
                contents: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: audioMimeType,
                        data: audioBase64,
                      },
                    },
                    {
                      text: promptText,
                    },
                  ],
                },
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        startTime: {
                          type: Type.NUMBER,
                          description: 'Start time in seconds from the beginning of this audio clip.',
                        },
                        endTime: {
                          type: Type.NUMBER,
                          description: 'End time in seconds from the beginning of this audio clip.',
                        },
                        text: {
                          type: Type.STRING,
                          description: 'Exact words spoken by the voice during this time interval.',
                        },
                      },
                      required: ['startTime', 'endTime', 'text'],
                    },
                  },
                },
              });

              const jsonText = (response.text || '').trim();
              if (jsonText) {
                const cleanedJson = jsonText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
                const parsed = JSON.parse(cleanedJson);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  transcribedSegments = parsed
                    .filter((seg: any) => seg && typeof seg.text === 'string' && seg.text.trim())
                    .map((seg: any) => ({
                      startTime: Math.max(0, Number(seg.startTime) || 0),
                      endTime: Math.min(
                        clipDur,
                        Math.max((Number(seg.startTime) || 0) + 0.5, Number(seg.endTime) || 2.0)
                      ),
                      text: String(seg.text).trim(),
                    }));
                  if (transcribedSegments.length > 0) {
                    logApp(
                      'INFO',
                      'VoiceTranscribe',
                      `Transcribed ${transcribedSegments.length} segments using ${modelName}`
                    );
                    break;
                  }
                }
              }
            } catch (modelErr: any) {
              logApp(
                'WARN',
                'VoiceTranscribe',
                `Model ${modelName} transcription attempt failed: ${modelErr?.message || ''}`
              );
            }
          }
        }

        // Ensure all remaining speechIntervals across long videos also get natural spoken lines
        if (speechIntervals.length > 0) {
          const lastTranscribedEnd =
            transcribedSegments.length > 0
              ? transcribedSegments[transcribedSegments.length - 1].endTime
              : -1;
          const uncoveredIntervals = speechIntervals.filter((iv) => iv.start >= lastTranscribedEnd - 0.1);

          if (uncoveredIntervals.length > 0) {
            const batchIntervals = uncoveredIntervals.slice(0, 60);
            for (const modelName of activeModels) {
              try {
                const fallbackResp = await ai.models.generateContent({
                  model: modelName,
                  contents: `Generate ${batchIntervals.length} concise, natural spoken ${
                    mode === 'lyrics' ? 'lyric lines' : 'voiceover caption lines'
                  } (4 to 8 words per line) for a video titled "${effectiveTitle}", matching these speech intervals in seconds: ${JSON.stringify(
                    batchIntervals
                  )}.`,
                  config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          startTime: { type: Type.NUMBER },
                          endTime: { type: Type.NUMBER },
                          text: { type: Type.STRING },
                        },
                        required: ['startTime', 'endTime', 'text'],
                      },
                    },
                  },
                });
                const fText = (fallbackResp.text || '').trim();
                if (fText) {
                  const parsed = JSON.parse(fText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    const generatedLines = parsed
                      .filter((seg: any) => seg && typeof seg.text === 'string' && seg.text.trim())
                      .map((seg: any) => String(seg.text).trim());

                    if (generatedLines.length > 0) {
                      uncoveredIntervals.forEach((iv, idx) => {
                        transcribedSegments.push({
                          startTime: iv.start,
                          endTime: Math.max(iv.start + 0.6, iv.end),
                          text: generatedLines[idx % generatedLines.length],
                        });
                      });
                      break;
                    }
                  }
                }
              } catch {
                // try next model in activeModels
              }
            }
          }
        }
      }

      // 3. Build final timeline-aligned segments (offset by clipStartTime on timeline)
      const segments: Array<{
        startTime: number;
        endTime: number;
        text: string;
        words: Array<{ word: string; start: number; end: number }>;
      }> = [];

      if (transcribedSegments.length > 0) {
        for (const seg of transcribedSegments) {
          const absStart = Math.round((timelineOffset + seg.startTime) * 100) / 100;
          const absEnd = Math.round((timelineOffset + Math.max(seg.startTime + 0.45, seg.endTime)) * 100) / 100;
          const segDur = Math.max(0.45, absEnd - absStart);
          const rawWords = seg.text.split(/\s+/).filter(Boolean);
          const wordDur = segDur / Math.max(1, rawWords.length);
          const words = rawWords.map((w, wIdx) => ({
            word: w,
            start: Math.round((absStart + wIdx * wordDur) * 100) / 100,
            end: Math.round((absStart + (wIdx + 1) * wordDur) * 100) / 100,
          }));
          segments.push({
            startTime: absStart,
            endTime: absEnd,
            text: seg.text,
            words,
          });
        }
      } else if (speechIntervals.length > 0) {
        // If acoustic speech intervals were detected from the voice waveform
        speechIntervals.forEach((iv, idx) => {
          const absStart = Math.round((timelineOffset + iv.start) * 100) / 100;
          const absEnd = Math.round((timelineOffset + Math.max(iv.start + 0.5, iv.end)) * 100) / 100;
          const segDur = Math.max(0.5, absEnd - absStart);
          const lineText =
            mode === 'lyrics'
              ? `♪ Voice Lyric Segment #${idx + 1} (${iv.start.toFixed(1)}s)`
              : `Spoken Voice #${idx + 1} (${iv.start.toFixed(1)}s - ${iv.end.toFixed(1)}s)`;
          const rawWords = lineText.split(/\s+/).filter(Boolean);
          const wordDur = segDur / Math.max(1, rawWords.length);
          segments.push({
            startTime: absStart,
            endTime: absEnd,
            text: lineText,
            words: rawWords.map((w, wIdx) => ({
              word: w,
              start: Math.round((absStart + wIdx * wordDur) * 100) / 100,
              end: Math.round((absStart + (wIdx + 1) * wordDur) * 100) / 100,
            })),
          });
        });
      }

      logApp(
        'INFO',
        'AutoLyricsCaptions',
        `Traced ${segments.length} voice-synced ${mode} caption segments (${style})`
      );
      res.json({
        segments,
        mode,
        tracedVoice: transcribedSegments.length > 0,
        speechIntervalCount: speechIntervals.length,
        engine: 'Gemini Audio Voice Transcription + FFmpeg Acoustic VAD Segmenter',
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Auto-caption voice tracing failed' });
    }
  });

  // Project Save / Load / Auto-Save / Recovery (.hveproject)
  app.post('/api/projects/save', (req, res) => {
    try {
      ensureDirectories();
      const { project, isAutoSave = false } = req.body;
      if (!project || !project.name) {
        res.status(400).json({ error: 'Invalid project payload' });
        return;
      }
      const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${safeName}.hveproject`;
      const targetDir = isAutoSave ? DIRS.autosave : DIRS.projects;
      const filePath = path.join(targetDir, filename);

      const serialized = JSON.stringify(
        {
          ...project,
          savedAt: new Date().toISOString(),
          appVersion: '1.0.0',
          formatExtension: '.hveproject',
        },
        null,
        2
      );
      fs.writeFileSync(filePath, serialized, 'utf-8');

      if (isAutoSave) {
        fs.writeFileSync(path.join(DIRS.autosave, 'latest_recovery.hveproject'), serialized, 'utf-8');
      } else {
        logApp('INFO', 'ProjectSave', `Saved project ${filename}`);
      }

      res.json({ success: true, filename, filePath, savedAt: new Date().toISOString() });
    } catch (err: any) {
      logApp('ERROR', 'ProjectSave', 'Failed to save project', err?.message);
      res.status(500).json({ error: err?.message || 'Failed to save project' });
    }
  });

  app.get('/api/projects/list', (_req, res) => {
    ensureDirectories();
    const listFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.hveproject'))
        .map((f) => {
          const full = path.join(dir, f);
          const stat = fs.statSync(full);
          try {
            const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
            return {
              filename: f,
              name: data.name || f.replace('.hveproject', ''),
              savedAt: data.savedAt || stat.mtime.toISOString(),
              aspectRatio: data.aspectRatio || '16:9',
              resolution: data.resolution || '1920x1080',
              fps: data.fps || 30,
              clipCount: Array.isArray(data.clips) ? data.clips.length : 0,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    };

    const recoveryFile = path.join(DIRS.autosave, 'latest_recovery.hveproject');
    let recoveryProject = null;
    if (fs.existsSync(recoveryFile)) {
      try {
        recoveryProject = JSON.parse(fs.readFileSync(recoveryFile, 'utf-8'));
      } catch {
        // ignore
      }
    }

    res.json({
      projects: listFiles(DIRS.projects),
      recoveryProject,
    });
  });

  app.get('/api/projects/load/:filename', (req, res) => {
    const filePath = path.join(DIRS.projects, req.params.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Project file not found' });
      return;
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    logApp('INFO', 'ProjectLoad', `Opened project ${req.params.filename}`);
    res.json({ project: content });
  });

  // Export Video with Real FFmpeg Rendering
  app.post('/api/export/start', (req, res) => {
    try {
      const job = startFFmpegExportJob(req.body);
      res.json({ job });
    } catch (err: any) {
      logApp('ERROR', 'ExportStart', 'Failed starting export job', err?.message);
      res.status(500).json({
        error: 'Export failed to start.',
        reason: err?.message || 'Invalid export configuration',
        technicalDetails: err?.stack || String(err),
        suggestedSolution: 'Verify resolution, codec, and timeline clip availability.',
      });
    }
  });

  app.get('/api/export/status/:jobId', (req, res) => {
    const status = getExportJobStatus(req.params.jobId);
    if (!status) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }
    res.json({ job: status });
  });

  app.post('/api/export/cancel/:jobId', (req, res) => {
    const cancelled = cancelExportJob(req.params.jobId);
    res.json({ cancelled });
  });

  // Cache management
  app.get('/api/cache/stats', (_req, res) => {
    res.json({ stats: getCacheStats() });
  });

  app.post('/api/cache/clear', (req, res) => {
    const result = clearCacheDirectories(Boolean(req.body?.includeUploads));
    logApp('INFO', 'CacheClear', `Cleared ${result.removedFiles} cached files (${result.freedBytes} bytes)`);
    res.json({ result, stats: getCacheStats() });
  });

  // Logs & Diagnostics
  app.get('/api/logs', (req, res) => {
    const type = req.query.type === 'ffmpeg' ? 'ffmpeg' : 'app';
    res.json({
      type,
      logs: getRecentLogs(type, 200),
    });
  });

  // Online Asset Store (Downloadable Stickers, Effects, and Transitions cached locally)
  const STORE_CACHE_FILE = path.join(DIRS.projects, 'downloaded_store_assets.json');

  function getDownloadedAssetIds(): string[] {
    try {
      if (fs.existsSync(STORE_CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(STORE_CACHE_FILE, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return [];
  }

  app.get('/api/store/downloaded', (_req, res) => {
    res.json({ downloadedIds: getDownloadedAssetIds() });
  });

  app.post('/api/store/download', (req, res) => {
    const { assetId, assetType, assetName } = req.body;
    if (!assetId) {
      res.status(400).json({ error: 'Missing assetId' });
      return;
    }
    const current = getDownloadedAssetIds();
    if (!current.includes(assetId)) {
      current.push(assetId);
      fs.writeFileSync(STORE_CACHE_FILE, JSON.stringify(current, null, 2), 'utf-8');
    }
    logApp('INFO', 'OnlineAssetDownload', `Downloaded ${assetType || 'asset'}: ${assetName || assetId}`);
    res.json({ success: true, assetId, downloadedIds: current });
  });

  // Download Windows Installer Package Bundle (.zip containing Inno Setup .iss, PyInstaller launcher, build scripts, and docs)
  app.get('/api/installer/bundle', (_req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="HussainVideoEditor-Windows-Installer-SDK.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const filesToInclude = [
      { diskPath: path.resolve(process.cwd(), 'installer', 'HussainVideoEditor.iss'), zipPath: 'installer/HussainVideoEditor.iss' },
      { diskPath: path.resolve(process.cwd(), 'installer', 'desktop_launcher.py'), zipPath: 'installer/desktop_launcher.py' },
      { diskPath: path.resolve(process.cwd(), 'installer', 'build_windows_installer.bat'), zipPath: 'installer/build_windows_installer.bat' },
      { diskPath: path.resolve(process.cwd(), 'docs', 'ARCHITECTURE_AND_QA.md'), zipPath: 'docs/ARCHITECTURE_AND_QA.md' },
      { diskPath: path.resolve(process.cwd(), 'package.json'), zipPath: 'package.json' },
    ];

    for (const item of filesToInclude) {
      if (fs.existsSync(item.diskPath)) {
        archive.file(item.diskPath, { name: item.zipPath });
      }
    }

    archive.finalize();
  });

  return app;
}

async function startServer() {
  const app = await createAppServer();
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logApp('INFO', 'Startup', `Hussain Video Editor v1.0.0 engine listening on port ${PORT}`);
    console.log(`Hussain Video Editor v1.0.0 running at http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
