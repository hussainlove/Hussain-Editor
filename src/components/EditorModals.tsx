import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FolderOpen,
  Settings,
  AlertCircle,
  CheckCircle2,
  Copy,
  HardDrive,
  Cpu,
  Keyboard,
  FileVideo,
  Package,
  Sparkles,
} from 'lucide-react';
import { AspectRatioOption, ProjectData } from '../types/editor';
import { formatBytes } from '../utils/editorMath';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectData;
  totalDuration: number;
}

const SOCIAL_PRESETS = [
  { id: 'yt-1080', label: 'YouTube 1080p Full HD', format: 'mp4', codec: 'libx264', res: '1080p', fps: 30, ar: '16:9' },
  { id: 'yt-4k', label: 'YouTube 4K Ultra 60fps', format: 'mp4', codec: 'libx265', res: '4k', fps: 60, ar: '16:9' },
  { id: 'cinema-8k', label: 'Cinema Master 8K UHD', format: 'mp4', codec: 'libx265', res: '8k', fps: 60, ar: '16:9' },
  { id: 'gaming-120', label: 'Pro 1440p 120fps', format: 'mp4', codec: 'libx264', res: '1440p', fps: 120, ar: '16:9' },
  { id: 'shorts', label: 'YouTube Shorts (9:16)', format: 'mp4', codec: 'libx264', res: '1080p', fps: 60, ar: '9:16' },
  { id: 'tiktok', label: 'TikTok Vertical', format: 'mp4', codec: 'libx264', res: '1080p', fps: 30, ar: '9:16' },
  { id: 'ig-reels', label: 'Instagram Reels / Feed', format: 'mp4', codec: 'libx264', res: '1080p', fps: 30, ar: '4:5' },
  { id: 'webm-vp9', label: 'WebM VP9 Archive', format: 'webm', codec: 'libvpx-vp9', res: '1080p', fps: 30, ar: '16:9' },
];

function formatSrtTimestamp(sec: number, vtt = false): string {
  const safe = Math.max(0, sec);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  const sep = vtt ? '.' : ',';
  return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}${sep}${pad3(ms)}`;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  totalDuration,
}) => {
  const [selectedPreset, setSelectedPreset] = useState('yt-1080');
  const [format, setFormat] = useState<'mp4' | 'mov' | 'webm'>('mp4');
  const [videoCodec, setVideoCodec] = useState<'libx264' | 'libx265' | 'libvpx-vp9'>('libx264');
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p' | '1440p' | '4k' | '8k'>('1080p');
  const [fps, setFps] = useState<number>(project.fps || 30);
  const [bitratePreset, setBitratePreset] = useState<'low' | 'medium' | 'high' | 'ultra' | 'custom'>('high');
  const [customBitrateMbps, setCustomBitrateMbps] = useState(25);
  const [audioCodec, setAudioCodec] = useState<'aac' | 'pcm_s16le'>('aac');
  const [outputDirectory, setOutputDirectory] = useState('C:\\Users\\User\\Videos\\HussainExports\\');

  const downloadCaptionsFile = (type: 'srt' | 'vtt') => {
    const captionClips = project.clips
      .filter((c) => c.type === 'caption' || c.type === 'text')
      .sort((a, b) => a.startTime - b.startTime);

    const blocks = (
      captionClips.length > 0
        ? captionClips
        : [{ startTime: 0, duration: Math.min(4, totalDuration), textContent: project.name, name: project.name }]
    ).map((c, idx) => {
      const start = formatSrtTimestamp(c.startTime, type === 'vtt');
      const end = formatSrtTimestamp(c.startTime + c.duration, type === 'vtt');
      const text = (c.textContent || c.name || '').replace(/\|/g, '\n');
      return `${idx + 1}\n${start} --> ${end}\n${text}`;
    });

    const content = type === 'vtt' ? `WEBVTT\n\n${blocks.join('\n\n')}\n` : `${blocks.join('\n\n')}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_captions.${type}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [jobState, setJobState] = useState<{
    jobId: string;
    status: 'rendering' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    outputUrl?: string;
    outputPath?: string;
    fileSize?: number;
    error?: string;
    technicalDetails?: string;
  } | null>(null);
  const browserCancelRef = React.useRef(false);

  const runBrowserCanvasExport = async () => {
    browserCancelRef.current = false;
    const localJobId = `browser_render_${Date.now()}`;
    setJobState({
      jobId: localJobId,
      status: 'rendering',
      progress: 6,
    });

    try {
      const resDims: Record<string, { w: number; h: number }> = {
        '480p': { w: 854, h: 480 },
        '720p': { w: 1280, h: 720 },
        '1080p': { w: 1920, h: 1080 },
        '1440p': { w: 1920, h: 1080 },
        '4k': { w: 1920, h: 1080 },
        '8k': { w: 1920, h: 1080 },
      };
      const base = resDims[resolution] || resDims['1080p'];
      let canvasW = base.w;
      let canvasH = base.h;
      if (project.aspectRatio === '9:16') {
        canvasW = base.h;
        canvasH = base.w;
      } else if (project.aspectRatio === '1:1') {
        canvasW = base.h;
        canvasH = base.h;
      } else if (project.aspectRatio === '4:5') {
        canvasW = Math.round((base.h * 4) / 5 / 2) * 2;
        canvasH = base.h;
      }

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      const visualClips = project.clips
        .filter((c) => (c.type === 'video' || c.type === 'image') && c.url)
        .sort((a, b) => a.startTime - b.startTime);

      const captionClips = project.clips
        .filter((c) => (c.type === 'caption' || c.type === 'text') && (c.textContent || c.name))
        .sort((a, b) => a.startTime - b.startTime);

      // Preload all unique video and image sources on the timeline
      const videoMap: Record<string, HTMLVideoElement> = {};
      const imageMap: Record<string, HTMLImageElement> = {};

      await Promise.all(
        visualClips.map(async (vc) => {
          if (vc.type === 'video' && vc.url) {
            const vid = document.createElement('video');
            vid.playsInline = true;
            vid.preload = 'auto';
            vid.muted = Boolean(vc.muted);
            vid.src = vc.url;
            await new Promise<void>((resolve) => {
              const t = window.setTimeout(resolve, 4000);
              vid.onloadeddata = () => {
                window.clearTimeout(t);
                try {
                  vid.currentTime = Math.max(0.001, vc.trimStart || 0);
                } catch {
                  // ignore
                }
                resolve();
              };
              vid.onerror = () => {
                window.clearTimeout(t);
                resolve();
              };
            });
            videoMap[vc.id] = vid;
          } else if (vc.type === 'image' && vc.url) {
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                imageMap[vc.id] = img;
                resolve();
              };
              img.onerror = () => resolve();
              img.src = vc.url!;
            });
          }
        })
      );

      const stream = (canvas as any).captureStream
        ? (canvas as any).captureStream(Math.min(60, fps || 30))
        : null;
      if (!stream) throw new Error('Canvas stream capture not supported');

      let audioCtx: AudioContext | null = null;
      const primaryVisual = visualClips.find((v) => v.type === 'video' && !v.muted);
      const primaryVidEl = primaryVisual ? videoMap[primaryVisual.id] : null;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (primaryVidEl && AudioContextClass && primaryVisual && !primaryVisual.muted) {
        try {
          audioCtx = new AudioContextClass();
          await audioCtx.resume().catch(() => {});
          const srcNode = audioCtx.createMediaElementSource(primaryVidEl);
          const destNode = audioCtx.createMediaStreamDestination();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = Math.max(0, Math.min(2, (primaryVisual.volume ?? 100) / 100));
          srcNode.connect(gainNode);
          gainNode.connect(destNode);
          const silentOut = audioCtx.createGain();
          silentOut.gain.value = 0.0001;
          srcNode.connect(silentOut);
          silentOut.connect(audioCtx.destination);
          destNode.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
        } catch {
          // continue with video stream if audio routing is restricted
        }
      }

      const mimeCandidates = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const chosenMime =
        mimeCandidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';

      const targetBps = Math.round(estimatedMbps * 1000 * 1000);
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: targetBps })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.start(150);
      const durationToRender = Math.max(1, totalDuration);
      const stepSec = 1 / Math.min(30, fps || 30);
      const totalSteps = Math.max(12, Math.min(900, Math.ceil(durationToRender / stepSec)));
      const dt = durationToRender / totalSteps;

      for (let stepIdx = 0; stepIdx <= totalSteps; stepIdx++) {
        if (browserCancelRef.current) break;
        const simTimelineSec = Math.min(durationToRender, stepIdx * dt);

        ctx.fillStyle = '#090D16';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Render all active visual clips at simTimelineSec in track order
        const activeVisualsNow = visualClips.filter(
          (vc) => simTimelineSec >= vc.startTime && simTimelineSec <= vc.startTime + vc.duration
        );

        for (const vc of activeVisualsNow) {
          if (vc.type === 'video') {
            const vid = videoMap[vc.id];
            if (vid && vid.readyState >= 1) {
              const targetT = Math.max(0.001, (vc.trimStart || 0) + (simTimelineSec - vc.startTime) * (vc.speed || 1));
              if (Math.abs(vid.currentTime - targetT) > 0.035) {
                try {
                  vid.currentTime = targetT;
                  await new Promise<void>((res) => {
                    const timer = window.setTimeout(res, 45);
                    vid.onseeked = () => {
                      window.clearTimeout(timer);
                      res();
                    };
                  });
                } catch {
                  // ignore
                }
              }
              if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                const scale =
                  Math.min(canvasW / vid.videoWidth, canvasH / vid.videoHeight) * ((vc.scaleX || 100) / 100);
                const dw = vid.videoWidth * scale;
                const dh = vid.videoHeight * scale;
                const dx = (canvasW - dw) / 2 + (vc.positionX || 0);
                const dy = (canvasH - dh) / 2 + (vc.positionY || 0);
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, (vc.opacity ?? 100) / 100));
                ctx.drawImage(vid, dx, dy, dw, dh);
                ctx.restore();
              }
            }
          } else if (vc.type === 'image') {
            const img = imageMap[vc.id];
            if (img && img.naturalWidth > 0) {
              const scale =
                Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight) * ((vc.scaleX || 100) / 100);
              const dw = img.naturalWidth * scale;
              const dh = img.naturalHeight * scale;
              const dx = (canvasW - dw) / 2 + (vc.positionX || 0);
              const dy = (canvasH - dh) / 2 + (vc.positionY || 0);
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, (vc.opacity ?? 100) / 100));
              ctx.drawImage(img, dx, dy, dw, dh);
              ctx.restore();
            }
          }
        }

        // Draw active captions & text overlays with Word-by-Word Yellow & Green Voice Sync
        const activeCaps = captionClips.filter(
          (c) => simTimelineSec >= c.startTime && simTimelineSec <= c.startTime + c.duration
        );
        for (const cap of activeCaps) {
          const st = cap.textStyle;
          const fontSize = Math.max(20, Math.round((st?.fontSize || 42) * (canvasH / 720)));
          const fontFam = st?.fontFamily || 'Plus Jakarta Sans';
          ctx.save();
          ctx.font = `800 ${fontSize}px "${fontFam}", sans-serif`;
          ctx.textBaseline = 'middle';

          const rawText = String(cap.textContent || cap.name || '');
          const allWords = rawText.split(/\s+/).filter(Boolean);
          if (allWords.length === 0) {
            ctx.restore();
            continue;
          }

          const clipProg = Math.max(
            0,
            Math.min(0.9999, (simTimelineSec - cap.startTime) / Math.max(0.1, cap.duration))
          );
          const activeWordIndex = Math.min(
            Math.max(0, allWords.length - 1),
            Math.floor(clipProg * allWords.length)
          );

          const rawLines = rawText.split(/\n|\|/).map((l) => l.trim()).filter(Boolean);
          const lines =
            rawLines.length > 1
              ? rawLines
              : st?.captionPreset?.includes('Multiline') && allWords.length > 2
              ? [
                  allWords.slice(0, Math.ceil(allWords.length / 2)).join(' '),
                  allWords.slice(Math.ceil(allWords.length / 2)).join(' '),
                ]
              : [rawText];

          const yCenter = canvasH * 0.82 + ((cap.positionY || 0) * (canvasH / 500));
          const lineStep = fontSize * 1.32;
          let globalWIdx = 0;

          lines.forEach((line, lIdx) => {
            const lineWords = line.split(/\s+/).filter(Boolean);
            const ly = yCenter + (lIdx - (lines.length - 1) / 2) * lineStep;
            const spaceW = ctx.measureText(' ').width * 1.15;
            const wordWidths = lineWords.map((w) => ctx.measureText(w).width);
            const totalLineW =
              wordWidths.reduce((a, b) => a + b, 0) + Math.max(0, lineWords.length - 1) * spaceW;

            const pad = st?.padding ?? 12;
            if ((st?.backgroundOpacity ?? 75) > 0) {
              ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
              ctx.fillRect(
                canvasW / 2 - totalLineW / 2 - pad,
                ly - fontSize / 2 - pad * 0.45,
                totalLineW + pad * 2,
                fontSize + pad * 0.9
              );
            }

            let curX = canvasW / 2 - totalLineW / 2;
            lineWords.forEach((w, idxInLine) => {
              const gIdx = globalWIdx++;
              const isSpoken = gIdx === activeWordIndex;
              const wOvr = st?.wordStyles?.[gIdx];
              const ww = wordWidths[idxInLine];

              let spokenCol =
                st?.activeWordColor ||
                (st?.captionPreset?.includes('Green') ? '#22C55E' : '#FACC15');
              if (st?.captionPreset === 'YellowGreenMultiline') {
                spokenCol = lIdx % 2 === 0 ? '#FACC15' : '#22C55E';
              } else if (st?.captionPreset === 'SingleWordYellowGreen') {
                spokenCol = gIdx % 2 === 0 ? '#FACC15' : '#22C55E';
              }

              const fillCol = isSpoken ? spokenCol : wOvr?.color || st?.color || '#FFFFFF';
              const pillBg = isSpoken
                ? st?.activeWordBgColor && st?.activeWordBgColor !== 'transparent'
                  ? st.activeWordBgColor
                  : st?.captionPreset === 'YellowBoxSync'
                  ? '#FACC15'
                  : st?.captionPreset === 'GreenBoxSync'
                  ? '#22C55E'
                  : undefined
                : wOvr?.bgColor;

              if (pillBg && pillBg !== 'transparent') {
                ctx.fillStyle = pillBg;
                ctx.fillRect(curX - 4, ly - fontSize * 0.55, ww + 8, fontSize * 1.1);
              }

              ctx.textAlign = 'left';
              if ((st?.strokeWidth ?? 2) > 0) {
                ctx.lineWidth = Math.max(2, (st?.strokeWidth || 2) * 1.4);
                ctx.strokeStyle = wOvr?.strokeColor || st?.strokeColor || '#000000';
                ctx.strokeText(w, curX, ly);
              }
              ctx.fillStyle = fillCol;
              ctx.fillText(w, curX, ly);
              curX += ww + spaceW;
            });
          });
          ctx.restore();
        }

        const pct = Math.min(98, Math.max(8, Math.round((stepIdx / totalSteps) * 100)));
        setJobState((prev) => (prev && prev.status === 'rendering' ? { ...prev, progress: pct } : prev));
        await new Promise((r) => window.setTimeout(r, 15));
      }

      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }

      await new Promise<void>((resolve) => {
        if (recorder.state === 'inactive') {
          resolve();
          return;
        }
        recorder.onstop = () => resolve();
      });

      Object.values(videoMap).forEach((v) => {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch {
          // ignore
        }
      });
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }

      if (browserCancelRef.current) {
        setJobState((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
        return;
      }

      const finalBlob = new Blob(chunks, { type: chosenMime || 'video/webm' });
      const blobUrl = URL.createObjectURL(finalBlob);
      setJobState({
        jobId: localJobId,
        status: 'completed',
        progress: 100,
        outputUrl: blobUrl,
        fileSize: finalBlob.size,
      });
    } catch (err: any) {
      setJobState({
        jobId: localJobId,
        status: 'failed',
        progress: 0,
        error: err?.message || 'Video render failed',
      });
    }
  };

  useEffect(() => {
    if (!jobState || jobState.status !== 'rendering') return;
    if (jobState.jobId.startsWith('browser_render_') || jobState.jobId === 'syncing') return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/export/status/${jobState.jobId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.job?.status === 'failed') {
            window.clearInterval(timer);
            runBrowserCanvasExport();
            return;
          }
          setJobState(data.job);
        }
      } catch {
        // ignore poll error
      }
    }, 600);
    return () => window.clearInterval(timer);
  }, [jobState]);

  if (!isOpen) return null;

  const estimatedMbps =
    bitratePreset === 'low'
      ? 2.5
      : bitratePreset === 'medium'
      ? 6
      : bitratePreset === 'high'
      ? 14
      : bitratePreset === 'ultra'
      ? 35
      : customBitrateMbps;
  const estimatedSizeBytes = Math.round(((estimatedMbps * 1024 * 1024) / 8) * Math.max(1, totalDuration));

  const startExport = async () => {
    try {
      setJobState({
        jobId: 'syncing',
        status: 'rendering',
        progress: 4,
      });

      // If the project has multiple video cuts or custom word-by-word Yellow/Green voice-synced captions,
      // check if any clips are browser blobs and sync them, or use the WYSIWYG Browser Canvas Renderer
      const syncedPathsByClipId: Record<string, string> = {};
      let hasUnsyncedBrowserVideo = false;
      const visualClipsCount = project.clips.filter((c) => c.type === 'video' || c.type === 'image').length;
      const hasVoiceSyncWordStyles = project.clips.some(
        (c) =>
          (c.type === 'caption' || c.type === 'text') &&
          (c.textStyle?.captionPreset?.includes('Yellow') ||
            c.textStyle?.captionPreset?.includes('Green') ||
            (c.textStyle?.wordStyles && Object.keys(c.textStyle.wordStyles).length > 0))
      );

      for (const clip of project.clips) {
        if ((clip.type === 'video' || clip.type === 'audio' || clip.type === 'image') && clip.url?.startsWith('blob:')) {
          const isMissingServerPath = !clip.filePath || !clip.filePath.startsWith('/');
          if (isMissingServerPath) {
            try {
              const blobRes = await fetch(clip.url);
              if (blobRes.ok) {
                const blob = await blobRes.blob();
                if (blob.size <= 120 * 1024 * 1024) {
                  const formData = new FormData();
                  formData.append('files', blob, clip.name || 'timeline_clip.mp4');
                  const upRes = await fetch('/api/media/import', {
                    method: 'POST',
                    body: formData,
                  });
                  if (upRes.ok) {
                    const upData = await upRes.json();
                    const importedMeta = upData.imported?.[0];
                    if (importedMeta?.filePath) {
                      syncedPathsByClipId[clip.id] = importedMeta.filePath;
                    } else {
                      hasUnsyncedBrowserVideo = true;
                    }
                  } else {
                    hasUnsyncedBrowserVideo = true;
                  }
                } else {
                  hasUnsyncedBrowserVideo = true;
                }
              }
            } catch {
              hasUnsyncedBrowserVideo = true;
            }
          }
        }
      }

      // Use the WYSIWYG Browser Hardware Canvas Renderer if media is a browser blob, or if multiple cuts / word-by-word Yellow/Green voice sync are used
      if (hasUnsyncedBrowserVideo || visualClipsCount > 1 || hasVoiceSyncWordStyles) {
        await runBrowserCanvasExport();
        return;
      }

      const res = await fetch('/api/export/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          format,
          videoCodec,
          resolution,
          aspectRatio: project.aspectRatio,
          fps,
          bitratePreset,
          customBitrateMbps,
          audioCodec,
          duration: totalDuration,
          clips: project.clips.map((c) => {
            const tr = project.tracks.find((t) => t.id === c.trackId);
            return {
              ...c,
              filePath: syncedPathsByClipId[c.id] || c.filePath,
              trackType: tr?.type || 'video',
            };
          }),
        }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJobState(data.job);
      } else {
        await runBrowserCanvasExport();
      }
    } catch {
      await runBrowserCanvasExport();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0F172A] border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileVideo className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Export Video (FFmpeg Render Engine)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-12 gap-5">
          {/* Left Column: Social Presets */}
          <div className="col-span-5 border-r border-slate-800 pr-4 space-y-2">
            <p className="text-xs font-semibold text-slate-300">Social & Broadcast Presets</p>
            {SOCIAL_PRESETS.map((pr) => (
              <button
                key={pr.id}
                onClick={() => {
                  setSelectedPreset(pr.id);
                  setFormat(pr.format as any);
                  setVideoCodec(pr.codec as any);
                  setResolution(pr.res as any);
                  setFps(pr.fps);
                }}
                className={`w-full p-2.5 rounded border text-left transition-colors ${
                  selectedPreset === pr.id
                    ? 'bg-sky-500/15 border-sky-500 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <p className="text-xs font-semibold">{pr.label}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {pr.format.toUpperCase()} · {pr.res} · {pr.fps}fps
                </p>
              </button>
            ))}

            {/* Direct Windows Installer SDK Download Card */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <a
                href="/api/installer/bundle"
                download="HussainVideoEditor-Windows-Installer-SDK.zip"
                className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded flex items-center justify-center gap-2 text-xs text-amber-300 font-medium transition-colors"
              >
                <Package className="w-3.5 h-3.5" />
                Download Windows Setup SDK (.iss + PyInstaller)
              </a>
            </div>
          </div>

          {/* Right Column: Encoder Parameters */}
          <div className="col-span-7 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400">Container Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="mp4">MP4 (.mp4)</option>
                  <option value="mov">QuickTime MOV (.mov)</option>
                  <option value="webm">WebM (.webm)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Video Codec</label>
                <select
                  value={videoCodec}
                  onChange={(e) => setVideoCodec(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="libx264">H.264 (AVC)</option>
                  <option value="libx265">H.265 (HEVC)</option>
                  <option value="libvpx-vp9">VP9</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400">Resolution (Limitless)</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="480p">480p SD (854x480)</option>
                  <option value="720p">720p HD (1280x720)</option>
                  <option value="1080p">1080p Full HD (1920x1080)</option>
                  <option value="1440p">1440p QHD (2560x1440)</option>
                  <option value="4k">4K UHD (3840x2160)</option>
                  <option value="8k">8K Ultra UHD (7680x4320)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Frame Rate (FPS)</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 mt-1"
                >
                  {[24, 25, 30, 50, 60, 120, 240].map((f) => (
                    <option key={f} value={f}>
                      {f} FPS
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400">Bitrate Quality</label>
                <select
                  value={bitratePreset}
                  onChange={(e) => setBitratePreset(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="low">Low (2.5 Mbps)</option>
                  <option value="medium">Medium (6 Mbps)</option>
                  <option value="high">High (14 Mbps)</option>
                  <option value="ultra">Ultra Master (35 Mbps)</option>
                  <option value="custom">Custom Limitless Bitrate</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Audio Codec</label>
                <select
                  value={audioCodec}
                  onChange={(e) => setAudioCodec(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="aac">AAC Stereo 320kbps</option>
                  <option value="pcm_s16le">Uncompressed WAV PCM</option>
                </select>
              </div>
            </div>

            {bitratePreset === 'custom' && (
              <div>
                <label className="text-[11px] text-slate-400">Custom Bitrate (1 - 500 Mbps)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={customBitrateMbps}
                  onChange={(e) => setCustomBitrateMbps(Number(e.target.value) || 25)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 mt-1"
                />
              </div>
            )}

            {/* Direct Subtitle / Caption Export Row (.SRT & .VTT) */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded p-2.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-amber-200 font-medium">
                Captions Track ({project.clips.filter((c) => c.type === 'caption' || c.type === 'text').length} segments)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => downloadCaptionsFile('srt')}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded text-[10px] font-semibold transition-colors"
                >
                  Download .SRT
                </button>
                <button
                  type="button"
                  onClick={() => downloadCaptionsFile('vtt')}
                  className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-400 text-sky-300 hover:text-slate-950 border border-sky-500/40 rounded text-[10px] font-semibold transition-colors"
                >
                  Download .VTT
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400">Local Output Destination Path</label>
              <input
                type="text"
                value={outputDirectory}
                onChange={(e) => setOutputDirectory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-300 mt-1"
              />
            </div>

            {/* Estimates Box */}
            <div className="bg-slate-900 border border-slate-800 rounded p-3 flex items-center justify-between text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-400 block text-[10px]">ESTIMATED DURATION</span>
                <span className="text-slate-200">{totalDuration.toFixed(1)}s</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ESTIMATED FILE SIZE</span>
                <span className="text-sky-400">{formatBytes(estimatedSizeBytes)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ASPECT RATIO</span>
                <span className="text-slate-200">{project.aspectRatio}</span>
              </div>
            </div>

            {/* Active Render Progress or Actions */}
            {jobState && jobState.status === 'rendering' && (
              <div className="bg-slate-900 border border-sky-500/40 rounded p-3 space-y-2">
                <div className="flex justify-between text-xs font-mono tabular-nums">
                  <span className="text-sky-400">Rendering {jobState.progress}%</span>
                  <button
                    onClick={async () => {
                      browserCancelRef.current = true;
                      if (!jobState.jobId.startsWith('browser_render_') && jobState.jobId !== 'syncing') {
                        await fetch(`/api/export/cancel/${jobState.jobId}`, { method: 'POST' }).catch(() => {});
                      }
                      setJobState({ ...jobState, status: 'cancelled' });
                    }}
                    className="text-rose-400 hover:underline text-[11px]"
                  >
                    Cancel Render
                  </button>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded overflow-hidden">
                  <div
                    style={{ width: `${jobState.progress}%` }}
                    className="h-full bg-sky-500 transition-all duration-200"
                  />
                </div>
              </div>
            )}

            {jobState && jobState.status === 'completed' && (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Export Completed ({formatBytes(jobState.fileSize || 0)})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={jobState.outputUrl}
                    download={`${project.name}.${format}`}
                    className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-xs flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save Rendered Video
                  </a>
                  <a
                    href={jobState.outputUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
                  >
                    Open Video
                  </a>
                </div>
              </div>
            )}

            {jobState && jobState.status === 'failed' && (
              <div className="bg-rose-950/40 border border-rose-500/40 rounded p-3 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                  <AlertCircle className="w-4 h-4" />
                  <span>{jobState.error || 'Export failed.'}</span>
                </div>
                {jobState.technicalDetails && (
                  <pre className="bg-black/60 p-2 rounded text-[10px] font-mono text-rose-200 max-h-24 overflow-auto">
                    {jobState.technicalDetails}
                  </pre>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium"
              >
                Close
              </button>
              <button
                onClick={startExport}
                disabled={jobState?.status === 'rendering'}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold rounded text-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export Final Video
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoSaveIntervalSec: number;
  setAutoSaveIntervalSec: (s: number) => void;
  initialTab?: 'General' | 'Installer (.EXE)' | 'Performance' | 'Cache' | 'Shortcuts' | 'Logs';
  onTriggerFolderAutoSync?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  autoSaveIntervalSec,
  setAutoSaveIntervalSec,
  initialTab = 'Installer (.EXE)',
  onTriggerFolderAutoSync,
}) => {
  const [activeTab, setActiveTab] = useState<'General' | 'Installer (.EXE)' | 'Performance' | 'Cache' | 'Shortcuts' | 'Logs'>(initialTab);
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [logsText, setLogsText] = useState('');
  const [logType, setLogType] = useState<'app' | 'ffmpeg'>('app');
  const [folderSyncStatus, setFolderSyncStatus] = useState<string>('');

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchDiagnostics = async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        fetch('/api/system/info'),
        fetch(`/api/logs?type=${logType}`),
      ]);
      if (sRes.ok) setSysInfo(await sRes.json());
      if (lRes.ok) {
        const lData = await lRes.json();
        setLogsText(lData.logs || '');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) fetchDiagnostics();
  }, [isOpen, logType]);

  if (!isOpen) return null;

  const handleClearCache = async () => {
    const res = await fetch('/api/cache/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeUploads: false }),
    });
    if (res.ok) fetchDiagnostics();
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0F172A] border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Application Settings, .EXE Setup & Auto-Import</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex h-[420px]">
          {/* Left Settings Tabs */}
          <div className="w-44 bg-[#090D16] border-r border-slate-800 p-2 space-y-1">
            {(['General', 'Installer (.EXE)', 'Performance', 'Cache', 'Shortcuts', 'Logs'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full px-3 py-2 rounded text-xs font-medium text-left transition-colors ${
                  activeTab === tab ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Right Settings Content */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
            {activeTab === 'General' && (
              <div className="space-y-4">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Auto-Save & Crash Recovery Interval</label>
                  <select
                    value={autoSaveIntervalSec}
                    onChange={(e) => setAutoSaveIntervalSec(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  >
                    <option value={15}>Every 15 seconds</option>
                    <option value={30}>Every 30 seconds (Default)</option>
                    <option value={60}>Every 60 seconds</option>
                  </select>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-1">
                  <p className="font-semibold text-slate-200">Privacy & Local Security Guarantee</p>
                  <p className="text-slate-400 text-[11px]">
                    Hussain Video Editor operates 100% locally. Media files, voiceovers, and project data never leave your machine and zero hidden telemetry is collected.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'Installer (.EXE)' && (
              <div className="space-y-3.5">
                <div className="bg-slate-900 border border-amber-500/40 rounded-md p-3.5 space-y-2.5">
                  <div>
                    <p className="font-semibold text-slate-100 text-xs">
                      1. Auto-Import & Images + Voiceover Timeline Sync (<code className="text-amber-400">auto_import.bat</code>)
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Double-click <code className="text-amber-300">auto_import.bat</code> to open CMD, enter or browse a folder containing your <span className="text-slate-200">Images + Voiceover</span>, and automatically sync all images across the exact Voiceover length on the Timeline!
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/api/automation/download-bat"
                      download="auto_import.bat"
                      className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download auto_import.bat
                    </a>
                    {onTriggerFolderAutoSync && (
                      <button
                        onClick={() => {
                          onClose();
                          onTriggerFolderAutoSync();
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-xs transition-colors"
                      >
                        Select Folder Now (Auto-Sync Images + VO)
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setFolderSyncStatus('Scanning auto_import\\ folder...');
                        const res = await fetch('/api/automation/scan-folder', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ autoTimeline: true, autoSyncVoiceover: true }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setFolderSyncStatus(
                            data.importedCount > 0
                              ? `Synced ${data.importedCount} file(s) onto Timeline!`
                              : 'No new files in auto_import\\ folder yet.'
                          );
                        }
                      }}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-medium rounded text-xs transition-colors"
                    >
                      Scan auto_import\
                    </button>
                  </div>
                  {folderSyncStatus && (
                    <p className="text-[11px] text-emerald-400 font-medium">{folderSyncStatus}</p>
                  )}
                </div>

                <div className="bg-slate-900 border border-sky-500/40 rounded-md p-3.5 space-y-2.5">
                  <div>
                    <p className="font-semibold text-slate-100 text-xs">
                      2. Complete Windows 10/11 .EXE Setup Package (<code className="text-sky-400">HussainVideoEditor-Setup.exe</code>)
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Includes the <span className="text-slate-200 font-medium">entire app source + native Windows .NET C# compiler scripts</span> (<code className="text-emerald-300">HussainLauncher.cs</code> & <code className="text-emerald-300">HussainSetupWizard.cs</code>) so <code className="text-sky-300">build_windows_installer.bat</code> builds <code className="text-emerald-400">HussainVideoEditor.exe</code> and <code className="text-emerald-400">HussainVideoEditor-Setup.exe</code> on any Windows PC—even without Python or Inno Setup!
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/api/installer/bundle"
                      download="HussainVideoEditor-Windows-Installer-SDK.zip"
                      className="flex-1 py-2 px-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Complete Windows .EXE Setup Bundle (.ZIP)
                    </a>
                    <a
                      href="/api/installer/download-builder-bat"
                      download="build_windows_installer.bat"
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 font-medium rounded text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      build_windows_installer.bat
                    </a>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-md p-3.5 space-y-2">
                  <p className="font-semibold text-slate-200 text-xs">How to Build & Install .EXE on Windows (Fixed & Zero-Dependency):</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                    <li>
                      <span className="font-semibold text-sky-400">Extract the Complete Bundle:</span> Click <span className="text-slate-100">Download Complete Windows .EXE Setup Bundle (.ZIP)</span> above and extract it to a folder on your Windows 10/11 PC.
                    </li>
                    <li>
                      <span className="font-semibold text-sky-400">Double-Click Builder:</span> Double-click <code className="text-emerald-400">build_windows_installer.bat</code> (in the root or <code className="text-emerald-400">installer\</code> folder).
                    </li>
                    <li>
                      <span className="font-semibold text-sky-400">Automatic Native Compilation:</span> It uses Windows' built-in <code className="text-amber-300">csc.exe</code> (.NET Framework) or Inno Setup 6 to immediately generate:
                      <ul className="list-disc list-inside pl-4 mt-1 text-slate-400 space-y-0.5 font-mono text-[10px]">
                        <li>Standalone App: <span className="text-slate-200">HussainVideoEditor.exe</span></li>
                        <li>Setup Installer: <span className="text-emerald-400">installer\dist_installer\HussainVideoEditor-Setup.exe</span></li>
                        <li>Auto-Sync BAT: <span className="text-amber-300">auto_import.bat</span></li>
                      </ul>
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {activeTab === 'Performance' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <span>Detected Hardware & Bundled FFmpeg Engine</span>
                </div>
                {sysInfo ? (
                  <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400">CPU: </span>
                      <span className="text-slate-200">
                        {sysInfo.cpuModel} ({sysInfo.cpuCores} Logical Cores)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">System RAM: </span>
                      <span className="text-slate-200">
                        {sysInfo.freeMemoryGb} GB free / {sysInfo.totalMemoryGb} GB total
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Bundled FFmpeg: </span>
                      <span className="text-emerald-400">{sysInfo.ffmpegVersion}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400">Inspecting hardware...</p>
                )}
              </div>
            )}

            {activeTab === 'Cache' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                  <span>Media Cache (Thumbnails, Waveforms, Proxies, Exports)</span>
                </div>
                {sysInfo?.cacheStats && (
                  <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-1.5 font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Thumbnails Cache:</span>
                      <span>{formatBytes(sysInfo.cacheStats.thumbnails.bytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Rendered Exports Cache:</span>
                      <span>{formatBytes(sysInfo.cacheStats.exports.bytes)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800 pt-1 text-sky-400">
                      <span>Total Cache Size:</span>
                      <span>{formatBytes(sysInfo.cacheStats.totalBytes)}</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={handleClearCache}
                  className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded font-medium"
                >
                  Clear Cache Files (Preserves Original Media)
                </button>
              </div>
            )}

            {activeTab === 'Shortcuts' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-200 font-semibold mb-2">
                  <Keyboard className="w-4 h-4 text-sky-400" />
                  <span>Keyboard Shortcuts</span>
                </div>
                {[
                  ['Space', 'Play / Pause Timeline'],
                  ['S', 'Split Selected Clip at Playhead'],
                  ['Delete / Backspace', 'Delete Selected Clips'],
                  ['Ctrl + Z', 'Undo Last Operation'],
                  ['Ctrl + Shift + Z', 'Redo Operation'],
                  ['Ctrl + S', 'Save Project (.hveproject)'],
                  ['Ctrl + C / Ctrl + V', 'Copy / Paste Clip'],
                  ['Ctrl + D', 'Duplicate Clip'],
                  ['J / K / L', 'Shuttle Reverse / Pause / Forward'],
                  ['Left / Right Arrows', 'Step One Frame Backward / Forward'],
                  ['Shift + Left / Right Arrows', 'Jump 1 Second Backward / Forward'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between py-1.5 border-b border-slate-800/80">
                    <span className="text-slate-300">{desc}</span>
                    <kbd className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded font-mono text-[11px] text-sky-400">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Logs' && (
              <div className="space-y-2 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setLogType('app')}
                      className={`px-2.5 py-1 rounded ${
                        logType === 'app' ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      logs/app.log
                    </button>
                    <button
                      onClick={() => setLogType('ffmpeg')}
                      className={`px-2.5 py-1 rounded ${
                        logType === 'ffmpeg' ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      logs/ffmpeg.log
                    </button>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(logsText)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy Log
                  </button>
                </div>
                <pre className="flex-1 bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-[10px] text-slate-300 overflow-auto">
                  {logsText || 'No entries logged yet.'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface WelcomeAndProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNewProject: (name: string, ar: AspectRatioOption, res: string, fps: number) => void;
  onOpenExistingProject: (project: ProjectData) => void;
  onImportProjectFileFromDisk?: (file: File) => void;
  onImportMediaFilesFromDisk?: (files: File[]) => void;
}

export const WelcomeAndProjectModal: React.FC<WelcomeAndProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateNewProject,
  onOpenExistingProject,
  onImportProjectFileFromDisk,
  onImportMediaFilesFromDisk,
}) => {
  const [name, setName] = useState('Cinematic Documentary Cut');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('16:9');
  const [resolution, setResolution] = useState('1920x1080');
  const [fps, setFps] = useState(30);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [recoveryProject, setRecoveryProject] = useState<ProjectData | null>(null);
  const modalProjectInputRef = React.useRef<HTMLInputElement>(null);
  const modalMediaInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/projects/list')
      .then((r) => r.json())
      .then((d) => {
        setSavedProjects(d.projects || []);
        setRecoveryProject(d.recoveryProject || null);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#0F172A] border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">Welcome to Hussain Video Editor</h2>
            <p className="text-xs text-slate-400">
              Desktop Nonlinear Video Studio v1.0.0 · Offline FFmpeg Architecture
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Hidden File Inputs for Modal Import */}
          <input
            ref={modalProjectInputRef}
            type="file"
            accept=".hveproject,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f && onImportProjectFileFromDisk) {
                onImportProjectFileFromDisk(f);
                onClose();
              }
            }}
          />
          <input
            ref={modalMediaInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list && list.length > 0 && onImportMediaFilesFromDisk) {
                const arr = Array.from(list);
                e.target.value = '';
                onImportMediaFilesFromDisk(arr);
                onClose();
              }
            }}
          />

          {/* Quick Import Project or Media From Local Disk */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => modalProjectInputRef.current?.click()}
              className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-sky-500/40 rounded-md flex items-center justify-center gap-2 text-xs font-semibold text-sky-300 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-sky-400" />
              Import Project File (.hveproject)
            </button>
            <button
              type="button"
              onClick={() => modalMediaInputRef.current?.click()}
              className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 rounded-md flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer"
            >
              <FileVideo className="w-4 h-4 text-emerald-400" />
              Import Video / Audio to Timeline
            </button>
          </div>

          {recoveryProject && (
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-md p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-300">Recovered Auto-Saved Project Available</p>
                <p className="text-[11px] text-slate-300">
                  {recoveryProject.name} ({recoveryProject.clips?.length || 0} timeline clips)
                </p>
              </div>
              <button
                onClick={() => {
                  onOpenExistingProject(recoveryProject);
                  onClose();
                }}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded text-xs"
              >
                Restore Recovery
              </button>
            </div>
          )}

          {/* New Project Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-200">Create New Project</p>
            <div>
              <label className="text-[11px] text-slate-400">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 mt-1"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400">Canvas Aspect</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => {
                    const ar = e.target.value as AspectRatioOption;
                    setAspectRatio(ar);
                    if (ar === '9:16') setResolution('1080x1920');
                    else if (ar === '1:1') setResolution('1080x1080');
                    else setResolution('1920x1080');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="16:9">16:9 Widescreen</option>
                  <option value="9:16">9:16 Shorts / Vertical</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="4:5">4:5 Social Portrait</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200 mt-1"
                >
                  <option value="1920x1080">1920x1080</option>
                  <option value="1080x1920">1080x1920</option>
                  <option value="1080x1080">1080x1080</option>
                  <option value="3840x2160">3840x2160 (4K)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Timeline FPS</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200 mt-1"
                >
                  {[24, 25, 30, 50, 60].map((f) => (
                    <option key={f} value={f}>
                      {f} FPS
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                onCreateNewProject(name || 'Untitled Project', aspectRatio, resolution, fps);
                onClose();
              }}
              className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Create Project & Launch Timeline
            </button>
          </div>

          {/* Recent Saved Projects (.hveproject) */}
          {savedProjects.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-300">Recent Saved Projects (.hveproject)</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5">
                {savedProjects.map((p) => (
                  <div
                    key={p.filename}
                    className="bg-slate-900 border border-slate-800 rounded px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-200">{p.name}</span>
                      <span className="text-slate-500 font-mono ml-2">
                        {p.aspectRatio} · {p.clipCount} clips
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        const r = await fetch(`/api/projects/load/${p.filename}`);
                        if (r.ok) {
                          const d = await r.json();
                          onOpenExistingProject(d.project);
                          onClose();
                        }
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-xs flex items-center gap-1"
                    >
                      <FolderOpen className="w-3 h-3" /> Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
