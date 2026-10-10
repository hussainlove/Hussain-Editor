import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Maximize2,
  Flame,
  Star,
  ThumbsUp,
  ArrowRight,
  MessageCircle,
  Heart,
  ShieldCheck,
  Sparkles,
  Radio,
  Clapperboard,
  Volume2,
  VolumeX,
  Repeat,
  Grid,
  Camera,
  Eye,
  ZoomIn,
  RotateCcw,
  Type,
  MessageSquare,
  Film,
  Download,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import {
  TimelineTrack,
  TimelineClip,
  AspectRatioOption,
  PreviewResolutionOption,
  ONLINE_STICKER_PACK_CATALOG,
  DEFAULT_TEXT_STYLE,
  VOICE_SYNC_CAPTION_FORMATS,
} from '../types/editor';
import {
  formatTimecode,
  evaluateKeyframedProperty,
  computeClipFilterStyle,
  computeClipMaskPath,
} from '../utils/editorMath';

interface PreviewMonitorProps {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  setPlayheadTime: (t: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  aspectRatio: AspectRatioOption;
  setAspectRatio: (ar: AspectRatioOption) => void;
  previewResolution: PreviewResolutionOption;
  setPreviewResolution: (res: PreviewResolutionOption) => void;
  fps: number;
  selectedClipId: string | null;
  onSelectClip: (id: string, multi: boolean) => void;
  onUpdateClipTransformDrag: (clipId: string, newPosX: number, newPosY: number) => void;
  onUpdateClipScaleDrag?: (clipId: string, newScale: number) => void;
  onUpdateClipTextInline?: (clipId: string, newText: string) => void;
}

export const PreviewMonitor: React.FC<PreviewMonitorProps> = ({
  tracks,
  clips,
  playheadTime,
  setPlayheadTime,
  isPlaying,
  setIsPlaying,
  aspectRatio,
  setAspectRatio,
  previewResolution,
  setPreviewResolution,
  fps,
  selectedClipId,
  onSelectClip,
  onUpdateClipTransformDrag,
  onUpdateClipScaleDrag,
  onUpdateClipTextInline,
}) => {
  const monitorContainerRef = useRef<HTMLDivElement>(null);
  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Advanced Preview Monitor Viewport States
  const [canvasZoom, setCanvasZoom] = useState<'Fit' | number>('Fit');
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showSafeGrid, setShowSafeGrid] = useState<boolean>(false);
  const [bypassEffects, setBypassEffects] = useState<boolean>(false);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(false);
  const [playbackSpeedRate, setPlaybackSpeedRate] = useState<number>(1);
  const [masterVolume, setMasterVolume] = useState<number>(100);
  const [masterMuted, setMasterMuted] = useState<boolean>(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360,
  });
  const [hoverScrubTime, setHoverScrubTime] = useState<number | null>(null);
  const [isScrubbingBar, setIsScrubbingBar] = useState<boolean>(false);
  const [inlineEditingClipId, setInlineEditingClipId] = useState<string | null>(null);
  const [inlineTextDraft, setInlineTextDraft] = useState<string>('');
  const scrubberBarRef = useRef<HTMLDivElement>(null);
  const pendingSeekTargetsRef = useRef<Record<string, number>>({});

  // In-Monitor Quick Render Preview State
  const [quickRenderState, setQuickRenderState] = useState<{
    status: 'idle' | 'rendering' | 'ready' | 'error';
    progress: number;
    videoUrl?: string;
    error?: string;
  }>({ status: 'idle', progress: 0 });

  // Drag / Resize / Right-Click Pan States
  const [draggingCanvasClip, setDraggingCanvasClip] = useState<{
    clipId: string;
    mode: 'move' | 'scale';
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
    initialScale: number;
  } | null>(null);

  const [rightClickPan, setRightClickPan] = useState<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    velX: number;
    velY: number;
  } | null>(null);

  const [snapGuide, setSnapGuide] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });

  // Exact end time of the last clip on the timeline
  const lastClipEndTime = clips.reduce(
    (max, c) => Math.max(max, Math.round((c.startTime + c.duration) * 100) / 100),
    0
  );
  const totalProjectDuration = lastClipEndTime > 0 ? lastClipEndTime : 5;

  // Responsive Aspect Ratio Stage Calculator using ResizeObserver
  useEffect(() => {
    const el = stageWrapperRef.current;
    if (!el) return;

    const computeStageDimensions = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(160, rect.width - 28);
      const availH = Math.max(120, rect.height - 28);

      let ratio = 16 / 9;
      if (aspectRatio === '9:16') ratio = 9 / 16;
      else if (aspectRatio === '1:1') ratio = 1;
      else if (aspectRatio === '4:5') ratio = 4 / 5;

      let w = availW;
      let h = w / ratio;
      if (h > availH) {
        h = availH;
        w = h * ratio;
      }

      setStageSize({
        width: Math.max(120, Math.floor(w)),
        height: Math.max(90, Math.floor(h)),
      });
    };

    computeStageDimensions();
    const ro = new ResizeObserver(computeStageDimensions);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectRatio]);

  // Sync HTML5 video/audio elements with playheadTime & playback state without seek-stutter
  useEffect(() => {
    const anySolo = tracks.some((t) => t.solo);
    const masterGain = masterMuted ? 0 : masterVolume / 100;

    clips.forEach((clip) => {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track) return;

      const isActive =
        playheadTime >= clip.startTime && playheadTime <= clip.startTime + clip.duration;
      const targetMediaTime = Math.max(
        0,
        clip.trimStart + (playheadTime - clip.startTime) * clip.speed
      );

      const isTrackAudible = !track.muted && !clip.muted && (!anySolo || track.solo);
      const interpolatedVol = evaluateKeyframedProperty(clip, 'volume', playheadTime);
      const effectiveVolume = isTrackAudible
        ? Math.min(1, Math.max(0, (interpolatedVol / 100) * 0.95 * masterGain))
        : 0;

      const effectiveRate = Math.max(
        0.25,
        Math.min(4.0, (clip.speed || 1) * playbackSpeedRate)
      );

      if (clip.type === 'video') {
        const vEl = videoRefs.current[clip.id];
        if (vEl) {
          vEl.volume = effectiveVolume;
          vEl.muted = effectiveVolume === 0;
          if (Math.abs(vEl.playbackRate - effectiveRate) > 0.02) {
            vEl.playbackRate = effectiveRate;
          }
          if (isActive) {
            pendingSeekTargetsRef.current[clip.id] = targetMediaTime;
            // Avoid interrupting an active seek; use wider drift tolerance during playback for smooth 60fps video
            const driftThreshold = isPlaying ? 0.45 : 0.02;
            if (!vEl.seeking && Math.abs(vEl.currentTime - targetMediaTime) > driftThreshold) {
              try {
                vEl.currentTime = Math.max(0.001, targetMediaTime);
              } catch {
                // ignore if media metadata not loaded yet
              }
            }
            if (isPlaying && vEl.paused) {
              const playPromise = vEl.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {
                  // If browser blocks unmuted autoplay before gesture, fallback to muted so video still plays smoothly
                  vEl.muted = true;
                  vEl.play().catch(() => {});
                });
              }
            } else if (!isPlaying && !vEl.paused) {
              vEl.pause();
            }
          } else {
            if (!vEl.paused) vEl.pause();
          }
        }
      } else if (clip.type === 'audio') {
        const aEl = audioRefs.current[clip.id];
        if (aEl) {
          aEl.volume = effectiveVolume;
          aEl.muted = effectiveVolume === 0;
          if (Math.abs(aEl.playbackRate - effectiveRate) > 0.02) {
            aEl.playbackRate = effectiveRate;
          }
          if (isActive) {
            pendingSeekTargetsRef.current[clip.id] = targetMediaTime;
            const driftThreshold = isPlaying ? 0.45 : 0.03;
            if (!aEl.seeking && Math.abs(aEl.currentTime - targetMediaTime) > driftThreshold) {
              try {
                aEl.currentTime = Math.max(0, targetMediaTime);
              } catch {
                // ignore
              }
            }
            if (isPlaying && aEl.paused) {
              aEl.play().catch(() => {});
            } else if (!isPlaying && !aEl.paused) {
              aEl.pause();
            }
          } else {
            if (!aEl.paused) aEl.pause();
          }
        }
      }
    });
  }, [playheadTime, isPlaying, clips, tracks, masterVolume, masterMuted, playbackSpeedRate]);

  // Smooth RequestAnimationFrame playback loop with Loop & Speed support
  useEffect(() => {
    if (!isPlaying) return;
    if (lastClipEndTime <= 0) {
      setIsPlaying(false);
      return;
    }

    setPlayheadTime((current) => (current >= lastClipEndTime - 0.05 ? 0 : current));

    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = ((now - lastTime) / 1000) * playbackSpeedRate;
      lastTime = now;
      setPlayheadTime((prev) => {
        const next = prev + dt;
        if (next >= lastClipEndTime) {
          if (loopPlayback) {
            return 0;
          }
          setIsPlaying(false);
          return lastClipEndTime;
        }
        return next;
      });
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, lastClipEndTime, loopPlayback, playbackSpeedRate, setPlayheadTime, setIsPlaying]);

  // Right-click hold & move directional auto-pan / auto-scrub on Preview Monitor
  useEffect(() => {
    if (!rightClickPan) return;
    let rafId: number;
    const step = () => {
      if (Math.abs(rightClickPan.velX) > 0.5 || Math.abs(rightClickPan.velY) > 0.5) {
        if (canvasZoom !== 'Fit' && canvasZoom > 100) {
          setPanOffset((prev) => ({
            x: prev.x - rightClickPan.velX * 0.14,
            y: prev.y - rightClickPan.velY * 0.14,
          }));
        } else {
          // Smoothly scrub playhead in the direction of horizontal right-click movement
          setPlayheadTime((prev) =>
            Math.max(0, Math.min(totalProjectDuration, prev + rightClickPan.velX * 0.0025))
          );
        }
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [rightClickPan, canvasZoom, totalProjectDuration, setPlayheadTime]);

  // Global mousemove/mouseup for smooth click-and-drag scrubbing on the Preview Scrubber Bar
  useEffect(() => {
    if (!isScrubbingBar) return;
    const onMove = (e: MouseEvent) => {
      const bar = scrubberBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const nextTime = ratio * totalProjectDuration;
      setHoverScrubTime(nextTime);
      setPlayheadTime(nextTime);
    };
    const onUp = () => {
      setIsScrubbingBar(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isScrubbingBar, totalProjectDuration, setPlayheadTime]);

  // In-Monitor Quick Video Render (renders all clips, cuts, filters & Yellow/Green voice-synced captions to a playable video stream)
  const handleQuickRenderPreview = useCallback(async () => {
    setIsPlaying(false);
    setQuickRenderState({ status: 'rendering', progress: 5 });

    try {
      const outW = aspectRatio === '9:16' ? 720 : aspectRatio === '1:1' ? 720 : aspectRatio === '4:5' ? 720 : 1280;
      const outH = aspectRatio === '9:16' ? 1280 : aspectRatio === '1:1' ? 720 : aspectRatio === '4:5' ? 900 : 720;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
      if (!stream) throw new Error('Browser stream capture unsupported');

      // Attach audio from active video/audio clips if available
      const firstAudibleVideo = clips.find((c) => c.type === 'video' && !c.muted && c.url);
      const vElForAudio = firstAudibleVideo ? videoRefs.current[firstAudibleVideo.id] : null;
      if (vElForAudio && (vElForAudio as any).captureStream) {
        try {
          const vStream = (vElForAudio as any).captureStream();
          vStream.getAudioTracks().forEach((t: MediaStreamTrack) => stream.addTrack(t));
        } catch {
          // ignore if captureStream audio track unavailable
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

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: 8_000_000 })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      // Preload image elements for any image clips
      const loadedImages: Record<string, HTMLImageElement> = {};
      await Promise.all(
        clips
          .filter((c) => c.type === 'image' && c.url)
          .map(
            (c) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  loadedImages[c.id] = img;
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = c.url!;
              })
          )
      );

      recorder.start(150);
      const durationToRender = Math.max(1, totalProjectDuration);
      const fpsStep = 1 / 24;
      const totalSteps = Math.max(10, Math.min(360, Math.ceil(durationToRender / fpsStep)));
      const timeStep = durationToRender / totalSteps;

      for (let i = 0; i <= totalSteps; i++) {
        const simTime = Math.min(durationToRender, i * timeStep);
        ctx.fillStyle = '#090D16';
        ctx.fillRect(0, 0, outW, outH);

        // Draw active video or image clips at simTime
        const activeVidOrImg = clips
          .filter(
            (c) =>
              (c.type === 'video' || c.type === 'image') &&
              simTime >= c.startTime &&
              simTime <= c.startTime + c.duration
          )
          .sort((a, b) => a.startTime - b.startTime);

        for (const vc of activeVidOrImg) {
          if (vc.type === 'video') {
            const vEl = videoRefs.current[vc.id];
            if (vEl && vEl.readyState >= 1) {
              const targetT = Math.max(0.001, vc.trimStart + (simTime - vc.startTime) * (vc.speed || 1));
              if (Math.abs(vEl.currentTime - targetT) > 0.03) {
                try {
                  vEl.currentTime = targetT;
                  await new Promise<void>((res) => {
                    const to = window.setTimeout(res, 45);
                    vEl.onseeked = () => {
                      window.clearTimeout(to);
                      res();
                    };
                  });
                } catch {
                  // ignore
                }
              }
              if (vEl.videoWidth > 0 && vEl.videoHeight > 0) {
                const scale = Math.min(outW / vEl.videoWidth, outH / vEl.videoHeight) * ((vc.scaleX || 100) / 100);
                const dw = vEl.videoWidth * scale;
                const dh = vEl.videoHeight * scale;
                const dx = (outW - dw) / 2 + (vc.positionX || 0);
                const dy = (outH - dh) / 2 + (vc.positionY || 0);
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, (vc.opacity ?? 100) / 100));
                ctx.drawImage(vEl, dx, dy, dw, dh);
                ctx.restore();
              }
            }
          } else if (vc.type === 'image') {
            const img = loadedImages[vc.id];
            if (img && img.naturalWidth > 0) {
              const scale = Math.min(outW / img.naturalWidth, outH / img.naturalHeight) * ((vc.scaleX || 100) / 100);
              const dw = img.naturalWidth * scale;
              const dh = img.naturalHeight * scale;
              const dx = (outW - dw) / 2 + (vc.positionX || 0);
              const dy = (outH - dh) / 2 + (vc.positionY || 0);
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, (vc.opacity ?? 100) / 100));
              ctx.drawImage(img, dx, dy, dw, dh);
              ctx.restore();
            }
          }
        }

        // Draw active captions & text with word-by-word Yellow & Green voice sync
        const activeCaps = clips.filter(
          (c) =>
            (c.type === 'caption' || c.type === 'text') &&
            simTime >= c.startTime &&
            simTime <= c.startTime + c.duration
        );

        for (const cap of activeCaps) {
          const st = { ...DEFAULT_TEXT_STYLE, ...(cap.textStyle || {}) };
          const presetInfo = VOICE_SYNC_CAPTION_FORMATS.find((f) => f.id === (st.captionPreset || 'Modern'));
          const rawText = cap.textContent || cap.name || '';
          const allWords = rawText.split(/\s+/).filter(Boolean);
          if (allWords.length === 0) continue;

          const clipProg = Math.max(0, Math.min(0.9999, (simTime - cap.startTime) / Math.max(0.1, cap.duration)));
          const activeWordIndex = Math.min(
            Math.max(0, allWords.length - 1),
            Math.floor(clipProg * allWords.length)
          );

          const fontSize = Math.max(20, Math.round((st.fontSize || 42) * (outH / 720)));
          const fontFam = st.fontFamily || 'Plus Jakarta Sans';
          ctx.save();
          ctx.font = `800 ${fontSize}px "${fontFam}", sans-serif`;
          ctx.textBaseline = 'middle';

          const lines = rawText.split(/\n|\|/).map((l) => l.trim()).filter(Boolean);
          const effectiveLines =
            lines.length > 1
              ? lines
              : (presetInfo?.isMultiline || st.captionPreset?.includes('Multiline')) && allWords.length > 2
              ? [
                  allWords.slice(0, Math.ceil(allWords.length / 2)).join(' '),
                  allWords.slice(Math.ceil(allWords.length / 2)).join(' '),
                ]
              : [rawText];

          const baseY = outH * 0.82 + ((cap.positionY || 0) * (outH / 500));
          const lineStep = fontSize * 1.32;
          let globalWIdx = 0;

          effectiveLines.forEach((lineStr, lIdx) => {
            const lineWords = lineStr.split(/\s+/).filter(Boolean);
            const ly = baseY + (lIdx - (effectiveLines.length - 1) / 2) * lineStep;
            const spaceW = ctx.measureText(' ').width * 1.15;
            const wordWidths = lineWords.map((w) => ctx.measureText(w).width);
            const totalLineW =
              wordWidths.reduce((a, b) => a + b, 0) + Math.max(0, lineWords.length - 1) * spaceW;

            if ((st.backgroundOpacity ?? 70) > 0) {
              ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
              const pad = 14;
              ctx.fillRect(
                outW / 2 - totalLineW / 2 - pad,
                ly - fontSize / 2 - pad * 0.45,
                totalLineW + pad * 2,
                fontSize + pad * 0.9
              );
            }

            let curX = outW / 2 - totalLineW / 2;
            lineWords.forEach((w, idxInLine) => {
              const gIdx = globalWIdx++;
              const isSpoken = gIdx === activeWordIndex;
              const wCustom = st.wordStyles?.[gIdx];
              const ww = wordWidths[idxInLine];

              let spokenCol =
                st.activeWordColor ||
                presetInfo?.activeWordColor ||
                (st.captionPreset?.includes('Green') ? '#22C55E' : '#FACC15');
              if (st.captionPreset === 'YellowGreenMultiline') {
                spokenCol = lIdx % 2 === 0 ? '#FACC15' : '#22C55E';
              } else if (st.captionPreset === 'SingleWordYellowGreen') {
                spokenCol = gIdx % 2 === 0 ? '#FACC15' : '#22C55E';
              }

              const fillCol = isSpoken ? spokenCol : wCustom?.color || st.color || '#FFFFFF';
              const pillBg = isSpoken
                ? st.activeWordBgColor && st.activeWordBgColor !== 'transparent'
                  ? st.activeWordBgColor
                  : presetInfo?.activeWordBgColor
                : wCustom?.bgColor;

              if (pillBg && pillBg !== 'transparent') {
                ctx.fillStyle = pillBg;
                ctx.fillRect(curX - 4, ly - fontSize * 0.55, ww + 8, fontSize * 1.1);
              }

              ctx.textAlign = 'left';
              if ((st.strokeWidth ?? 2) > 0) {
                ctx.lineWidth = Math.max(2, (st.strokeWidth || 2) * 1.5);
                ctx.strokeStyle = wCustom?.strokeColor || st.strokeColor || '#000000';
                ctx.strokeText(w, curX, ly);
              }
              ctx.fillStyle = fillCol;
              ctx.fillText(w, curX, ly);
              curX += ww + spaceW;
            });
          });
          ctx.restore();
        }

        const pct = Math.min(98, Math.max(8, Math.round((i / totalSteps) * 100)));
        setQuickRenderState({ status: 'rendering', progress: pct });
        await new Promise((r) => window.setTimeout(r, 16));
      }

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      await new Promise<void>((res) => {
        if (recorder.state === 'inactive') {
          res();
          return;
        }
        recorder.onstop = () => res();
      });

      const blob = new Blob(chunks, { type: chosenMime || 'video/webm' });
      const url = URL.createObjectURL(blob);
      setQuickRenderState({ status: 'ready', progress: 100, videoUrl: url });
    } catch (err: any) {
      setQuickRenderState({
        status: 'error',
        progress: 0,
        error: err?.message || 'Quick render failed',
      });
    }
  }, [aspectRatio, clips, totalProjectDuration]);
  const handleStepFrame = (direction: -1 | 1, jumpSecond = false) => {
    setIsPlaying(false);
    const stepDur = jumpSecond ? 1 : 1 / (fps || 30);
    setPlayheadTime((prev) =>
      Math.max(0, Math.min(totalProjectDuration, Math.round((prev + direction * stepDur) * 1000) / 1000))
    );
  };

  const handleFullscreen = () => {
    if (monitorContainerRef.current?.requestFullscreen) {
      monitorContainerRef.current.requestFullscreen().catch(() => {});
    }
  };

  // Capture current composited frame as PNG snapshot
  const handleCaptureSnapshot = useCallback(() => {
    const canvas = document.createElement('canvas');
    const outW = aspectRatio === '9:16' ? 1080 : aspectRatio === '1:1' ? 1080 : aspectRatio === '4:5' ? 1080 : 1920;
    const outH = aspectRatio === '9:16' ? 1920 : aspectRatio === '1:1' ? 1080 : aspectRatio === '4:5' ? 1350 : 1080;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, outW, outH);

    // Draw active video or image
    const activeVidClip = clips.find(
      (c) => c.type === 'video' && playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration
    );
    if (activeVidClip) {
      const vEl = videoRefs.current[activeVidClip.id];
      if (vEl && vEl.readyState >= 2) {
        try {
          ctx.drawImage(vEl, 0, 0, outW, outH);
        } catch {
          // ignore
        }
      }
    }

    // Draw active caption / text
    const activeTextClips = clips.filter(
      (c) =>
        (c.type === 'caption' || c.type === 'text') &&
        playheadTime >= c.startTime &&
        playheadTime <= c.startTime + c.duration
    );
    activeTextClips.forEach((tc) => {
      const st = { ...DEFAULT_TEXT_STYLE, ...(tc.textStyle || {}) };
      const txt = tc.textContent || tc.name || '';
      ctx.save();
      ctx.font = `bold ${Math.round((st.fontSize || 42) * 1.4)}px "${st.fontFamily || 'sans-serif'}", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = st.activeWordColor || st.color || '#FFFFFF';
      ctx.strokeStyle = st.strokeColor || '#000000';
      ctx.lineWidth = (st.strokeWidth || 2) * 2;
      const yPos = outH * 0.82;
      ctx.strokeText(txt.replace(/\n|\|/g, ' '), outW / 2, yPos);
      ctx.fillText(txt.replace(/\n|\|/g, ' '), outW / 2, yPos);
      ctx.restore();
    });

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Frame_${formatTimecode(playheadTime, fps).replace(/:/g, '-')}.png`;
    a.click();
  }, [aspectRatio, clips, playheadTime, fps]);

  // Determine active visual clips ordered from bottom track to top track
  const visibleTracksBottomUp = [...tracks]
    .filter((t) => !t.hidden && t.type !== 'audio')
    .reverse();

  const activeVisualClips = visibleTracksBottomUp.flatMap((tr) =>
    clips.filter(
      (c) =>
        c.trackId === tr.id &&
        playheadTime >= c.startTime &&
        playheadTime <= c.startTime + c.duration
    )
  );

  const selectedClipObj = clips.find((c) => c.id === selectedClipId) || null;
  const effectiveZoomScale = canvasZoom === 'Fit' ? 1 : canvasZoom / 100;

  return (
    <div
      ref={monitorContainerRef}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onMouseDown={(e) => {
        if (e.button === 2) {
          e.preventDefault();
          setRightClickPan({
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            velX: 0,
            velY: 0,
          });
        }
      }}
      onMouseMove={(e) => {
        if (rightClickPan) {
          const dxFromStart = e.clientX - rightClickPan.startX;
          const dyFromStart = e.clientY - rightClickPan.startY;
          const stepDx = e.clientX - rightClickPan.lastX;
          const stepDy = e.clientY - rightClickPan.lastY;
          if (canvasZoom !== 'Fit' && canvasZoom > 100) {
            setPanOffset((prev) => ({ x: prev.x + stepDx, y: prev.y + stepDy }));
          } else {
            setPlayheadTime((prev) =>
              Math.max(0, Math.min(totalProjectDuration, prev + stepDx * 0.02))
            );
          }
          setRightClickPan({
            ...rightClickPan,
            lastX: e.clientX,
            lastY: e.clientY,
            velX: dxFromStart,
            velY: dyFromStart,
          });
          return;
        }

        if (!draggingCanvasClip) return;
        const dx = (e.clientX - draggingCanvasClip.startX) / effectiveZoomScale;
        const dy = (e.clientY - draggingCanvasClip.startY) / effectiveZoomScale;

        if (draggingCanvasClip.mode === 'scale') {
          const nextScale = Math.max(
            15,
            Math.min(400, Math.round(draggingCanvasClip.initialScale + (dx - dy) * 0.45))
          );
          onUpdateClipScaleDrag?.(draggingCanvasClip.clipId, nextScale);
          return;
        }

        let nextX = Math.round(draggingCanvasClip.initialPosX + dx);
        let nextY = Math.round(draggingCanvasClip.initialPosY + dy);

        // Magnetic center snap guides
        const snapX = Math.abs(nextX) < 7;
        const snapY = Math.abs(nextY) < 7;
        if (snapX) nextX = 0;
        if (snapY) nextY = 0;
        setSnapGuide({ x: snapX, y: snapY });

        onUpdateClipTransformDrag(draggingCanvasClip.clipId, nextX, nextY);
      }}
      onMouseUp={() => {
        setDraggingCanvasClip(null);
        setRightClickPan(null);
        setSnapGuide({ x: false, y: false });
      }}
      onMouseLeave={() => {
        setDraggingCanvasClip(null);
        setRightClickPan(null);
        setSnapGuide({ x: false, y: false });
      }}
      className="flex-1 flex flex-col bg-[#090D16] overflow-hidden select-none"
    >
      {/* Hidden Audio Elements for Multi-Track Audio Playback */}
      {clips
        .filter((c) => c.type === 'audio' && c.url)
        .map((audioClip) => (
          <audio
            key={audioClip.id}
            ref={(el) => {
              audioRefs.current[audioClip.id] = el;
            }}
            src={audioClip.url}
            preload="auto"
          />
        ))}

      {/* Top Preview Studio Toolbar */}
      <div className="min-h-9 px-3 py-1 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#0F172A] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
              }`}
            />
            <span>Program Monitor</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] font-mono text-slate-400">
            {stageSize.width}×{stageSize.height}px
          </span>
          {selectedClipObj && (selectedClipObj.type === 'caption' || selectedClipObj.type === 'text') && (
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('hve-open-caption-window'))}
                className="px-2 py-0.5 bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-amber-400/40 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                title="Open Full Caption Studio Window"
              >
                <MessageSquare className="w-3 h-3" /> Caption Studio
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('hve-open-font-window'))}
                className="px-2 py-0.5 bg-purple-500/20 hover:bg-purple-500 text-purple-200 hover:text-slate-950 border border-purple-500/40 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                title="Open Full Font, Animation & Word-by-Word Color Window"
              >
                <Type className="w-3 h-3" /> Font & Word Color Window
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[11px]">
            {(['16:9', '9:16', '1:1', '4:5'] as AspectRatioOption[]).map((ar) => (
              <button
                key={ar}
                onClick={() => setAspectRatio(ar)}
                className={`px-1.5 py-0.5 rounded font-mono transition-colors ${
                  aspectRatio === ar
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>

          {/* Canvas Zoom Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] gap-1">
            <ZoomIn className="w-3 h-3 text-sky-400" />
            <select
              value={String(canvasZoom)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'Fit') {
                  setCanvasZoom('Fit');
                  setPanOffset({ x: 0, y: 0 });
                } else {
                  setCanvasZoom(Number(val));
                }
              }}
              className="bg-transparent text-slate-200 font-mono focus:outline-none text-[11px]"
              title="Viewport Canvas Zoom"
            >
              <option value="Fit" className="bg-slate-900">Fit</option>
              <option value="50" className="bg-slate-900">50%</option>
              <option value="75" className="bg-slate-900">75%</option>
              <option value="100" className="bg-slate-900">100%</option>
              <option value="125" className="bg-slate-900">125%</option>
              <option value="150" className="bg-slate-900">150%</option>
              <option value="200" className="bg-slate-900">200%</option>
            </select>
            {canvasZoom !== 'Fit' && (
              <button
                type="button"
                onClick={() => {
                  setCanvasZoom('Fit');
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="text-slate-400 hover:text-white"
                title="Reset Zoom & Pan"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Safe Area & Rule of Thirds Grid Toggle */}
          <button
            type="button"
            onClick={() => setShowSafeGrid((g) => !g)}
            className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 transition-colors ${
              showSafeGrid
                ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Rule-of-Thirds & Broadcast Title Safe Margins"
          >
            <Grid className="w-3 h-3" />
            <span className="hidden sm:inline">Grid</span>
          </button>

          {/* FX / Color Grade Bypass (Before/After Compare) */}
          <button
            type="button"
            onClick={() => setBypassEffects((b) => !b)}
            className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 transition-colors ${
              bypassEffects
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Compare Original vs Color Graded / Effects"
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">{bypassEffects ? 'Original' : 'FX On'}</span>
          </button>

          {/* Snapshot Frame Button */}
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[11px] text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
            title="Save Current Preview Frame as PNG Snapshot"
          >
            <Camera className="w-3 h-3 text-emerald-400" />
            <span className="hidden md:inline">Snapshot</span>
          </button>

          {/* Instant In-Monitor Video Render Button */}
          <button
            type="button"
            disabled={quickRenderState.status === 'rendering'}
            onClick={handleQuickRenderPreview}
            className="px-2.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
            title="Render Timeline Video & Captions Directly Inside Preview Monitor"
          >
            {quickRenderState.status === 'rendering' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Rendering {quickRenderState.progress}%</span>
              </>
            ) : (
              <>
                <Film className="w-3 h-3" />
                <span>Render Preview</span>
              </>
            )}
          </button>

          {/* Preview Resolution Selector */}
          <select
            value={previewResolution}
            onChange={(e) => setPreviewResolution(e.target.value as PreviewResolutionOption)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300 font-mono"
            title="Preview Proxy Resolution"
          >
            <option value="Auto">Auto Proxy</option>
            <option value="360p">360p Fast</option>
            <option value="540p">540p Half</option>
            <option value="720p">720p HD</option>
            <option value="1080p">1080p Full</option>
          </select>

          <button
            onClick={handleFullscreen}
            className="p-1 text-slate-400 hover:text-slate-200 rounded"
            title="Fullscreen Preview"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Quick Caption/Text Editor Bar when user double-clicks text on canvas */}
      {inlineEditingClipId && (
        <div className="px-3 py-1.5 bg-slate-900/95 border-b border-amber-500/50 flex items-center justify-between gap-2 shrink-0 z-40">
          <div className="flex items-center gap-2 flex-1">
            <Type className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-300 whitespace-nowrap">
              Canvas Text Edit:
            </span>
            <input
              type="text"
              autoFocus
              value={inlineTextDraft}
              onChange={(e) => {
                setInlineTextDraft(e.target.value);
                onUpdateClipTextInline?.(inlineEditingClipId, e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  setInlineEditingClipId(null);
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-0.5 text-xs text-slate-100 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setInlineEditingClipId(null);
                window.dispatchEvent(new CustomEvent('hve-open-font-window'));
              }}
              className="px-2.5 py-0.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold rounded text-[11px]"
            >
              Word-by-Word & Font Studio
            </button>
            <button
              type="button"
              onClick={() => setInlineEditingClipId(null)}
              className="px-2.5 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded text-[11px]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Center Compositor Viewport */}
      <div
        ref={stageWrapperRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setInlineEditingClipId(null);
          }
        }}
        className="flex-1 flex items-center justify-center p-3 overflow-hidden relative bg-[#06090F]"
      >
        <div
          ref={stageBoxRef}
          style={{
            width: `${stageSize.width}px`,
            height: `${stageSize.height}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${effectiveZoomScale})`,
            transformOrigin: 'center center',
          }}
          className="relative bg-slate-950 border border-slate-800/90 shadow-[0_12px_45px_rgba(0,0,0,0.85)] overflow-hidden flex items-center justify-center transition-shadow"
        >
          {/* Magnetic Center Alignment Crosshairs while dragging */}
          {snapGuide.x && (
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-sky-400/90 z-40 pointer-events-none shadow-[0_0_8px_#38BDF8]" />
          )}
          {snapGuide.y && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-sky-400/90 z-40 pointer-events-none shadow-[0_0_8px_#38BDF8]" />
          )}

          {/* Rule-of-Thirds & Broadcast Title-Safe Margin Grid Overlay */}
          {showSafeGrid && (
            <div className="absolute inset-0 pointer-events-none z-40">
              {/* Rule of Thirds */}
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/20" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/20" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/20" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/20" />
              {/* Action Safe (90%) & Title Safe (80%) */}
              <div className="absolute inset-[5%] border border-dashed border-sky-400/35 rounded-xs" />
              <div className="absolute inset-[10%] border border-amber-400/35 rounded-xs" />
            </div>
          )}

          {/* Keep all video elements mounted and GPU-decoded for instant zero-blank-frame scrubbing */}
          {clips
            .filter((c) => c.type === 'video' && c.url)
            .map((clip) => {
              const activeIndex = activeVisualClips.findIndex((ac) => ac.id === clip.id);
              const isVisible = activeIndex !== -1;
              const posX = evaluateKeyframedProperty(clip, 'positionX', playheadTime);
              const posY = evaluateKeyframedProperty(clip, 'positionY', playheadTime);
              const scaleX = evaluateKeyframedProperty(clip, 'scaleX', playheadTime) / 100;
              const scaleY = evaluateKeyframedProperty(clip, 'scaleY', playheadTime) / 100;
              const rot = evaluateKeyframedProperty(clip, 'rotation', playheadTime);
              let opacity = evaluateKeyframedProperty(clip, 'opacity', playheadTime) / 100;

              // Apply Entrance / Exit Transition Opacity, Transform, ClipPath & Filter
              const elapsed = playheadTime - clip.startTime;
              const remaining = clip.startTime + clip.duration - playheadTime;
              let transTranslateX = 0;
              let transScale = 1;
              let transBlur = 0;
              let wipeRightInset = clip.cropRight;

              if (clip.transitionIn.type !== 'None' && elapsed < clip.transitionIn.duration) {
                const p = Math.max(0, Math.min(1, elapsed / Math.max(0.1, clip.transitionIn.duration)));
                const tType = clip.transitionIn.type;
                if (
                  tType === 'Fade' ||
                  tType === 'Cross Dissolve' ||
                  tType === 'Dip to Black' ||
                  tType === 'Dip to White' ||
                  tType === 'Film Burn'
                ) {
                  opacity *= p;
                } else if (tType === 'Slide' || tType === 'Push' || tType === 'Flash Whip') {
                  transTranslateX = (1 - p) * (tType === 'Flash Whip' ? -320 : -180);
                  transBlur = tType === 'Flash Whip' ? (1 - p) * 18 : 0;
                  opacity *= Math.min(1, p * 1.4);
                } else if (tType === 'Zoom' || tType === 'Spin Warp') {
                  transScale = 0.35 + p * 0.65;
                  opacity *= p;
                } else if (tType === 'Blur' || tType === 'Glitch Cut') {
                  transBlur = (1 - p) * 14;
                  opacity *= p;
                } else if (tType === 'Wipe') {
                  wipeRightInset = Math.max(clip.cropRight, (1 - p) * 100);
                }
              }

              if (clip.transitionOut.type !== 'None' && remaining < clip.transitionOut.duration) {
                const p = Math.max(0, Math.min(1, remaining / Math.max(0.1, clip.transitionOut.duration)));
                opacity *= p;
              }

              // Apply Entrance (In), Exit (Out) & Continuous Loop Animations on Video Clips too
              let loopTranslateY = 0;
              let loopRotate = 0;
              let loopScale = 1;
              const loopName = clip.animationLoop || 'None';
              if (loopName !== 'None') {
                if (
                  loopName.includes('Pulse') ||
                  loopName.includes('Heartbeat') ||
                  loopName.includes('Bass') ||
                  loopName.includes('Breathe')
                ) {
                  loopScale = 1 + Math.sin(elapsed * 5.5) * 0.06;
                } else if (loopName.includes('Float') || loopName.includes('Bounce')) {
                  loopTranslateY = Math.sin(elapsed * 4) * 12;
                } else if (loopName.includes('Spin')) {
                  loopRotate = (elapsed * 45) % 360;
                } else if (loopName.includes('Shake') || loopName.includes('Glitch')) {
                  transTranslateX += Math.sin(elapsed * 28) * 6;
                } else if (loopName.includes('Pendulum')) {
                  loopRotate = Math.sin(elapsed * 3.5) * 8;
                } else if (loopName.includes('Flicker') || loopName.includes('Neon')) {
                  opacity *= 0.82 + Math.abs(Math.sin(elapsed * 9)) * 0.18;
                } else {
                  loopScale = 1 + Math.sin(elapsed * 4) * 0.05;
                }
              }

              const flipScaleX = (clip.flipH ? -scaleX : scaleX) * transScale * loopScale;
              const flipScaleY = (clip.flipV ? -scaleY : scaleY) * transScale * loopScale;

              const clipPath = computeClipMaskPath(clip, wipeRightInset);
              const isSelected = selectedClipId === clip.id;
              const baseFilter = bypassEffects ? 'none' : computeClipFilterStyle(clip);
              const combinedFilter =
                !bypassEffects && transBlur > 0.2
                  ? `${baseFilter === 'none' ? '' : baseFilter} blur(${transBlur.toFixed(1)}px)`.trim()
                  : baseFilter;

              return (
                <video
                  key={clip.id}
                  ref={(el) => {
                    videoRefs.current[clip.id] = el;
                  }}
                  src={clip.url}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const vEl = e.currentTarget;
                    const targetT = Math.max(
                      0.001,
                      clip.trimStart + Math.max(0, playheadTime - clip.startTime) * (clip.speed || 1)
                    );
                    try {
                      vEl.currentTime = targetT;
                    } catch {
                      // ignore
                    }
                  }}
                  onSeeked={(e) => {
                    const vEl = e.currentTarget;
                    const desired = pendingSeekTargetsRef.current[clip.id];
                    if (desired !== undefined && !isPlaying && Math.abs(vEl.currentTime - desired) > 0.04) {
                      try {
                        vEl.currentTime = Math.max(0.001, desired);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onSelectClip(clip.id, false);
                    setDraggingCanvasClip({
                      clipId: clip.id,
                      mode: 'move',
                      startX: e.clientX,
                      startY: e.clientY,
                      initialPosX: posX,
                      initialPosY: posY,
                      initialScale: clip.scaleX || 100,
                    });
                  }}
                  style={{
                    visibility: isVisible ? 'visible' : 'hidden',
                    pointerEvents: isVisible ? 'auto' : 'none',
                    zIndex: isVisible ? 5 + activeIndex : 0,
                    transform: `translate(${posX + transTranslateX}px, ${posY + loopTranslateY}px) rotate(${
                      rot + loopRotate
                    }deg) scale(${flipScaleX}, ${flipScaleY})`,
                    opacity: isVisible ? opacity : 0,
                    filter: combinedFilter,
                    mixBlendMode: clip.blendMode,
                    clipPath,
                  }}
                  className={`absolute inset-0 w-full h-full object-contain cursor-move ${
                    isSelected && isVisible ? 'ring-2 ring-sky-400' : ''
                  }`}
                />
              );
            })}

          {/* Render Active Images, Text, Captions, and Stickers */}
          {activeVisualClips
            .filter((c) => c.type !== 'video')
            .map((clip) => {
              const posX = evaluateKeyframedProperty(clip, 'positionX', playheadTime);
              const posY = evaluateKeyframedProperty(clip, 'positionY', playheadTime);
              const scaleX = evaluateKeyframedProperty(clip, 'scaleX', playheadTime) / 100;
              const scaleY = evaluateKeyframedProperty(clip, 'scaleY', playheadTime) / 100;
              const rot = evaluateKeyframedProperty(clip, 'rotation', playheadTime);
              let opacity = evaluateKeyframedProperty(clip, 'opacity', playheadTime) / 100;
              const isSelected = selectedClipId === clip.id;

              // Animation offsets (In, Out, and Continuous Loop)
              let animTranslateX = 0;
              let animTranslateY = 0;
              let animScale = 1;
              let animRotate = 0;
              const elapsed = playheadTime - clip.startTime;
              const remaining = clip.startTime + clip.duration - playheadTime;

              if (clip.animationIn && clip.animationIn !== 'None' && elapsed < 0.45) {
                const progress = Math.max(0, Math.min(1, elapsed / 0.45));
                if (clip.animationIn.includes('Slide Up')) animTranslateY = (1 - progress) * 42;
                else if (clip.animationIn.includes('Slide Down')) animTranslateY = -(1 - progress) * 42;
                else if (clip.animationIn.includes('Slide Left')) animTranslateX = (1 - progress) * 60;
                else if (clip.animationIn.includes('Slide Right')) animTranslateX = -(1 - progress) * 60;
                else if (
                  clip.animationIn.includes('Zoom') ||
                  clip.animationIn.includes('Pop') ||
                  clip.animationIn.includes('Elastic') ||
                  clip.animationIn.includes('Bounce')
                ) {
                  animScale = 0.45 + progress * 0.55;
                } else if (clip.animationIn.includes('Rotate') || clip.animationIn.includes('Flip')) {
                  animRotate = (1 - progress) * -90;
                }
                opacity *= progress;
              }

              if (clip.animationOut && clip.animationOut !== 'None' && remaining < 0.45) {
                const progress = Math.max(0, Math.min(1, remaining / 0.45));
                if (clip.animationOut.includes('Zoom') || clip.animationOut.includes('Pop')) {
                  animScale *= 0.4 + progress * 0.6;
                } else if (clip.animationOut.includes('Spin') || clip.animationOut.includes('Vortex')) {
                  animRotate += (1 - progress) * 120;
                }
                opacity *= progress;
              }

              const loopAnim = clip.animationLoop || 'None';
              if (loopAnim !== 'None') {
                if (
                  loopAnim.includes('Pulse') ||
                  loopAnim.includes('Heartbeat') ||
                  loopAnim.includes('Bass') ||
                  loopAnim.includes('Breathe')
                ) {
                  animScale *= 1 + Math.sin(elapsed * 6) * 0.08;
                } else if (loopAnim.includes('Float') || loopAnim.includes('Bounce')) {
                  animTranslateY += Math.sin(elapsed * 4.5) * 10;
                } else if (loopAnim.includes('Spin')) {
                  animRotate += (elapsed * 60) % 360;
                } else if (loopAnim.includes('Shake') || loopAnim.includes('Glitch')) {
                  animTranslateX += Math.sin(elapsed * 30) * 5;
                } else if (loopAnim.includes('Pendulum')) {
                  animRotate += Math.sin(elapsed * 4) * 10;
                } else if (loopAnim.includes('Flicker') || loopAnim.includes('Neon')) {
                  opacity *= 0.78 + Math.abs(Math.sin(elapsed * 10)) * 0.22;
                } else {
                  animScale *= 1 + Math.sin(elapsed * 5) * 0.06;
                }
              }

              const commonStyle: React.CSSProperties = {
                transform: `translate(${posX + animTranslateX}px, ${posY + animTranslateY}px) rotate(${
                  rot + animRotate
                }deg) scale(${scaleX * animScale}, ${scaleY * animScale})`,
                opacity,
                filter: bypassEffects ? 'none' : computeClipFilterStyle(clip),
                mixBlendMode: clip.blendMode,
              };

              if (clip.type === 'image' && clip.url) {
                return (
                  <img
                    key={clip.id}
                    src={clip.url}
                    alt={clip.name}
                    referrerPolicy="no-referrer"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      onSelectClip(clip.id, false);
                      setDraggingCanvasClip({
                        clipId: clip.id,
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialPosX: posX,
                        initialPosY: posY,
                        initialScale: clip.scaleX || 100,
                      });
                    }}
                    style={{
                      ...commonStyle,
                      clipPath: computeClipMaskPath(clip),
                    }}
                    className={`absolute inset-0 w-full h-full object-contain cursor-move ${
                      isSelected ? 'ring-2 ring-sky-400' : ''
                    }`}
                  />
                );
              }

              if (clip.type === 'text' || clip.type === 'caption') {
                const st = {
                  ...DEFAULT_TEXT_STYLE,
                  ...(clip.textStyle || {}),
                };
                const presetInfo = VOICE_SYNC_CAPTION_FORMATS.find(
                  (f) => f.id === (st.captionPreset || 'Modern')
                );
                const rawText = clip.textContent || clip.name || 'Caption';
                const allWords = rawText.split(/\s+/).filter(Boolean);
                const clipProgress = Math.max(
                  0,
                  Math.min(0.9999, (playheadTime - clip.startTime) / Math.max(0.1, clip.duration))
                );
                const activeWordIndex = Math.min(
                  Math.max(0, allWords.length - 1),
                  Math.floor(clipProgress * Math.max(1, allWords.length))
                );

                // Resolve active spoken word color & pill styling (Yellow & Green formats prioritized)
                const resolvedActiveWordColor =
                  st.activeWordColor ||
                  presetInfo?.activeWordColor ||
                  (st.captionPreset === 'GreenVoiceSync' ||
                  st.captionPreset === 'MultilineGreenSync' ||
                  st.captionPreset === 'YellowGreenMultiline'
                    ? '#22C55E'
                    : '#FACC15');

                const resolvedActiveWordBg =
                  st.activeWordBgColor || presetInfo?.activeWordBgColor;

                const resolvedActiveWordGlow =
                  st.activeWordGlowColor || presetInfo?.activeWordGlowColor;

                const activeScaleBoost = st.activeWordScale || 1.16;
                const isSingleWordPop =
                  st.captionPreset === 'SingleWordYellowGreen' || presetInfo?.isSingleWordPop;

                const isMultilinePreset =
                  presetInfo?.isMultiline ||
                  st.captionPreset === 'Multiline' ||
                  st.captionPreset === 'YellowGreenMultiline' ||
                  st.captionPreset === 'MultilineYellowSync' ||
                  st.captionPreset === 'MultilineGreenSync' ||
                  rawText.includes('\n') ||
                  rawText.includes('|');

                // Build lines array while preserving global word index across all lines
                const explicitLines = rawText
                  .split(/\n|\|/)
                  .map((l) => l.trim())
                  .filter(Boolean);
                const linesText: string[] =
                  explicitLines.length > 1
                    ? explicitLines
                    : isMultilinePreset && allWords.length > 2
                    ? [
                        allWords.slice(0, Math.ceil(allWords.length / 2)).join(' '),
                        allWords.slice(Math.ceil(allWords.length / 2)).join(' '),
                      ]
                    : [rawText];

                // Map each line to its words with their exact global word index
                let runningWordCounter = 0;
                const structuredLines = linesText.map((lineStr, lineIdx) => {
                  const lineWords = lineStr.split(/\s+/).filter(Boolean);
                  const mapped = lineWords.map((w) => {
                    const globalIdx = runningWordCounter++;
                    return { word: w, globalIdx, lineIdx };
                  });
                  return mapped;
                });

                // Helper to render an individual word with voice-sync highlight + word-to-word custom override
                const renderSyncedWord = (wordObj: {
                  word: string;
                  globalIdx: number;
                  lineIdx: number;
                }) => {
                  const { word, globalIdx, lineIdx } = wordObj;
                  const isCurrentSpoken = globalIdx === activeWordIndex;
                  const wordCustom = st.wordStyles?.[globalIdx];

                  // Base color for all non-spoken words stays the same (or custom word color if user styled that word)
                  let nonActiveBaseColor = wordCustom?.color || st.color || '#FFFFFF';
                  if (st.captionPreset === 'YellowGreenMultiline' && !wordCustom?.color) {
                    // In Yellow & Green Multiline, non-active words stay crisp White while active spoken word alternates Yellow/Green
                    nonActiveBaseColor = st.color || '#FFFFFF';
                  }

                  // Active spoken word color according to voice
                  let spokenColor = resolvedActiveWordColor;
                  if (st.captionPreset === 'YellowGreenMultiline') {
                    spokenColor = lineIdx % 2 === 0 ? '#FACC15' : '#22C55E';
                  } else if (st.captionPreset === 'SingleWordYellowGreen') {
                    spokenColor = globalIdx % 2 === 0 ? '#FACC15' : '#22C55E';
                  }

                  const finalWordColor = isCurrentSpoken ? spokenColor : nonActiveBaseColor;
                  const finalWordBg = isCurrentSpoken
                    ? resolvedActiveWordBg || wordCustom?.bgColor
                    : wordCustom?.bgColor;

                  const wordScale =
                    (wordCustom?.scale || 1) * (isCurrentSpoken ? activeScaleBoost : 1);

                  const wordGlow = isCurrentSpoken
                    ? resolvedActiveWordGlow || wordCustom?.glowColor
                    : wordCustom?.glowColor;

                  return (
                    <span
                      key={globalIdx}
                      style={{
                        color: finalWordColor,
                        backgroundColor: finalWordBg || 'transparent',
                        padding: finalWordBg ? '1px 7px' : undefined,
                        borderRadius: finalWordBg ? '6px' : undefined,
                        fontFamily: wordCustom?.fontFamily || st.fontFamily || 'Plus Jakarta Sans',
                        fontWeight:
                          wordCustom?.bold !== undefined
                            ? wordCustom.bold
                              ? 800
                              : 400
                            : isCurrentSpoken
                            ? 800
                            : st.fontWeight || '700',
                        fontStyle:
                          wordCustom?.italic !== undefined
                            ? wordCustom.italic
                              ? 'italic'
                              : 'normal'
                            : st.italic
                            ? 'italic'
                            : 'normal',
                        textDecoration:
                          wordCustom?.underline !== undefined
                            ? wordCustom.underline
                              ? 'underline'
                              : 'none'
                            : st.underline
                            ? 'underline'
                            : 'none',
                        WebkitTextStroke:
                          wordCustom?.strokeColor && (st.strokeWidth ?? 2) > 0
                            ? `${st.strokeWidth ?? 2}px ${wordCustom.strokeColor}`
                            : undefined,
                        textShadow: wordGlow
                          ? `0 0 14px ${wordGlow}, 0 0 26px ${wordGlow}, 0 2px 6px rgba(0,0,0,0.95)`
                          : isCurrentSpoken
                          ? `0 0 12px ${spokenColor}88, 0 2px 6px rgba(0,0,0,0.95)`
                          : undefined,
                        transform: `scale(${wordScale.toFixed(2)})`,
                      }}
                      className="inline-block transition-all duration-75"
                    >
                      {word}
                    </span>
                  );
                };

                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      onSelectClip(clip.id, false);
                      setDraggingCanvasClip({
                        clipId: clip.id,
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialPosX: posX,
                        initialPosY: posY,
                        initialScale: clip.scaleX || 100,
                      });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setInlineEditingClipId(clip.id);
                      setInlineTextDraft(clip.textContent || clip.name || '');
                    }}
                    style={{
                      ...commonStyle,
                      fontFamily: st.fontFamily || 'Plus Jakarta Sans',
                      fontSize: `${Math.round((st.fontSize || 38) * 0.65)}px`,
                      fontWeight: st.fontWeight || '700',
                      fontStyle: st.italic ? 'italic' : 'normal',
                      textDecoration: st.underline ? 'underline' : 'none',
                      textAlign: st.align || 'center',
                      letterSpacing: `${st.letterSpacing ?? 0}px`,
                      lineHeight: st.lineHeight ?? 1.25,
                      color: st.color || '#FFFFFF',
                      WebkitTextStroke:
                        (st.strokeWidth ?? 2) > 0
                          ? `${st.strokeWidth ?? 2}px ${st.strokeColor || '#000000'}`
                          : undefined,
                      textShadow:
                        (st.shadowBlur ?? 8) > 0
                          ? `${st.shadowOffsetX ?? 0}px ${st.shadowOffsetY ?? 2}px ${
                              st.shadowBlur ?? 8
                            }px ${st.shadowColor || '#000000'}`
                          : undefined,
                      backgroundColor:
                        (st.backgroundOpacity ?? 0) > 0
                          ? `${st.backgroundColor || '#0F172A'}${Math.round(
                              ((st.backgroundOpacity ?? 0) / 100) * 255
                            )
                              .toString(16)
                              .padStart(2, '0')}`
                          : 'transparent',
                      padding: `${st.padding ?? 10}px`,
                      borderRadius: `${st.cornerRadius ?? 6}px`,
                    }}
                    className={`absolute cursor-move select-none z-30 max-w-[92%] group ${
                      isSelected ? 'ring-2 ring-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.35)]' : ''
                    }`}
                    title="Drag to move · Corner handle to scale · Double-click to edit text/word colors"
                  >
                    {/* 4 Corner On-Canvas Scale Handles when Selected */}
                    {isSelected && (
                      <>
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingCanvasClip({
                              clipId: clip.id,
                              mode: 'scale',
                              startX: e.clientX,
                              startY: e.clientY,
                              initialPosX: posX,
                              initialPosY: posY,
                              initialScale: clip.scaleX || 100,
                            });
                          }}
                          className="w-3 h-3 bg-sky-400 border border-slate-950 rounded-full absolute -top-1.5 -right-1.5 cursor-nwse-resize z-50"
                          title="Drag to Scale"
                        />
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingCanvasClip({
                              clipId: clip.id,
                              mode: 'scale',
                              startX: e.clientX,
                              startY: e.clientY,
                              initialPosX: posX,
                              initialPosY: posY,
                              initialScale: clip.scaleX || 100,
                            });
                          }}
                          className="w-3 h-3 bg-sky-400 border border-slate-950 rounded-full absolute -bottom-1.5 -right-1.5 cursor-nwse-resize z-50"
                          title="Drag to Scale"
                        />
                      </>
                    )}

                    {/* 1-Word Pop Format vs Multiline Voice Sync vs Single-Line Voice Sync */}
                    {isSingleWordPop && allWords.length > 0 ? (
                      <div className="inline-flex items-center justify-center px-3 py-1">
                        {renderSyncedWord({
                          word: allWords[activeWordIndex] || allWords[0],
                          globalIdx: activeWordIndex,
                          lineIdx: 0,
                        })}
                      </div>
                    ) : isMultilinePreset && structuredLines.length > 1 ? (
                      <div className="flex flex-col items-center gap-1.5">
                        {structuredLines.map((lineWordObjs, lIdx) => {
                          const hasActiveWordInLine = lineWordObjs.some(
                            (w) => w.globalIdx === activeWordIndex
                          );
                          return (
                            <div
                              key={lIdx}
                              style={{
                                transform: hasActiveWordInLine ? 'scale(1.03)' : 'scale(0.98)',
                              }}
                              className="px-3 py-1 rounded-md bg-slate-950/75 border border-white/10 inline-flex flex-wrap items-center justify-center gap-x-2 transition-transform duration-100"
                            >
                              {lineWordObjs.map((wObj) => renderSyncedWord(wObj))}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                        {structuredLines.flat().map((wObj) => renderSyncedWord(wObj))}
                      </span>
                    )}
                  </div>
                );
              }

              if (clip.type === 'sticker') {
                const catalogMatch = ONLINE_STICKER_PACK_CATALOG.find(
                  (s) => s.shape === clip.stickerShape
                );
                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      onSelectClip(clip.id, false);
                      setDraggingCanvasClip({
                        clipId: clip.id,
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialPosX: posX,
                        initialPosY: posY,
                        initialScale: clip.scaleX || 100,
                      });
                    }}
                    style={{ ...commonStyle, color: clip.stickerColor || '#38BDF8' }}
                    className={`absolute p-3 cursor-move z-20 ${
                      isSelected ? 'ring-2 ring-sky-400 rounded' : ''
                    }`}
                  >
                    {catalogMatch?.glyph ? (
                      <span className="text-6xl leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)] select-none">
                        {catalogMatch.glyph}
                      </span>
                    ) : clip.stickerShape === 'emoji-fire' ? (
                      <Flame className="w-16 h-16 fill-current" />
                    ) : clip.stickerShape === 'emoji-star' ? (
                      <Star className="w-16 h-16 fill-current" />
                    ) : clip.stickerShape === 'emoji-clap' ? (
                      <ThumbsUp className="w-16 h-16 fill-current" />
                    ) : clip.stickerShape === 'arrow-right' ? (
                      <ArrowRight className="w-20 h-20 stroke-[3]" />
                    ) : clip.stickerShape === 'callout' ? (
                      <MessageCircle className="w-20 h-20 stroke-[2.5]" />
                    ) : clip.stickerShape === 'circle' ? (
                      <div className="w-20 h-20 rounded-full border-4 border-current" />
                    ) : clip.stickerShape === 'circle-dashed' ? (
                      <div className="w-20 h-20 rounded-full border-4 border-dashed border-current" />
                    ) : clip.stickerShape === 'circle-neon-glow' ? (
                      <div className="w-20 h-20 rounded-full border-4 border-current shadow-[0_0_20px_currentColor]" />
                    ) : clip.stickerShape === 'circle-crosshair' ? (
                      <div className="w-20 h-20 rounded-full border-4 border-current flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-current" />
                      </div>
                    ) : clip.stickerShape === 'circle-double' ? (
                      <div className="w-20 h-20 rounded-full border-4 border-current flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full border-2 border-current" />
                      </div>
                    ) : clip.stickerShape === 'circle-dotted' ? (
                      <div className="w-20 h-20 rounded-full border-4 border-dotted border-current" />
                    ) : clip.stickerShape === 'circle-radar' ? (
                      <div className="w-20 h-20 rounded-full bg-current/20 border-4 border-current flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-current" />
                      </div>
                    ) : clip.stickerShape === 'rectangle' ? (
                      <div className="w-28 h-16 border-4 border-current rounded" />
                    ) : clip.stickerShape === 'shape-triangle' ? (
                      <div
                        style={{
                          clipPath: 'polygon(50% 8%, 95% 92%, 5% 92%)',
                          backgroundColor: clip.stickerColor || '#F43F5E',
                        }}
                        className="w-20 h-20"
                      />
                    ) : clip.stickerShape === 'shape-diamond' ? (
                      <div
                        style={{
                          clipPath: 'polygon(50% 5%, 95% 50%, 50% 95%, 5% 50%)',
                          backgroundColor: clip.stickerColor || '#06B6D4',
                        }}
                        className="w-20 h-20"
                      />
                    ) : clip.stickerShape === 'shape-hexagon' ? (
                      <div
                        style={{
                          clipPath: 'polygon(25% 5%, 75% 5%, 98% 50%, 75% 95%, 25% 95%, 2% 50%)',
                          backgroundColor: clip.stickerColor || '#A855F7',
                        }}
                        className="w-20 h-20"
                      />
                    ) : clip.stickerShape === 'shape-octagon' ? (
                      <div
                        style={{
                          clipPath:
                            'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                          backgroundColor: clip.stickerColor || '#EF4444',
                        }}
                        className="w-20 h-20"
                      />
                    ) : clip.stickerShape === 'shape-starburst' ? (
                      <span className="text-6xl leading-none">✸</span>
                    ) : clip.stickerShape === 'shape-pentagon' ? (
                      <div
                        style={{
                          clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
                          backgroundColor: clip.stickerColor || '#10B981',
                        }}
                        className="w-20 h-20"
                      />
                    ) : clip.stickerShape === 'shape-shield' ? (
                      <div
                        style={{
                          clipPath: 'polygon(50% 0%, 100% 20%, 85% 80%, 50% 100%, 15% 80%, 0% 20%)',
                          backgroundColor: clip.stickerColor || '#3B82F6',
                        }}
                        className="w-20 h-20"
                      />
                    ) : clip.stickerShape === 'line' ? (
                      <div className="w-36 h-1.5 bg-current rounded" />
                    ) : clip.stickerShape === 'neon-heart' ? (
                      <Heart className="w-16 h-16 fill-current drop-shadow-[0_0_12px_rgba(244,63,94,0.85)]" />
                    ) : clip.stickerShape === 'sparkle-burst' ? (
                      <Sparkles className="w-16 h-16 fill-current drop-shadow-[0_0_12px_rgba(250,204,21,0.85)]" />
                    ) : clip.stickerShape === 'check-shield' ? (
                      <ShieldCheck className="w-16 h-16 fill-current/20 stroke-[2.5]" />
                    ) : clip.stickerShape === 'cinema-clap' ? (
                      <Clapperboard className="w-16 h-16 stroke-[2.2]" />
                    ) : clip.stickerShape === 'subscribe-pill' ? (
                      <div className="px-4 py-1.5 bg-rose-600 text-white font-bold text-sm rounded-full shadow-lg flex items-center gap-1.5 border border-white/30">
                        <span>SUBSCRIBE ▶</span>
                      </div>
                    ) : clip.stickerShape === 'rec-badge' ? (
                      <div className="px-3 py-1 bg-black/80 text-rose-500 font-mono font-bold text-xs rounded border border-rose-500/60 flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 animate-pulse" />
                        <span>REC ●</span>
                      </div>
                    ) : clip.stickerShape === 'badge-live' ? (
                      <div className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded shadow-lg border border-white/30">
                        ● LIVE STREAM
                      </div>
                    ) : clip.stickerShape === 'badge-like-bell' ? (
                      <div className="px-3.5 py-1 bg-sky-500 text-slate-950 font-bold text-xs rounded-full shadow-lg">
                        👍 LIKE & 🔔 BELL
                      </div>
                    ) : clip.stickerShape === 'badge-new' ? (
                      <div className="px-3 py-1 bg-amber-400 text-slate-950 font-bold text-xs rounded shadow-lg">
                        ★ NEW EPISODE
                      </div>
                    ) : clip.stickerShape === 'badge-4k' ? (
                      <div className="px-3 py-1 bg-slate-900 text-white font-mono font-bold text-xs rounded border border-white/40">
                        4K ULTRA HD
                      </div>
                    ) : clip.stickerShape === 'custom-shape' ? (
                      clip.customSvgDataUrl ? (
                        <img
                          src={clip.customSvgDataUrl}
                          alt={clip.name}
                          className="w-24 h-24 object-contain"
                        />
                      ) : (
                        <div
                          style={{
                            clipPath: `polygon(${
                              clip.customPolygonPoints ||
                              '50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%'
                            })`,
                            backgroundColor: clip.stickerColor || '#38BDF8',
                          }}
                          className="w-24 h-24 shadow-lg"
                        />
                      )
                    ) : (
                      <div className="px-3 py-1.5 bg-slate-900/90 border-2 border-current rounded-lg shadow-lg flex items-center gap-1.5">
                        <Sparkles className="w-5 h-5" />
                        <span className="font-bold text-sm">{clip.name}</span>
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })}

          {/* Vignette Overlay */}
          {!bypassEffects &&
            activeVisualClips.some(
              (c) => c.adjustments.vignette > 0 || c.effects?.includes('Vignette')
            ) && (
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.82) 100%)',
                }}
              />
            )}

          {/* Film Grain / Noise Overlay */}
          {!bypassEffects &&
            activeVisualClips.some(
              (c) => c.effects?.includes('Film Grain') || c.effects?.includes('Noise')
            ) && (
              <div
                className="absolute inset-0 pointer-events-none z-10 opacity-20 mix-blend-overlay"
                style={{
                  backgroundImage: 'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 0)',
                  backgroundSize: '4px 4px',
                }}
              />
            )}

          {/* Dip to White Flash Overlay */}
          {!bypassEffects &&
            activeVisualClips.some(
              (c) =>
                c.transitionIn.type === 'Dip to White' &&
                playheadTime - c.startTime < c.transitionIn.duration
            ) && (
              <div
                className="absolute inset-0 bg-white pointer-events-none z-10"
                style={{
                  opacity: Math.max(
                    0,
                    1 -
                      (playheadTime - activeVisualClips[0].startTime) /
                        Math.max(0.1, activeVisualClips[0].transitionIn.duration)
                  ),
                }}
              />
            )}

          {activeVisualClips.length === 0 && (
            <div className="text-center space-y-1.5 pointer-events-none px-4">
              <p className="text-xs font-medium text-slate-400">No Active Visual Clip at Playhead</p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                {formatTimecode(playheadTime, fps)}
              </p>
            </div>
          )}

          {/* In-Monitor Rendered Video Player Overlay when Quick Render completes */}
          {quickRenderState.status === 'ready' && quickRenderState.videoUrl && (
            <div className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col items-center justify-center p-3 gap-2">
              <div className="w-full flex items-center justify-between px-2">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Rendered Video Preview Ready</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <a
                    href={quickRenderState.videoUrl}
                    download={`Rendered_Preview_${Date.now()}.webm`}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded text-[11px] flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Save Video
                  </a>
                  <button
                    type="button"
                    onClick={() => setQuickRenderState({ status: 'idle', progress: 0 })}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Back to Live Canvas
                  </button>
                </div>
              </div>
              <video
                src={quickRenderState.videoUrl}
                controls
                autoPlay
                className="flex-1 w-full max-h-[82%] object-contain rounded border border-slate-800 bg-black"
              />
            </div>
          )}
        </div>
      </div>

      {/* Interactive Full-Width Draggable Progress & Caption Marker Scrubber Bar */}
      <div
        ref={scrubberBarRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
          setHoverScrubTime(ratio * totalProjectDuration);
        }}
        onMouseLeave={() => {
          if (!isScrubbingBar) setHoverScrubTime(null);
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
          setIsPlaying(false);
          setPlayheadTime(ratio * totalProjectDuration);
          setIsScrubbingBar(true);
        }}
        className="h-3.5 bg-slate-950 border-t border-slate-800/90 relative cursor-pointer group shrink-0 flex items-center px-0"
        title="Click or Drag to Scrub Video Timeline"
      >
        {/* Background Track */}
        <div className="w-full h-1.5 bg-slate-900 relative overflow-hidden">
          {/* Caption Markers on Scrubber */}
          {clips
            .filter((c) => c.type === 'caption')
            .map((cap) => {
              const leftPct = (cap.startTime / Math.max(0.1, totalProjectDuration)) * 100;
              const widthPct = (cap.duration / Math.max(0.1, totalProjectDuration)) * 100;
              return (
                <div
                  key={cap.id}
                  style={{ left: `${leftPct}%`, width: `${Math.max(0.5, widthPct)}%` }}
                  className="absolute top-0 bottom-0 bg-amber-400/50"
                />
              );
            })}
          {/* Active Playhead Fill */}
          <div
            style={{
              width: `${Math.min(100, (playheadTime / Math.max(0.1, totalProjectDuration)) * 100)}%`,
            }}
            className="h-full bg-gradient-to-r from-sky-500 to-emerald-400"
          />
        </div>

        {/* Playhead Knob */}
        <div
          style={{
            left: `${Math.min(100, (playheadTime / Math.max(0.1, totalProjectDuration)) * 100)}%`,
          }}
          className="w-3 h-3 rounded-full bg-sky-400 border-2 border-slate-950 shadow -translate-x-1/2 absolute pointer-events-none"
        />

        {/* Hover Time Tooltip */}
        {hoverScrubTime !== null && (
          <div
            style={{
              left: `${Math.min(94, Math.max(6, (hoverScrubTime / Math.max(0.1, totalProjectDuration)) * 100))}%`,
            }}
            className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-sky-300 pointer-events-none shadow"
          >
            {formatTimecode(hoverScrubTime, fps)}
          </div>
        )}
      </div>

      {/* Bottom Studio Transport Deck */}
      <div className="min-h-10 px-3 py-1 bg-[#0F172A] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: High-Precision Timecode & Active Clip Info */}
        <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
          <span className="text-sky-400 font-semibold">{formatTimecode(playheadTime, fps)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTimecode(totalProjectDuration, fps)}</span>
        </div>

        {/* Center: Transport Controls (Prev Frame, Play/Pause, Stop, Next Frame, Loop, Speed) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => handleStepFrame(-1, e.shiftKey)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Previous Frame (Left Arrow) · Hold Shift for -1s (Shift+Left)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              if (!isPlaying && lastClipEndTime > 0 && playheadTime >= lastClipEndTime - 0.05) {
                setPlayheadTime(0);
              }
              setIsPlaying(!isPlaying);
            }}
            className="w-8 h-8 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-full flex items-center justify-center transition-colors shadow"
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setPlayheadTime(0);
            }}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Stop and Return to Start"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            onClick={(e) => handleStepFrame(1, e.shiftKey)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Next Frame (Right Arrow) · Hold Shift for +1s (Shift+Right)"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setLoopPlayback((l) => !l)}
            className={`p-1.5 rounded transition-colors ${
              loopPlayback
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Toggle Loop Playback"
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          {/* Playback Speed Rate Selector */}
          <select
            value={playbackSpeedRate}
            onChange={(e) => setPlaybackSpeedRate(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-300"
            title="Monitor Playback Rate"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x</option>
          </select>
        </div>

        {/* Right: Master Monitor Audio Volume & Scrubber */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMasterMuted((m) => !m)}
            className={`p-1 rounded ${
              masterMuted || masterVolume === 0
                ? 'text-rose-400 bg-rose-500/15'
                : 'text-slate-300 hover:text-white'
            }`}
            title={masterMuted ? 'Unmute Monitor' : 'Mute Monitor'}
          >
            {masterMuted || masterVolume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={masterMuted ? 0 : masterVolume}
            onChange={(e) => {
              setMasterMuted(false);
              setMasterVolume(Number(e.target.value));
            }}
            className="w-16 accent-sky-500 h-1 bg-slate-800 rounded cursor-pointer"
            title={`Master Monitor Volume: ${masterMuted ? 0 : masterVolume}%`}
          />
        </div>
      </div>
    </div>
  );
};
