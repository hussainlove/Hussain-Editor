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
  resolution: '720p' | '1080p' | '1440p' | '4k';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  fps: number;
  bitratePreset: 'low' | 'medium' | 'high' | 'custom';
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

export function startFFmpegExportJob(payload: ExportRequestPayload): ExportJobProgress {
  ensureDirectories();
  const jobId = `export_${Date.now()}`;
  const safeName = (payload.projectName || 'Hussain_Project')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40);
  const ext = payload.format || 'mp4';
  const outFilename = `${safeName}_${jobId}.${ext}`;
  const outPath = path.join(DIRS.exports, outFilename);

  const resMap: Record<string, { baseW: number; baseH: number }> = {
    '720p': { baseW: 1280, baseH: 720 },
    '1080p': { baseW: 1920, baseH: 1080 },
    '1440p': { baseW: 2560, baseH: 1440 },
    '4k': { baseW: 3840, baseH: 2160 },
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

  const totalDuration = Math.max(1, Math.min(300, payload.duration || 5));
  const fps = payload.fps || 30;

  const bitrateMap: Record<string, string> = {
    low: '2500k',
    medium: '6000k',
    high: '12000k',
    custom: `${payload.customBitrateMbps || 8}M`,
  };
  const targetBitrate = bitrateMap[payload.bitratePreset] || '6000k';

  // Find primary visual clips with real local files
  const visualClips = (payload.clips || [])
    .filter(
      (c) =>
        (c.type === 'video' || c.type === 'image') &&
        c.filePath &&
        fs.existsSync(c.filePath) &&
        !c.muted
    )
    .sort((a, b) => a.startTime - b.startTime);

  const audioClips = (payload.clips || [])
    .filter(
      (c) =>
        (c.type === 'audio' || c.type === 'video') &&
        c.filePath &&
        fs.existsSync(c.filePath) &&
        !c.muted &&
        c.volume > 0
    )
    .sort((a, b) => a.startTime - b.startTime);

  let ffmpegArgs: string[] = ['-y'];

  if (visualClips.length > 0) {
    const primaryClip = visualClips[0];
    if (primaryClip.type === 'image') {
      ffmpegArgs.push('-loop', '1', '-t', String(totalDuration), '-i', primaryClip.filePath!);
    } else {
      if (primaryClip.trimStart > 0) {
        ffmpegArgs.push('-ss', String(primaryClip.trimStart));
      }
      ffmpegArgs.push('-i', primaryClip.filePath!);
    }

    // Add background colour canvas or secondary audio if needed
    ffmpegArgs.push(
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration}`
    );

    const vfChain: string[] = [
      `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
      `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
      `fps=${fps}`,
    ];

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

    ffmpegArgs.push('-vf', vfChain.join(','));
  } else {
    // Render dark slate canvas + audio or test tone when timeline contains text/shapes/audio only
    ffmpegArgs.push(
      '-f',
      'lavfi',
      '-i',
      `color=c=0x0f172a:s=${outW}x${outH}:r=${fps}:d=${totalDuration}`
    );
    if (audioClips.length > 0 && audioClips[0].filePath) {
      ffmpegArgs.push('-i', audioClips[0].filePath);
    } else {
      ffmpegArgs.push(
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:sample_rate=44100:duration=${totalDuration}`
      );
    }
  }

  // Codec configuration
  if (ext === 'webm') {
    ffmpegArgs.push('-c:v', 'libvpx-vp9', '-b:v', targetBitrate, '-c:a', 'libopus');
  } else {
    const vCodec = payload.videoCodec === 'libx265' ? 'libx265' : 'libx264';
    ffmpegArgs.push(
      '-c:v',
      vCodec,
      '-preset',
      'ultrafast',
      '-b:v',
      targetBitrate,
      '-pix_fmt',
      'yuv420p'
    );
    if (payload.audioCodec === 'pcm_s16le' && ext === 'mov') {
      ffmpegArgs.push('-c:a', 'pcm_s16le');
    } else {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
    }
  }

  ffmpegArgs.push('-t', String(totalDuration), '-shortest', outPath);

  const commandStr = `ffmpeg ${ffmpegArgs.join(' ')}`;
  logFFmpeg('INFO', 'ExportStart', commandStr);

  const jobProgress: ExportJobProgress = {
    jobId,
    status: 'rendering',
    progress: 5,
    duration: totalDuration,
    commandUsed: commandStr,
  };

  const child = spawn('ffmpeg', ffmpegArgs);
  activeExportJobs.set(jobId, { progress: jobProgress, process: child });

  let stderrLog = '';

  child.stderr.on('data', (chunk: Buffer) => {
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

  child.on('close', (code) => {
    if (jobProgress.status === 'cancelled') {
      return;
    }
    if (code === 0 && fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath);
      jobProgress.status = 'completed';
      jobProgress.progress = 100;
      jobProgress.outputUrl = `/cache/exports/${outFilename}`;
      jobProgress.outputPath = outPath;
      jobProgress.fileSize = stat.size;
      logFFmpeg('INFO', 'ExportSuccess', `Export finished: ${outFilename} (${stat.size} bytes)`);
      logApp('INFO', 'Export', `Completed video export: ${outFilename}`);
    } else {
      jobProgress.status = 'failed';
      jobProgress.error = 'Export failed during FFmpeg encoding.';
      jobProgress.technicalDetails = stderrLog.slice(-1500);
      logFFmpeg('ERROR', 'ExportFailed', `Exit code ${code}`, stderrLog.slice(-1500));
      logApp('ERROR', 'Export', 'FFmpeg export failed', stderrLog.slice(-600));
    }
  });

  return jobProgress;
}
