import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { DIRS, ensureDirectories } from '../backend/cacheManager.js';
import { logApp, logFFmpeg } from '../backend/logger.js';

const execFileAsync = util.promisify(execFile);

export interface MediaMetadata {
  id: string;
  filename: string;
  originalName: string;
  filePath: string;
  url: string;
  thumbnailUrl?: string;
  waveformUrl?: string;
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

export interface ExportJobProgress {
  jobId: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputUrl?: string;
  outputPath?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
  technicalDetails?: string;
  commandUsed?: string;
}

const activeExportJobs = new Map<string, { progress: ExportJobProgress; process?: ReturnType<typeof spawn> }>();

export function getExportJobStatus(jobId: string): ExportJobProgress | undefined {
  return activeExportJobs.get(jobId)?.progress;
}

export function cancelExportJob(jobId: string): boolean {
  const job = activeExportJobs.get(jobId);
  if (job && job.process && job.progress.status === 'rendering') {
    job.process.kill('SIGTERM');
    job.progress.status = 'cancelled';
    logFFmpeg('WARN', 'ExportCancel', `Cancelled export job ${jobId}`);
    return true;
  }
  return false;
}

export async function probeMediaFile(
  filePath: string,
  id: string,
  originalName: string
): Promise<MediaMetadata> {
  ensureDirectories();
  if (!fs.existsSync(filePath)) {
    throw new Error(`Media file does not exist at path: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(originalName || filePath).toLowerCase().replace('.', '');
  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  const audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'];

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    logFFmpeg('INFO', 'FFprobe', `Inspected ${originalName}`, stdout.slice(0, 500));
    const data = JSON.parse(stdout);
    const streams: any[] = data.streams || [];
    const formatInfo = data.format || {};

    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    let fps = 30;
    if (videoStream?.r_frame_rate) {
      const parts = String(videoStream.r_frame_rate).split('/');
      if (parts.length === 2 && Number(parts[1]) > 0) {
        fps = Math.round((Number(parts[0]) / Number(parts[1])) * 100) / 100;
      } else if (!isNaN(Number(videoStream.r_frame_rate))) {
        fps = Number(videoStream.r_frame_rate);
      }
    }
    if (fps <= 0 || fps > 240 || isNaN(fps)) fps = 30;

    const isImage =
      imageExts.includes(ext) ||
      videoStream?.codec_name === 'png' ||
      videoStream?.codec_name === 'mjpeg' ||
      (videoStream && !audioStream && Number(formatInfo.duration || 0) < 0.1);

    let type: 'video' | 'audio' | 'image' = 'video';
    if (isImage) {
      type = 'image';
    } else if (!videoStream && audioStream) {
      type = 'audio';
    } else if (audioExts.includes(ext) && !videoStream) {
      type = 'audio';
    }

    const durationRaw = Number(formatInfo.duration || videoStream?.duration || audioStream?.duration || 0);
    const duration = type === 'image' ? 5.0 : Math.max(0.1, durationRaw || 5.0);
    const width = Number(videoStream?.width || (type === 'audio' ? 0 : 1920));
    const height = Number(videoStream?.height || (type === 'audio' ? 0 : 1080));

    let thumbnailUrl: string | undefined;
    if (type === 'video' || type === 'image') {
      const thumbFilename = `${id}_thumb.jpg`;
      const thumbPath = path.join(DIRS.thumbnails, thumbFilename);
      try {
        const seekTime = type === 'video' ? Math.min(1.0, duration * 0.25) : 0;
        await execFileAsync('ffmpeg', [
          '-y',
          ...(type === 'video' ? ['-ss', seekTime.toFixed(2)] : []),
          '-i',
          filePath,
          '-vframes',
          '1',
          '-vf',
          'scale=320:-1',
          '-q:v',
          '4',
          thumbPath,
        ]);
        if (fs.existsSync(thumbPath)) {
          thumbnailUrl = `/cache/thumbnails/${thumbFilename}`;
        }
      } catch (thumbErr: any) {
        logFFmpeg('WARN', 'ThumbnailGen', `Failed thumbnail for ${originalName}`, thumbErr?.message);
      }
    }

    let peaks: number[] | undefined;
    if (audioStream || type === 'audio') {
      peaks = await extractAudioPeaks(filePath, duration);
    }

    const filename = path.basename(filePath);
    return {
      id,
      filename,
      originalName,
      filePath,
      url: `/cache/uploads/${filename}`,
      thumbnailUrl,
      type,
      format: ext.toUpperCase() || (formatInfo.format_name || 'MEDIA').toUpperCase(),
      duration: Math.round(duration * 100) / 100,
      width,
      height,
      fps: type === 'image' ? 30 : fps,
      videoCodec: videoStream?.codec_name || (type === 'image' ? ext : 'none'),
      audioCodec: audioStream?.codec_name || 'none',
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      fileSize: stat.size,
      createdAt: new Date().toISOString(),
      peaks,
      isOffline: false,
    };
  } catch (err: any) {
    logFFmpeg('ERROR', 'FFprobe', `Failed probing ${originalName}`, err?.message);
    throw new Error(`FFprobe inspection failed for ${originalName}: ${err?.message || String(err)}`);
  }
}

async function extractAudioPeaks(filePath: string, duration: number, numBins = 64): Promise<number[]> {
  try {
    // Extract raw 8-bit unsigned mono PCM at 1000 Hz to compute real waveform amplitudes
    const { stdout } = await execFileAsync(
      'ffmpeg',
      [
        '-i',
        filePath,
        '-ac',
        '1',
        '-ar',
        '400',
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        '-t',
        String(Math.min(duration, 45)),
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024, timeout: 8000 }
    );

    const buffer = stdout as unknown as Buffer;
    const sampleCount = Math.floor(buffer.length / 2);
    if (sampleCount === 0) {
      return Array.from({ length: numBins }, () => 0.25);
    }

    const samplesPerBin = Math.max(1, Math.floor(sampleCount / numBins));
    const peaks: number[] = [];

    for (let i = 0; i < numBins; i++) {
      let maxVal = 0;
      const start = i * samplesPerBin;
      const end = Math.min(sampleCount, start + samplesPerBin);
      for (let j = start; j < end; j++) {
        const sample = Math.abs(buffer.readInt16LE(j * 2));
        if (sample > maxVal) maxVal = sample;
      }
      const normalized = Math.min(1, Math.max(0.06, maxVal / 32768));
      peaks.push(Math.round(normalized * 100) / 100);
    }
    return peaks;
  } catch {
    return Array.from({ length: numBins }, (_, idx) =>
      Math.round((0.2 + 0.35 * Math.abs(Math.sin(idx * 0.45))) * 100) / 100
    );
  }
}

export async function generateStarterSampleMedia(): Promise<MediaMetadata[]> {
  ensureDirectories();
  const samples = [
    {
      id: 'sample-studio-intro',
      filename: 'sample_studio_intro.mp4',
      originalName: 'Studio_B_Roll_1080p.mp4',
      args: [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1280x720:rate=30:duration=6',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100:duration=6',
        '-vf',
        'hue=h=210:s=1.2',
        '-af',
        'afade=t=in:st=0:d=0.5,afade=t=out:st=5:d=1',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
      ],
    },
    {
      id: 'sample-cinematic-seq',
      filename: 'sample_cinematic_seq.mp4',
      originalName: 'Documentary_Aerial_Cut.mp4',
      args: [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'smptehdbars=size=1280x720:rate=30:duration=5',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=330:sample_rate=44100:duration=5',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
      ],
    },
    {
      id: 'sample-ambient-bed',
      filename: 'sample_ambient_bed.wav',
      originalName: 'Podcast_Ambient_Bed.wav',
      args: [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:sample_rate=44100:duration=8',
        '-af',
        'aecho=0.8:0.88:60:0.4,afade=t=in:st=0:d=1,afade=t=out:st=6.5:d=1.5',
        '-c:a',
        'pcm_s16le',
      ],
    },
  ];

  const results: MediaMetadata[] = [];
  for (const s of samples) {
    const outPath = path.join(DIRS.uploads, s.filename);
    if (fs.existsSync(outPath)) {
      try {
        if (fs.statSync(outPath).size < 256) {
          fs.unlinkSync(outPath);
        }
      } catch {
        // ignore
      }
    }
    if (!fs.existsSync(outPath)) {
      try {
        await execFileAsync('ffmpeg', [...s.args, outPath]);
        logFFmpeg('INFO', 'GenerateStarterMedia', `Created real sample file ${s.filename}`);
      } catch (err: any) {
        logFFmpeg('ERROR', 'GenerateStarterMedia', `Error creating ${s.filename}`, err?.message);
      }
    }
    if (fs.existsSync(outPath) && fs.statSync(outPath).size >= 256) {
      const meta = await probeMediaFile(outPath, s.id, s.originalName);
      results.push(meta);
    }
  }
  return results;
}

export async function performDirectMediaOperation(params: {
  filePath: string;
  originalName: string;
  operation: 'reverse' | 'speed' | 'trim' | 'freeze' | 'normalize';
  startTime?: number;
  endTime?: number;
  speed?: number;
  freezeTime?: number;
  freezeDuration?: number;
}): Promise<MediaMetadata> {
  ensureDirectories();
  const id = `op_${Date.now()}`;
  const ext = path.extname(params.filePath) || '.mp4';
  const outFilename = `${id}${ext}`;
  const outPath = path.join(DIRS.uploads, outFilename);

  let args: string[] = ['-y', '-i', params.filePath];

  if (params.operation === 'reverse') {
    args.push('-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'ultrafast', outPath);
  } else if (params.operation === 'speed') {
    const spd = Math.max(0.25, Math.min(4.0, params.speed || 2.0));
    const pts = (1 / spd).toFixed(4);
    args.push('-vf', `setpts=${pts}*PTS`, '-af', `atempo=${spd}`, '-c:v', 'libx264', '-preset', 'ultrafast', outPath);
  } else if (params.operation === 'trim') {
    const start = Math.max(0, params.startTime || 0);
    const dur = Math.max(0.2, (params.endTime || start + 3) - start);
    args = ['-y', '-ss', String(start), '-i', params.filePath, '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', outPath];
  } else if (params.operation === 'freeze') {
    const freezeTime = Math.max(0, params.freezeTime || 1.0);
    const freezeOutFilename = `${id}_freeze.jpg`;
    const freezeOutPath = path.join(DIRS.uploads, freezeOutFilename);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      String(freezeTime),
      '-i',
      params.filePath,
      '-vframes',
      '1',
      '-q:v',
      '2',
      freezeOutPath,
    ]);
    return probeMediaFile(freezeOutPath, id, `FreezeFrame_${params.originalName}.jpg`);
  } else if (params.operation === 'normalize') {
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:v', 'copy', outPath);
  }

  logFFmpeg('INFO', `DirectOp:${params.operation}`, `ffmpeg ${args.join(' ')}`);
  await execFileAsync('ffmpeg', args);
  return probeMediaFile(outPath, id, `${params.operation.toUpperCase()}_${params.originalName}`);
}

export interface ExportRequestPayload {
  projectName: string;
  format: 'mp4' | 'mov' | 'webm';
  videoCodec: 'libx264' | 'libx265' | 'libvpx-vp9';
  resolution: '480p' | '720p' | '1080p' | '1440p' | '4k' | '8k';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  fps: number;
  bitratePreset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  customBitrateMbps?: number;
  audioCodec: 'aac' | 'pcm_s16le';
  duration: number;
  clips: Array<{
    id: string;
    name: string;
    type: 'video' | 'audio' | 'image' | 'text' | 'caption' | 'sticker';
    filePath?: string;
    trackType: 'video' | 'audio' | 'caption';
    startTime: number;
    duration: number;
    trimStart: number;
    speed: number;
    opacity: number;
    volume: number;
    muted?: boolean;
    fadeIn: number;
    fadeOut: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    scaleX: number;
    scaleY: number;
    positionX: number;
    positionY: number;
    adjustments: {
      brightness: number;
      contrast: number;
      saturation: number;
      exposure: number;
      temperature: number;
      tint: number;
      sharpness: number;
      vignette: number;
    };
    effects: string[];
    filterPreset?: string;
    textContent?: string;
    fontSize?: number;
    fontColor?: string;
  }>;
}

function formatSrtTimeForFFmpeg(sec: number): string {
  const safe = Math.max(0, sec);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)},${pad3(ms)}`;
}

function resolveDiskPathForClip(clip: {
  filePath?: string;
  name?: string;
  mediaId?: string;
}): string | undefined {
  if (clip.filePath && fs.existsSync(clip.filePath)) {
    return clip.filePath;
  }
  // Check media_registry.json by mediaId or originalName
  try {
    const regFile = path.join(DIRS.projects, 'media_registry.json');
    if (fs.existsSync(regFile)) {
      const items: MediaMetadata[] = JSON.parse(fs.readFileSync(regFile, 'utf-8'));
      const matched = items.find(
        (m) =>
          (clip.mediaId && m.id === clip.mediaId && fs.existsSync(m.filePath)) ||
          (clip.name && m.originalName === clip.name && fs.existsSync(m.filePath))
      );
      if (matched) return matched.filePath;
    }
  } catch {
    // ignore
  }
  // Check DIRS.uploads for any matching file suffix
  try {
    if (clip.name && fs.existsSync(DIRS.uploads)) {
      const safeTarget = clip.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
      const files = fs.readdirSync(DIRS.uploads);
      const found = files.find(
        (f) => f.toLowerCase() === safeTarget || f.toLowerCase().endsWith(`_${safeTarget}`)
      );
      if (found) {
        return path.join(DIRS.uploads, found);
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function startFFmpegExportJob(payload: ExportRequestPayload): ExportJobProgress {
  ensureDirectories();
  const jobId = `export_${Date.now()}`;
  const safeName = (payload.projectName || 'Hussain_Project')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);
  const ext = payload.format || 'mp4';
  const outFilename = `${safeName}_${jobId}.${ext}`;
  const outPath = path.join(DIRS.exports, outFilename);

  const resMap: Record<string, { baseW: number; baseH: number }> = {
    '480p': { baseW: 854, baseH: 480 },
    '720p': { baseW: 1280, baseH: 720 },
    '1080p': { baseW: 1920, baseH: 1080 },
    '1440p': { baseW: 2560, baseH: 1440 },
    '4k': { baseW: 3840, baseH: 2160 },
    '8k': { baseW: 7680, baseH: 4320 },
  };
  const base = resMap[payload.resolution] || resMap['1080p'];
  let outW = base.baseW;
  let outH = base.baseH;
  if (payload.aspectRatio === '9:16') {
    outW = base.baseH;
    outH = base.baseW;
  } else if (payload.aspectRatio === '1:1') {
    outW = base.baseH;
    outH = base.baseH;
  } else if (payload.aspectRatio === '4:5') {
    outW = Math.round((base.baseH * 4) / 5 / 2) * 2;
    outH = base.baseH;
  }

  // Ensure even dimensions for H.264 / H.265 yuv420p
  outW = Math.max(2, Math.floor(outW / 2) * 2);
  outH = Math.max(2, Math.floor(outH / 2) * 2);

  // Limitless export duration — renders 100% of timeline regardless of how many minutes or hours
  const totalDuration = Math.max(0.5, Number(payload.duration) || 5);
  const fps = Math.max(1, Math.min(120, Number(payload.fps) || 30));

  const bitrateMap: Record<string, string> = {
    low: '2500k',
    medium: '6000k',
    high: '14000k',
    ultra: '35000k',
    custom: `${Math.max(1, Number(payload.customBitrateMbps) || 16)}M`,
  };
  const targetBitrate = bitrateMap[payload.bitratePreset] || '14000k';

  // Resolve real disk paths for all visual & audio clips (Note: muted video clips still render visually!)
  const enrichedClips = (payload.clips || []).map((c: any) => ({
    ...c,
    resolvedPath: resolveDiskPathForClip(c),
  }));

  const visualClips = enrichedClips
    .filter((c) => (c.type === 'video' || c.type === 'image') && c.resolvedPath)
    .sort((a, b) => a.startTime - b.startTime);

  const hasTimelineVisualClips = enrichedClips.some(
    (c) => c.type === 'video' || c.type === 'image'
  );

  // If the timeline has video/image clips but none exist on server disk (e.g. large browser blob),
  // throw so the client immediately runs the full multi-clip Browser Canvas + WebAudio renderer instead of a blank screen
  if (hasTimelineVisualClips && visualClips.length === 0) {
    throw new Error(
      'Timeline visual media is hosted in browser memory; switching to Browser Hardware Canvas Renderer.'
    );
  }

  const externalAudioClips = enrichedClips
    .filter(
      (c) =>
        c.type === 'audio' &&
        c.resolvedPath &&
        !c.muted &&
        (c.volume === undefined || c.volume > 0)
    )
    .sort((a, b) => a.startTime - b.startTime);

  const captionClips = enrichedClips
    .filter((c) => (c.type === 'caption' || c.type === 'text') && (c.textContent || c.name))
    .sort((a, b) => a.startTime - b.startTime);

  // Write temporary .srt file if there are captions/text on the timeline to burn into the video
  let srtTempPath: string | undefined;
  if (captionClips.length > 0) {
    try {
      srtTempPath = path.join(DIRS.exports, `${jobId}_subs.srt`);
      const srtBlocks = captionClips.map((c, idx) => {
        const s = formatSrtTimeForFFmpeg(c.startTime);
        const e = formatSrtTimeForFFmpeg(c.startTime + Math.max(0.4, c.duration));
        const text = String(c.textContent || c.name || '').replace(/\|/g, '\n').trim();
        return `${idx + 1}\n${s} --> ${e}\n${text}`;
      });
      fs.writeFileSync(srtTempPath, `${srtBlocks.join('\n\n')}\n`, 'utf-8');
    } catch {
      srtTempPath = undefined;
    }
  }

  const buildFFmpegArgs = (includeSubtitlesFilter: boolean): string[] => {
    const args: string[] = ['-y'];

    if (visualClips.length > 0) {
      const primaryClip = visualClips[0];
      const clipFilePath = primaryClip.resolvedPath!;
      const spd = Math.max(0.25, Math.min(4.0, Number(primaryClip.speed) || 1));

      if (primaryClip.type === 'image') {
        args.push('-loop', '1', '-t', String(totalDuration), '-i', clipFilePath);
      } else {
        if (primaryClip.trimStart > 0) {
          args.push('-ss', String(primaryClip.trimStart));
        }
        args.push('-i', clipFilePath);
      }

      // Add external audio clip or silent audio bed as Input #1
      if (externalAudioClips.length > 0 && externalAudioClips[0].resolvedPath) {
        if (externalAudioClips[0].trimStart > 0) {
          args.push('-ss', String(externalAudioClips[0].trimStart));
        }
        args.push('-i', externalAudioClips[0].resolvedPath);
      } else {
        args.push(
          '-f',
          'lavfi',
          '-i',
          `anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration}`
        );
      }

      const vfChain: string[] = [
        `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
        `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
        'setsar=1',
        `fps=${fps}`,
      ];

      if (Math.abs(spd - 1.0) > 0.02 && primaryClip.type === 'video') {
        vfChain.push(`setpts=${(1 / spd).toFixed(4)}*PTS`);
      }

      const adj = primaryClip.adjustments;
      if (adj) {
        const b = (adj.brightness || 0) / 100;
        const c = 1 + (adj.contrast || 0) / 100;
        const s = Math.max(0, 1 + (adj.saturation || 0) / 100);
        if (b !== 0 || c !== 1 || s !== 1) {
          vfChain.push(`eq=brightness=${b.toFixed(2)}:contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)}`);
        }
        if (adj.sharpness && adj.sharpness > 0) {
          vfChain.push('unsharp=5:5:1.0:5:5:0.0');
        }
        if (adj.vignette && adj.vignette > 0) {
          vfChain.push('vignette=PI/4');
        }
      }

      if (primaryClip.flipH) vfChain.push('hflip');
      if (primaryClip.flipV) vfChain.push('vflip');
      if (primaryClip.rotation === 90) vfChain.push('transpose=1');
      if (primaryClip.rotation === 180) vfChain.push('transpose=1,transpose=1');
      if (primaryClip.rotation === 270) vfChain.push('transpose=2');

      if (primaryClip.effects?.includes('Blur') || primaryClip.effects?.includes('Gaussian Blur')) {
        vfChain.push('boxblur=5:1');
      }
      if (primaryClip.effects?.includes('Grayscale') || primaryClip.filterPreset === 'Black & White') {
        vfChain.push('hue=s=0');
      }
      if (primaryClip.filterPreset === 'Warm') {
        vfChain.push('colorbalance=rs=0.12:gs=0.04:bs=-0.10');
      } else if (primaryClip.filterPreset === 'Cold') {
        vfChain.push('colorbalance=rs=-0.10:gs=0.02:bs=0.14');
      } else if (primaryClip.filterPreset === 'Vintage') {
        vfChain.push('curves=vintage');
      }

      if (primaryClip.fadeIn > 0) {
        vfChain.push(`fade=t=in:st=0:d=${primaryClip.fadeIn}`);
      }
      if (primaryClip.fadeOut > 0 && totalDuration > primaryClip.fadeOut) {
        vfChain.push(`fade=t=out:st=${Math.max(0, totalDuration - primaryClip.fadeOut)}:d=${primaryClip.fadeOut}`);
      }

      if (includeSubtitlesFilter && srtTempPath && fs.existsSync(srtTempPath)) {
        const escapedSrt = srtTempPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
        vfChain.push(`subtitles='${escapedSrt}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=28'`);
      }

      args.push('-vf', vfChain.join(','));

      // Audio stream mapping: keep video's real audio unless muted or an external audio track is used
      if (primaryClip.type === 'video' && !primaryClip.muted && (primaryClip.volume ?? 100) > 0) {
        const volFactor = Math.max(0, Math.min(2, (primaryClip.volume ?? 100) / 100));
        args.push('-map', '0:v:0', '-map', '0:a?');
        if (Math.abs(volFactor - 1) > 0.02) {
          args.push('-af', `volume=${volFactor.toFixed(2)}`);
        }
      } else {
        args.push('-map', '0:v:0', '-map', '1:a:0');
      }
    } else {
      // Render dark slate canvas + audio when timeline contains text/captions/audio only
      args.push(
        '-f',
        'lavfi',
        '-i',
        `color=c=0x0f172a:s=${outW}x${outH}:r=${fps}:d=${totalDuration}`
      );
      if (externalAudioClips.length > 0 && externalAudioClips[0].resolvedPath) {
        args.push('-i', externalAudioClips[0].resolvedPath);
      } else {
        args.push(
          '-f',
          'lavfi',
          '-i',
          `anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration}`
        );
      }
      if (includeSubtitlesFilter && srtTempPath && fs.existsSync(srtTempPath)) {
        const escapedSrt = srtTempPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
        args.push('-vf', `subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'`);
      }
      args.push('-map', '0:v:0', '-map', '1:a:0');
    }

    // Codec configuration
    if (ext === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-b:v', targetBitrate, '-c:a', 'libopus');
    } else {
      const vCodec = payload.videoCodec === 'libx265' ? 'libx265' : 'libx264';
      args.push(
        '-c:v',
        vCodec,
        '-preset',
        'ultrafast',
        '-b:v',
        targetBitrate,
        '-pix_fmt',
        'yuv420p',
        '-max_muxing_queue_size',
        '1024'
      );
      if (payload.audioCodec === 'pcm_s16le' && ext === 'mov') {
        args.push('-c:a', 'pcm_s16le');
      } else {
        args.push('-c:a', 'aac', '-b:a', '192k');
      }
    }

    args.push('-t', String(totalDuration), '-shortest', outPath);
    return args;
  };

  const primaryArgs = buildFFmpegArgs(Boolean(srtTempPath));
  const commandStr = `ffmpeg ${primaryArgs.join(' ')}`;
  logFFmpeg('INFO', 'ExportStart', commandStr);

  const jobProgress: ExportJobProgress = {
    jobId,
    status: 'rendering',
    progress: 5,
    duration: totalDuration,
    commandUsed: commandStr,
  };

  const cleanupTempSrt = () => {
    if (srtTempPath && fs.existsSync(srtTempPath)) {
      try {
        fs.unlinkSync(srtTempPath);
      } catch {
        // ignore
      }
    }
  };

  const attachProcessHandlers = (childProc: ReturnType<typeof spawn>, allowFallback: boolean) => {
    activeExportJobs.set(jobId, { progress: jobProgress, process: childProc });
    let stderrLog = '';

    childProc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrLog += text;
      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch) {
        const hours = parseFloat(timeMatch[1]);
        const mins = parseFloat(timeMatch[2]);
        const secs = parseFloat(timeMatch[3]);
        const currentSec = hours * 3600 + mins * 60 + secs;
        const pct = Math.min(98, Math.max(8, Math.round((currentSec / totalDuration) * 100)));
        jobProgress.progress = pct;
      }
    });

    childProc.on('close', (code) => {
      if (jobProgress.status === 'cancelled') {
        cleanupTempSrt();
        return;
      }
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 256) {
        cleanupTempSrt();
        const stat = fs.statSync(outPath);
        jobProgress.status = 'completed';
        jobProgress.progress = 100;
        jobProgress.outputUrl = `/cache/exports/${outFilename}`;
        jobProgress.outputPath = outPath;
        jobProgress.fileSize = stat.size;
        logFFmpeg('INFO', 'ExportSuccess', `Export finished: ${outFilename} (${stat.size} bytes)`);
        logApp('INFO', 'Export', `Completed video export: ${outFilename}`);
      } else if (allowFallback) {
        // Retry without subtitle filter if libass/fontconfig wasn't available in container FFmpeg
        logFFmpeg('WARN', 'ExportFallback', 'Retrying FFmpeg export without subtitle filter');
        const fallbackArgs = buildFFmpegArgs(false);
        const retryChild = spawn('ffmpeg', fallbackArgs);
        attachProcessHandlers(retryChild, false);
      } else {
        cleanupTempSrt();
        jobProgress.status = 'failed';
        jobProgress.error = 'Export failed during FFmpeg encoding.';
        jobProgress.technicalDetails = stderrLog.slice(-1500);
        logFFmpeg('ERROR', 'ExportFailed', `Exit code ${code}`, stderrLog.slice(-1500));
        logApp('ERROR', 'Export', 'FFmpeg export failed', stderrLog.slice(-600));
      }
    });
  };

  const child = spawn('ffmpeg', primaryArgs);
  attachProcessHandlers(child, Boolean(srtTempPath));

  return jobProgress;
}
