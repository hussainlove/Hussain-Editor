import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import {
  TimelineTrack,
  TimelineClip,
  AspectRatioOption,
  PreviewResolutionOption,
  ONLINE_STICKER_PACK_CATALOG,
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
}) => {
  const monitorContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const [draggingCanvasClip, setDraggingCanvasClip] = useState<{
    clipId: string;
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
  } | null>(null);

  // Exact end time of the last clip on the timeline (no extra blank space)
  const lastClipEndTime = clips.reduce(
    (max, c) => Math.max(max, Math.round((c.startTime + c.duration) * 100) / 100),
    0
  );
  const totalProjectDuration = lastClipEndTime > 0 ? lastClipEndTime : 5;

  // Sync HTML5 video/audio elements with playheadTime & playback state
  useEffect(() => {
    const anySolo = tracks.some((t) => t.solo);

    clips.forEach((clip) => {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track) return;

      const isActive =
        playheadTime >= clip.startTime && playheadTime <= clip.startTime + clip.duration;
      const targetMediaTime = Math.max(
        0,
        clip.trimStart + (playheadTime - clip.startTime) * clip.speed
      );

      const isTrackAudible =
        !track.muted && !clip.muted && (!anySolo || track.solo);
      const interpolatedVol = evaluateKeyframedProperty(clip, 'volume', playheadTime);
      const effectiveVolume = isTrackAudible
        ? Math.min(1, Math.max(0, (interpolatedVol / 100) * 0.9))
        : 0;

      if (clip.type === 'video') {
        const vEl = videoRefs.current[clip.id];
        if (vEl) {
          vEl.volume = effectiveVolume;
          vEl.playbackRate = Math.max(0.25, Math.min(4.0, clip.speed));
          if (isActive) {
            if (Math.abs(vEl.currentTime - targetMediaTime) > 0.28) {
              vEl.currentTime = targetMediaTime;
            }
            if (isPlaying && vEl.paused) {
              vEl.play().catch(() => {});
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
          aEl.playbackRate = Math.max(0.25, Math.min(4.0, clip.speed));
          if (isActive) {
            if (Math.abs(aEl.currentTime - targetMediaTime) > 0.28) {
              aEl.currentTime = targetMediaTime;
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
  }, [playheadTime, isPlaying, clips, tracks]);

  // RequestAnimationFrame playback loop — stops automatically at the exact end of the project clips
  // and automatically restarts from 00:00:00:00 if Play is triggered when already at the end
  useEffect(() => {
    if (!isPlaying) return;
    if (lastClipEndTime <= 0) {
      setIsPlaying(false);
      return;
    }

    // If playhead is already at the end when Play is triggered, reset to 0 immediately
    setPlayheadTime((current) => (current >= lastClipEndTime - 0.05 ? 0 : current));

    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setPlayheadTime((prev) => {
        const next = prev + dt;
        if (next >= lastClipEndTime) {
          setIsPlaying(false);
          return lastClipEndTime;
        }
        return next;
      });
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, lastClipEndTime, setPlayheadTime, setIsPlaying]);

  const handleStepFrame = (direction: -1 | 1) => {
    setIsPlaying(false);
    const frameDur = 1 / (fps || 30);
    setPlayheadTime((prev) => Math.max(0, Math.round((prev + direction * frameDur) * 1000) / 1000));
  };

  const handleFullscreen = () => {
    if (monitorContainerRef.current?.requestFullscreen) {
      monitorContainerRef.current.requestFullscreen().catch(() => {});
    }
  };

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

  const aspectBoxStyle = (): React.CSSProperties => {
    if (aspectRatio === '9:16') return { aspectRatio: '9 / 16', height: '88%' };
    if (aspectRatio === '1:1') return { aspectRatio: '1 / 1', height: '86%' };
    if (aspectRatio === '4:5') return { aspectRatio: '4 / 5', height: '86%' };
    return { aspectRatio: '16 / 9', width: '88%', maxHeight: '88%' };
  };

  return (
    <div
      ref={monitorContainerRef}
      onMouseMove={(e) => {
        if (!draggingCanvasClip) return;
        const dx = e.clientX - draggingCanvasClip.startX;
        const dy = e.clientY - draggingCanvasClip.startY;
        onUpdateClipTransformDrag(
          draggingCanvasClip.clipId,
          Math.round(draggingCanvasClip.initialPosX + dx),
          Math.round(draggingCanvasClip.initialPosY + dy)
        );
      }}
      onMouseUp={() => setDraggingCanvasClip(null)}
      onMouseLeave={() => setDraggingCanvasClip(null)}
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

      {/* Top Preview Header Bar */}
      <div className="h-9 px-3 border-b border-slate-800/80 flex items-center justify-between text-xs bg-[#0F172A]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">Program Monitor</span>
          <span className="text-slate-500">·</span>
          <span className="text-[11px] font-mono text-slate-400">
            {aspectRatio} ({previewResolution})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[11px]">
            {(['16:9', '9:16', '1:1', '4:5'] as AspectRatioOption[]).map((ar) => (
              <button
                key={ar}
                onClick={() => setAspectRatio(ar)}
                className={`px-1.5 py-0.5 rounded font-mono transition-colors ${
                  aspectRatio === ar ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>

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

      {/* Center Compositor Viewport */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative bg-[#06090F]">
        <div
          style={aspectBoxStyle()}
          className="relative bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex items-center justify-center"
        >
          {/* Keep all video elements mounted for instant scrubbing */}
          {clips
            .filter((c) => c.type === 'video' && c.url)
            .map((clip) => {
              const isVisible = activeVisualClips.some((ac) => ac.id === clip.id);
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
                if (tType === 'Fade' || tType === 'Cross Dissolve' || tType === 'Dip to Black' || tType === 'Dip to White' || tType === 'Film Burn') {
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
                if (loopName.includes('Pulse') || loopName.includes('Heartbeat') || loopName.includes('Bass') || loopName.includes('Breathe')) {
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
              const baseFilter = computeClipFilterStyle(clip);
              const combinedFilter =
                transBlur > 0.2
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
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectClip(clip.id, false);
                    setDraggingCanvasClip({
                      clipId: clip.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      initialPosX: posX,
                      initialPosY: posY,
                    });
                  }}
                  style={{
                    display: isVisible ? 'block' : 'none',
                    transform: `translate(${posX + transTranslateX}px, ${posY + loopTranslateY}px) rotate(${rot + loopRotate}deg) scale(${flipScaleX}, ${flipScaleY})`,
                    opacity,
                    filter: combinedFilter,
                    mixBlendMode: clip.blendMode,
                    clipPath,
                  }}
                  className={`absolute max-w-full max-h-full object-contain cursor-move ${
                    isSelected ? 'ring-2 ring-sky-400' : ''
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
                else if (clip.animationIn.includes('Zoom') || clip.animationIn.includes('Pop') || clip.animationIn.includes('Elastic')) {
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
                if (loopAnim.includes('Pulse') || loopAnim.includes('Heartbeat') || loopAnim.includes('Bass') || loopAnim.includes('Breathe')) {
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
                filter: computeClipFilterStyle(clip),
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
                      e.stopPropagation();
                      onSelectClip(clip.id, false);
                      setDraggingCanvasClip({
                        clipId: clip.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        initialPosX: posX,
                        initialPosY: posY,
                      });
                    }}
                    style={{
                      ...commonStyle,
                      clipPath: computeClipMaskPath(clip),
                    }}
                    className={`absolute max-w-full max-h-full object-contain cursor-move ${
                      isSelected ? 'ring-2 ring-sky-400' : ''
                    }`}
                  />
                );
              }

              if ((clip.type === 'text' || clip.type === 'caption') && clip.textStyle) {
                const st = clip.textStyle;
                const rawText = clip.textContent || clip.name;
                const words = rawText.split(/\s+/).filter(Boolean);
                const clipProgress = Math.max(
                  0,
                  Math.min(1, (playheadTime - clip.startTime) / Math.max(0.1, clip.duration))
                );
                const activeWordIndex = Math.floor(clipProgress * words.length);
                const isWordGlowing = st.captionPreset === 'WordGlowing';
                const isMultiline =
                  st.captionPreset === 'Multiline' ||
                  rawText.includes('\n') ||
                  rawText.includes('|');
                const isKaraokeMode =
                  isWordGlowing ||
                  (clip.type === 'caption' &&
                    (st.captionPreset === 'Karaoke' ||
                      st.captionPreset === 'Highlight' ||
                      rawText.includes('♪')));

                // Build multiline segments if Multiline preset or explicit line breaks
                const explicitLines = rawText
                  .split(/\n|\|/)
                  .map((l) => l.trim())
                  .filter(Boolean);
                const multilineSegments: string[] =
                  explicitLines.length > 1
                    ? explicitLines
                    : isMultiline && words.length > 2
                    ? [
                        words.slice(0, Math.ceil(words.length / 2)).join(' '),
                        words.slice(Math.ceil(words.length / 2)).join(' '),
                      ]
                    : [rawText];
                const activeLineIdx = Math.min(
                  multilineSegments.length - 1,
                  Math.floor(clipProgress * multilineSegments.length)
                );

                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectClip(clip.id, false);
                      setDraggingCanvasClip({
                        clipId: clip.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        initialPosX: posX,
                        initialPosY: posY,
                      });
                    }}
                    style={{
                      ...commonStyle,
                      fontFamily: st.fontFamily,
                      fontSize: `${Math.round(st.fontSize * 0.65)}px`,
                      fontWeight: st.fontWeight,
                      fontStyle: st.italic ? 'italic' : 'normal',
                      textDecoration: st.underline ? 'underline' : 'none',
                      textAlign: st.align,
                      color: st.color,
                      WebkitTextStroke: st.strokeWidth > 0 ? `${st.strokeWidth}px ${st.strokeColor}` : undefined,
                      textShadow: isWordGlowing
                        ? '0 0 14px #38BDF8, 0 0 28px #EC4899'
                        : st.shadowBlur > 0
                        ? `0 2px ${st.shadowBlur}px ${st.shadowColor}`
                        : undefined,
                      backgroundColor:
                        st.backgroundOpacity > 0
                          ? `${st.backgroundColor}${Math.round((st.backgroundOpacity / 100) * 255)
                              .toString(16)
                              .padStart(2, '0')}`
                          : 'transparent',
                      padding: `${st.padding}px`,
                      borderRadius: `${st.cornerRadius}px`,
                    }}
                    className={`absolute cursor-move select-none z-20 ${
                      clip.type === 'caption' ? 'bottom-7 max-w-[90%]' : ''
                    } ${isSelected ? 'ring-2 ring-sky-400' : ''}`}
                  >
                    {isMultiline && multilineSegments.length > 1 ? (
                      <div className="flex flex-col items-center gap-1">
                        {multilineSegments.map((lineStr, lIdx) => {
                          const isCurrLine = lIdx === activeLineIdx;
                          return (
                            <div
                              key={lIdx}
                              style={{
                                color: isCurrLine ? '#38BDF8' : '#FFFFFF',
                                textShadow: isCurrLine
                                  ? '0 0 16px rgba(56,189,248,0.9), 0 2px 6px rgba(0,0,0,0.9)'
                                  : '0 2px 4px rgba(0,0,0,0.8)',
                                transform: isCurrLine ? 'scale(1.06)' : 'scale(0.96)',
                              }}
                              className="px-2.5 py-0.5 rounded bg-slate-950/75 border border-white/10 transition-transform duration-150"
                            >
                              {lineStr}
                            </div>
                          );
                        })}
                      </div>
                    ) : isKaraokeMode ? (
                      <span className="inline-flex flex-wrap justify-center gap-x-1.5">
                        {words.map((word, wIdx) => {
                          const isCurrent = wIdx === activeWordIndex;
                          const isPast = wIdx < activeWordIndex;
                          return (
                            <span
                              key={wIdx}
                              style={{
                                color: isCurrent
                                  ? isWordGlowing
                                    ? '#F0ABFC'
                                    : '#FACC15'
                                  : isPast
                                  ? '#38BDF8'
                                  : '#FFFFFF',
                                textShadow:
                                  isWordGlowing && isCurrent
                                    ? '0 0 12px #E879F9, 0 0 24px #38BDF8, 0 0 36px #F43F5E'
                                    : isWordGlowing
                                    ? '0 0 8px rgba(56,189,248,0.75)'
                                    : undefined,
                                transform: isCurrent ? 'scale(1.15)' : 'scale(1)',
                              }}
                              className="transition-transform duration-100 inline-block"
                            >
                              {word}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      rawText
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
                      e.stopPropagation();
                      onSelectClip(clip.id, false);
                      setDraggingCanvasClip({
                        clipId: clip.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        initialPosX: posX,
                        initialPosY: posY,
                      });
                    }}
                    style={{ ...commonStyle, color: clip.stickerColor || '#38BDF8' }}
                    className={`absolute p-3 cursor-move z-20 ${isSelected ? 'ring-2 ring-sky-400 rounded' : ''}`}
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

          {/* Vignette Overlay if active clip has vignette > 0 or Vignette effect */}
          {activeVisualClips.some(
            (c) => c.adjustments.vignette > 0 || c.effects?.includes('Vignette')
          ) && (
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.82) 100%)',
              }}
            />
          )}

          {/* Film Grain / Noise Overlay if active clip has Film Grain or Noise effect */}
          {activeVisualClips.some(
            (c) => c.effects?.includes('Film Grain') || c.effects?.includes('Noise')
          ) && (
            <div
              className="absolute inset-0 pointer-events-none z-10 opacity-20 mix-blend-overlay"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 0)',
                backgroundSize: '4px 4px',
              }}
            />
          )}

          {/* Dip to White Flash Overlay */}
          {activeVisualClips.some(
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
            <div className="text-center space-y-1 pointer-events-none px-4">
              <p className="text-xs font-medium text-slate-500">No Active Visual Clip at Playhead</p>
              <p className="text-[11px] text-slate-600 font-mono tabular-nums">
                {formatTimecode(playheadTime, fps)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Transport Deck */}
      <div className="h-11 px-4 bg-[#0F172A] border-t border-slate-800 flex items-center justify-between">
        {/* Timecode Readout */}
        <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
          <span className="text-sky-400 font-semibold">{formatTimecode(playheadTime, fps)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTimecode(totalProjectDuration, fps)}</span>
        </div>

        {/* Transport Controls: Prev Frame, Play/Pause, Stop, Next Frame */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleStepFrame(-1)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Previous Frame (Left Arrow)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (!isPlaying && lastClipEndTime > 0 && playheadTime >= lastClipEndTime - 0.05) {
                setPlayheadTime(0);
              }
              setIsPlaying(!isPlaying);
            }}
            className="w-8 h-8 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-full flex items-center justify-center transition-colors"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
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
            onClick={() => handleStepFrame(1)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Next Frame (Right Arrow)"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Scrubber */}
        <div className="w-48 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={totalProjectDuration}
            step={0.05}
            value={playheadTime}
            onChange={(e) => {
              setIsPlaying(false);
              setPlayheadTime(Number(e.target.value));
            }}
            className="w-full accent-sky-500 h-1 bg-slate-800 rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
