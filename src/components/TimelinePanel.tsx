import React, { useRef, useState } from 'react';
import {
  Scissors,
  Copy,
  Trash2,
  Magnet,
  ZoomIn,
  ZoomOut,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Plus,
  Layers,
  Diamond,
  Undo2,
  Redo2,
  Pencil,
  Check,
  X,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Film,
  MousePointer,
  CheckSquare,
  Shuffle,
  MessageSquare,
  Type,
  GripVertical,
  Move,
  Upload,
  Wand2,
  Music,
  RotateCcw,
} from 'lucide-react';
import {
  TimelineTrack,
  TimelineClip,
  KeyframePoint,
  TextStyleConfig,
  BUILTIN_TRANSITIONS,
  BUILTIN_FONTS,
  BUILTIN_ANIMATIONS,
  BUILTIN_LOOP_ANIMATIONS,
  DEFAULT_TEXT_STYLE,
  isTrackCompatibleWithClip,
} from '../types/editor';
import { formatTimecode } from '../utils/editorMath';

export type TimelineToolbarItemId =
  | 'undo-redo'
  | 'split'
  | 'caption'
  | 'generate-caption'
  | 'font'
  | 'keyframe'
  | 'volume'
  | 'clip-ops'
  | 'tracks'
  | 'snap-zoom';

const DEFAULT_TOOLBAR_ORDER: TimelineToolbarItemId[] = [
  'undo-redo',
  'split',
  'caption',
  'generate-caption',
  'font',
  'keyframe',
  'volume',
  'clip-ops',
  'tracks',
  'snap-zoom',
];

interface TimelinePanelProps {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  setPlayheadTime: (t: number) => void;
  selectedClipIds: string[];
  onSelectClip: (clipId: string, multi: boolean) => void;
  onSetSelectedClipIds?: (ids: string[]) => void;
  onSelectAllClips?: () => void;
  onSelectAtPlayhead?: () => void;
  zoomPxPerSec: number;
  setZoomPxPerSec: (z: number) => void;
  snapEnabled: boolean;
  setSnapEnabled: (s: boolean) => void;
  onSplitAtPlayhead: () => void;
  onDeleteSelected: (ripple: boolean) => void;
  onDuplicateSelected: () => void;
  onGroupSelected: () => void;
  onToggleTrackProp: (trackId: string, prop: 'locked' | 'hidden' | 'muted' | 'solo') => void;
  onAddTrack: (type: 'video' | 'audio') => void;
  onUpdateClipTiming: (
    clipId: string,
    newStartTime: number,
    newDuration: number,
    newTrimStart: number,
    newTrackId?: string,
    batchUpdates?: Record<string, { startTime: number; trackId: string }>
  ) => void;
  onDropMediaOnTrack: (mediaId: string, trackId: string, dropTime: number) => void;
  onDropAssetOnTimeline?: (
    assetPayload: any,
    trackId: string,
    dropTime: number,
    targetClipId?: string
  ) => void;
  fps: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onAddKeyframeAtPlayhead?: (property?: KeyframePoint['property']) => void;
  onQuickVolumeChange?: (volume: number, toggleMute?: boolean) => void;
  onClipVolumeChange?: (clipId: string, newVolume: number) => void;
  onPencilQuickEdit?: (newTextOrName: string, preset?: 'WordGlowing' | 'Multiline') => void;
  onMoveClipVertical?: (clipId: string, direction: -1 | 1) => void;
  onSwapSelectedClips?: () => void;
  onMoveTrackVertical?: (trackId: string, direction: -1 | 1) => void;
  onApplyTransitionBetweenCuts?: (clipId: string, transitionType: string, duration: number) => void;
  availableFonts?: string[];
  onAddCustomFont?: (fontName: string, fontFile?: File) => void;
  onAddOrUpdateCaptionFull?: (options: {
    text: string;
    stylePreset: NonNullable<TextStyleConfig['captionPreset']>;
    fontFamily: string;
    fontSize: number;
    color: string;
    strokeColor: string;
    strokeWidth: number;
    shadowColor: string;
    shadowBlur: number;
    backgroundColor: string;
    backgroundOpacity: number;
    align: 'left' | 'center' | 'right';
    bold: boolean;
    italic: boolean;
    underline: boolean;
    positionPreset: 'bottom' | 'center' | 'top';
    animationIn: string;
    animationOut: string;
    animationLoop: string;
    duration: number;
    updateSelected?: boolean;
  }) => void;
  onAutoCaptions?: (style: string, mode?: 'lyrics' | 'speech') => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  tracks,
  clips,
  playheadTime,
  setPlayheadTime,
  selectedClipIds,
  onSelectClip,
  onSetSelectedClipIds,
  onSelectAllClips,
  onSelectAtPlayhead,
  zoomPxPerSec,
  setZoomPxPerSec,
  snapEnabled,
  setSnapEnabled,
  onSplitAtPlayhead,
  onDeleteSelected,
  onDuplicateSelected,
  onGroupSelected,
  onToggleTrackProp,
  onAddTrack,
  onUpdateClipTiming,
  onDropMediaOnTrack,
  onDropAssetOnTimeline,
  fps,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onAddKeyframeAtPlayhead,
  onQuickVolumeChange,
  onClipVolumeChange,
  onPencilQuickEdit,
  onMoveClipVertical,
  onSwapSelectedClips,
  onMoveTrackVertical,
  onApplyTransitionBetweenCuts,
  availableFonts = BUILTIN_FONTS,
  onAddCustomFont,
  onAddOrUpdateCaptionFull,
  onAutoCaptions,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const trackHeadersRef = useRef<HTMLDivElement>(null);
  const lanesContainerRef = useRef<HTMLDivElement>(null);
  const toolbarFontInputRef = useRef<HTMLInputElement>(null);

  const [kfProperty, setKfProperty] = useState<KeyframePoint['property']>('scaleX');
  const [showPencilPopover, setShowPencilPopover] = useState(false);
  const [pencilDraft, setPencilDraft] = useState('');
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [cutTransitionClipId, setCutTransitionClipId] = useState<string | null>(null);
  const [cutTransitionDuration, setCutTransitionDuration] = useState<number>(0.5);
  const [cutTransitionSearch, setCutTransitionSearch] = useState<string>('');

  // Dedicated "+ Caption" All-Options Studio Bar state
  const [showCaptionStudioBar, setShowCaptionStudioBar] = useState(false);
  const [capText, setCapText] = useState('Welcome to Hussain Video Editor\nGlowing Second Line');
  const [capPreset, setCapPreset] = useState<NonNullable<TextStyleConfig['captionPreset']>>('WordGlowing');
  const [capFontFamily, setCapFontFamily] = useState(DEFAULT_TEXT_STYLE.fontFamily);
  const [capFontSize, setCapFontSize] = useState(40);
  const [capColor, setCapColor] = useState('#FFFFFF');
  const [capStrokeColor, setCapStrokeColor] = useState('#000000');
  const [capStrokeWidth, setCapStrokeWidth] = useState(2);
  const [capShadowColor, setCapShadowColor] = useState('#38BDF8');
  const [capShadowBlur, setCapShadowBlur] = useState(14);
  const [capBgColor, setCapBgColor] = useState('#0F172A');
  const [capBgOpacity, setCapBgOpacity] = useState(75);
  const [capAlign, setCapAlign] = useState<'left' | 'center' | 'right'>('center');
  const [capBold, setCapBold] = useState(true);
  const [capItalic, setCapItalic] = useState(false);
  const [capUnderline, setCapUnderline] = useState(false);
  const [capPosition, setCapPosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [capAnimIn, setCapAnimIn] = useState('Pop');
  const [capAnimOut, setCapAnimOut] = useState('Fade Out');
  const [capAnimLoop, setCapAnimLoop] = useState('None');
  const [capDuration, setCapDuration] = useState(3.0);

  // Dedicated "+ Add Font" Popover state
  const [showAddFontBar, setShowAddFontBar] = useState(false);
  const [newFontNameDraft, setNewFontNameDraft] = useState('');

  // Freehand Arrangeable Timeline Toolbar state (Reorderable widgets + Freehand Floating X/Y Position)
  const [toolbarOrder, setToolbarOrder] = useState<TimelineToolbarItemId[]>(() => {
    try {
      const saved = localStorage.getItem('hve_timeline_toolbar_order_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [
            ...parsed.filter((id: any) => DEFAULT_TOOLBAR_ORDER.includes(id)),
            ...DEFAULT_TOOLBAR_ORDER.filter((id) => !parsed.includes(id)),
          ];
          return merged;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_TOOLBAR_ORDER;
  });
  const [draggingToolbarItem, setDraggingToolbarItem] = useState<TimelineToolbarItemId | null>(null);
  const [toolbarCustomizeMode, setToolbarCustomizeMode] = useState(false);
  const [isToolbarFreehand, setIsToolbarFreehand] = useState(false);
  const [toolbarDockEdge, setToolbarDockEdge] = useState<'top' | 'bottom'>('top');
  const [toolbarFreehandPos, setToolbarFreehandPos] = useState<{ x: number; y: number }>({
    x: 24,
    y: 8,
  });

  const saveToolbarOrder = (nextOrder: TimelineToolbarItemId[]) => {
    setToolbarOrder(nextOrder);
    try {
      localStorage.setItem('hve_timeline_toolbar_order_v1', JSON.stringify(nextOrder));
    } catch {
      // ignore
    }
  };

  const moveToolbarWidget = (itemId: TimelineToolbarItemId, dir: -1 | 1) => {
    const idx = toolbarOrder.indexOf(itemId);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= toolbarOrder.length) return;
    const next = [...toolbarOrder];
    const tmp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = tmp;
    saveToolbarOrder(next);
  };

  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  // Resolve target clip for toolbar Volume, Keyframe, Caption & Pencil controls
  const activeOrSelectedClip =
    clips.find((c) => selectedClipIds.includes(c.id)) ||
    clips.find((c) => playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration) ||
    clips[0] ||
    null;

  const currentToolbarVolume = activeOrSelectedClip ? activeOrSelectedClip.volume : 100;
  const currentToolbarMuted = activeOrSelectedClip ? activeOrSelectedClip.muted : false;

  const [dragState, setDragState] = React.useState<{
    clipId: string;
    mode: 'move' | 'trim-start' | 'trim-end';
    initialX: number;
    initialY: number;
    initialStart: number;
    initialDuration: number;
    initialTrimStart: number;
    initialTrackIdx: number;
    initialSelectedPositions?: Record<string, { startTime: number; trackIdx: number }>;
  } | null>(null);
  const [dragHoverTrackId, setDragHoverTrackId] = useState<string | null>(null);

  const totalTimelineSeconds = Math.max(
    60,
    Math.ceil(clips.reduce((acc, c) => Math.max(acc, c.startTime + c.duration), 20) + 15)
  );
  const timelineWidthPx = totalTimelineSeconds * zoomPxPerSec;

  const snapTime = (rawTime: number, excludeClipId?: string): number => {
    const clamped = Math.max(0, rawTime);
    if (!snapEnabled) return Math.round(clamped * 100) / 100;

    const thresholdSec = 8 / zoomPxPerSec;
    const candidates = [0, playheadTime];
    clips.forEach((c) => {
      if (c.id !== excludeClipId) {
        candidates.push(c.startTime, c.startTime + c.duration);
      }
    });

    for (const pt of candidates) {
      if (Math.abs(clamped - pt) <= thresholdSec) {
        return Math.round(pt * 100) / 100;
      }
    }
    return Math.round(clamped * 100) / 100;
  };

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = Math.max(0, clickX / zoomPxPerSec);
    setPlayheadTime(Math.round(newTime * 100) / 100);
  };

  // Global window mouse & touch listeners while dragging a clip:
  // Enforces that Audio clips stay strictly on Audio tracks and Video clips stay strictly on Video tracks
  React.useEffect(() => {
    if (!dragState) {
      setDragHoverTrackId(null);
      return;
    }

    const handlePointerMove = (clientX: number, clientY: number) => {
      const deltaX = clientX - dragState.initialX;
      const deltaSec = deltaX / zoomPxPerSec;

      if (dragState.mode === 'move') {
        const draggedClip = clips.find((c) => c.id === dragState.clipId);
        const nextStart = snapTime(dragState.initialStart + deltaSec, dragState.clipId);
        const actualDeltaSec = nextStart - dragState.initialStart;
        let nextTrackId: string | undefined;
        let compatibleStepDelta = 0;

        if (lanesContainerRef.current && tracks.length > 0 && draggedClip) {
          const lanesRect = lanesContainerRef.current.getBoundingClientRect();
          const relY = clientY - lanesRect.top;
          const rawTargetIdx = Math.max(0, Math.min(tracks.length - 1, Math.floor(relY / 44)));

          // Find all unlocked tracks compatible with this clip's type (audio -> audio, video -> video)
          const compatibleTrackIndices = tracks
            .map((t, idx) => ({ track: t, idx }))
            .filter(
              ({ track }) =>
                !track.locked && isTrackCompatibleWithClip(track.type, draggedClip.type)
            );

          if (compatibleTrackIndices.length > 0) {
            // Pick the compatible track closest to rawTargetIdx so dragging up/down stays strictly on its own track type
            let closest = compatibleTrackIndices[0];
            for (const item of compatibleTrackIndices) {
              if (Math.abs(item.idx - rawTargetIdx) < Math.abs(closest.idx - rawTargetIdx)) {
                closest = item;
              }
            }
            nextTrackId = closest.track.id;
            setDragHoverTrackId(closest.track.id);

            const initCompatPos = compatibleTrackIndices.findIndex(
              (item) => item.idx === dragState.initialTrackIdx
            );
            const targetCompatPos = compatibleTrackIndices.findIndex(
              (item) => item.idx === closest.idx
            );
            if (initCompatPos !== -1 && targetCompatPos !== -1) {
              compatibleStepDelta = targetCompatPos - initCompatPos;
            }
          }
        }

        let batchUpdates: Record<string, { startTime: number; trackId: string }> | undefined;
        if (dragState.initialSelectedPositions && Object.keys(dragState.initialSelectedPositions).length > 1) {
          batchUpdates = {};
          for (const [selId, initPos] of Object.entries(dragState.initialSelectedPositions)) {
            const selClip = clips.find((c) => c.id === selId);
            let resolvedTrackId = tracks[initPos.trackIdx]?.id || '';
            if (selClip) {
              const selCompat = tracks
                .map((t, idx) => ({ track: t, idx }))
                .filter(
                  ({ track }) =>
                    !track.locked && isTrackCompatibleWithClip(track.type, selClip.type)
                );
              const curCompatIdx = selCompat.findIndex((item) => item.idx === initPos.trackIdx);
              if (curCompatIdx !== -1 && selCompat.length > 0) {
                const nextCompatIdx = Math.max(
                  0,
                  Math.min(selCompat.length - 1, curCompatIdx + compatibleStepDelta)
                );
                resolvedTrackId = selCompat[nextCompatIdx].track.id;
              }
            }
            batchUpdates[selId] = {
              startTime: Math.max(0, Math.round((initPos.startTime + actualDeltaSec) * 100) / 100),
              trackId: resolvedTrackId,
            };
          }
        }

        onUpdateClipTiming(
          dragState.clipId,
          nextStart,
          dragState.initialDuration,
          dragState.initialTrimStart,
          nextTrackId,
          batchUpdates
        );
      } else if (dragState.mode === 'trim-start') {
        const maxDelta = dragState.initialDuration - 0.25;
        const clampedDelta = Math.max(-dragState.initialStart, Math.min(maxDelta, deltaSec));
        const nextStart = snapTime(dragState.initialStart + clampedDelta, dragState.clipId);
        const actualDelta = nextStart - dragState.initialStart;
        onUpdateClipTiming(
          dragState.clipId,
          nextStart,
          Math.max(0.25, dragState.initialDuration - actualDelta),
          Math.max(0, dragState.initialTrimStart + actualDelta)
        );
      } else if (dragState.mode === 'trim-end') {
        const nextDuration = Math.max(0.25, dragState.initialDuration + deltaSec);
        const snappedEnd = snapTime(dragState.initialStart + nextDuration, dragState.clipId);
        onUpdateClipTiming(
          dragState.clipId,
          dragState.initialStart,
          Math.max(0.25, snappedEnd - dragState.initialStart),
          dragState.initialTrimStart
        );
      }
    };

    const onWindowMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const onWindowTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onWindowUp = () => {
      setDragState(null);
      setDragHoverTrackId(null);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', onWindowUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowUp);
    };
  }, [dragState, zoomPxPerSec, tracks, snapEnabled, playheadTime, clips]);

  // Sync vertical scroll between left track headers and right timeline canvas
  const handleCanvasScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (trackHeadersRef.current) {
      trackHeadersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleHeadersScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Render an individual tool widget in the Timeline Toolbar
  const renderToolbarWidget = (itemId: TimelineToolbarItemId) => {
    switch (itemId) {
      case 'undo-redo':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Undo Last Action (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3 text-sky-400" />
              <span>Undo</span>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Redo Action (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3 h-3 text-sky-400" />
              <span>Redo</span>
            </button>
          </div>
        );

      case 'split':
        return (
          <button
            onClick={onSplitAtPlayhead}
            disabled={
              selectedClipIds.length === 0 &&
              !clips.some(
                (c) => playheadTime > c.startTime + 0.08 && playheadTime < c.startTime + c.duration - 0.08
              )
            }
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Split Clip at Playhead (S)"
          >
            <Scissors className="w-3 h-3 text-sky-400" />
            <span>Split</span>
          </button>
        );

      case 'caption':
        return (
          <button
            onClick={() => {
              if (
                activeOrSelectedClip &&
                (activeOrSelectedClip.type === 'caption' || activeOrSelectedClip.type === 'text')
              ) {
                setCapText(activeOrSelectedClip.textContent || activeOrSelectedClip.name);
                if (activeOrSelectedClip.textStyle) {
                  setCapPreset(activeOrSelectedClip.textStyle.captionPreset || 'WordGlowing');
                  setCapFontFamily(activeOrSelectedClip.textStyle.fontFamily);
                  setCapFontSize(activeOrSelectedClip.textStyle.fontSize);
                  setCapColor(activeOrSelectedClip.textStyle.color);
                  setCapStrokeColor(activeOrSelectedClip.textStyle.strokeColor);
                  setCapStrokeWidth(activeOrSelectedClip.textStyle.strokeWidth);
                  setCapShadowColor(activeOrSelectedClip.textStyle.shadowColor);
                  setCapShadowBlur(activeOrSelectedClip.textStyle.shadowBlur);
                  setCapBgColor(activeOrSelectedClip.textStyle.backgroundColor);
                  setCapBgOpacity(activeOrSelectedClip.textStyle.backgroundOpacity);
                  setCapAlign(activeOrSelectedClip.textStyle.align);
                }
              }
              setShowCaptionStudioBar((prev) => !prev);
            }}
            className={`px-2.5 py-0.5 rounded text-[11px] flex items-center gap-1 border transition-colors whitespace-nowrap ${
              showCaptionStudioBar
                ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 font-semibold'
            }`}
            title="Open Caption Studio with All Options (Auto Lyrics, Word Glowing, Multiline, Fonts, Colors, Animations)"
          >
            <MessageSquare className="w-3 h-3 text-amber-400" />
            <span>+Caption</span>
          </button>
        );

      case 'generate-caption':
        return (
          <button
            onClick={() => {
              onAutoCaptions?.(capPreset || 'WordGlowing', 'speech');
            }}
            className="px-2.5 py-0.5 rounded text-[11px] flex items-center gap-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold border border-sky-400 transition-colors whitespace-nowrap shadow-xs"
            title="Trace Video Voice & Generate Synchronized Captions onto CAPTIONS Track"
          >
            <Sparkles className="w-3 h-3 text-slate-950" />
            <span>Generate Caption</span>
          </button>
        );

      case 'font':
        return (
          <button
            onClick={() => setShowAddFontBar((prev) => !prev)}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 border transition-colors whitespace-nowrap ${
              showAddFontBar
                ? 'bg-purple-500 text-slate-950 border-purple-400 font-bold'
                : 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/40 text-purple-300 font-medium'
            }`}
            title="Add Custom Font or Upload .TTF / .OTF / .WOFF2 Font File"
          >
            <Type className="w-3 h-3 text-purple-400" />
            <span>+Add Font</span>
          </button>
        );

      case 'keyframe':
        return (
          <button
            onClick={() => onAddKeyframeAtPlayhead?.('scaleX')}
            disabled={clips.length === 0}
            className="px-2 py-0.5 bg-slate-800 hover:bg-amber-500/20 disabled:opacity-40 text-amber-300 rounded border border-amber-500/30 text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Add Keyframe at Playhead (◆)"
          >
            <Diamond className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>+Keyframe</span>
          </button>
        );

      case 'volume':
        return (
          <div
            className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-0.5"
            title={
              activeOrSelectedClip
                ? `Volume Control: ${activeOrSelectedClip.name} (${currentToolbarVolume}%)`
                : 'Clip Volume Control (0% - 200%)'
            }
          >
            <button
              onClick={() => onQuickVolumeChange?.(currentToolbarVolume, true)}
              className={`p-0.5 rounded transition-colors ${
                currentToolbarMuted ? 'text-rose-400 bg-rose-500/15' : 'text-sky-400 hover:text-sky-300'
              }`}
              title={currentToolbarMuted ? 'Unmute Clip Audio' : 'Mute Clip Audio'}
            >
              {currentToolbarMuted || currentToolbarVolume === 0 ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={200}
              value={currentToolbarMuted ? 0 : currentToolbarVolume}
              onChange={(e) => onQuickVolumeChange?.(Number(e.target.value), false)}
              className="w-16 accent-sky-500 h-1 bg-slate-800 rounded cursor-pointer"
            />
            <span className="text-[10px] font-mono tabular-nums text-slate-300 w-8 text-right">
              {currentToolbarMuted ? 'MUTE' : `${currentToolbarVolume}%`}
            </span>
          </div>
        );

      case 'clip-ops':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={onDuplicateSelected}
              disabled={selectedClipIds.length === 0}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Duplicate Clip (Ctrl+D)"
            >
              <Copy className="w-3 h-3" />
              <span>Duplicate</span>
            </button>
            <button
              onClick={() => onDeleteSelected(false)}
              disabled={selectedClipIds.length === 0}
              className="px-2 py-0.5 bg-slate-800 hover:bg-rose-500/20 disabled:opacity-40 text-slate-200 hover:text-rose-300 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Delete Selected (Del)"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
            <button
              onClick={() => onDeleteSelected(true)}
              disabled={selectedClipIds.length === 0}
              className="px-2 py-0.5 bg-slate-800 hover:bg-amber-500/20 disabled:opacity-40 text-slate-300 hover:text-amber-300 rounded text-[11px] transition-colors whitespace-nowrap"
              title="Ripple Delete (closes gap)"
            >
              Ripple
            </button>
            <button
              onClick={onGroupSelected}
              disabled={selectedClipIds.length < 2}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Group / Ungroup Selected Clips"
            >
              <Layers className="w-3 h-3" />
              <span>Group</span>
            </button>
          </div>
        );

      case 'tracks':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAddTrack('video')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[11px] flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3 h-3 text-sky-400" /> V-Track
            </button>
            <button
              onClick={() => onAddTrack('audio')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[11px] flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3 h-3 text-emerald-400" /> A-Track
            </button>
          </div>
        );

      case 'snap-zoom':
        return (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono tabular-nums text-sky-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {formatTimecode(playheadTime, fps)}
            </span>

            <button
              onClick={() => setSnapEnabled(!snapEnabled)}
              className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 border transition-colors whitespace-nowrap ${
                snapEnabled
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle Magnetic Timeline Snapping"
            >
              <Magnet className="w-3 h-3" />
              <span>Snap</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomPxPerSec(Math.max(15, zoomPxPerSec - 15))}
                className="p-0.5 text-slate-400 hover:text-slate-200"
                title="Zoom Out Timeline"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={15}
                max={160}
                value={zoomPxPerSec}
                onChange={(e) => setZoomPxPerSec(Number(e.target.value))}
                className="w-16 sm:w-20 accent-sky-500 h-1 bg-slate-800 rounded"
              />
              <button
                onClick={() => setZoomPxPerSec(Math.min(160, zoomPxPerSec + 15))}
                className="p-0.5 text-slate-400 hover:text-slate-200"
                title="Zoom In Timeline"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
    }
  };

  const timelineToolbarElement = (
    <div className="min-h-9 px-2 py-1 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between gap-1.5 shrink-0 overflow-x-auto">
      {/* Reorderable Toolbar Widgets (Drag Left/Right to Arrange, No Freehand Floating Button) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {toolbarOrder
          .filter((itemId) => DEFAULT_TOOLBAR_ORDER.includes(itemId))
          .map((itemId) => (
            <div
              key={itemId}
              draggable
              onDragStart={(e) => {
                setDraggingToolbarItem(itemId);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggingToolbarItem || draggingToolbarItem === itemId) return;
                const fromIdx = toolbarOrder.indexOf(draggingToolbarItem);
                const toIdx = toolbarOrder.indexOf(itemId);
                if (fromIdx === -1 || toIdx === -1) return;
                const next = [...toolbarOrder];
                next.splice(fromIdx, 1);
                next.splice(toIdx, 0, draggingToolbarItem);
                saveToolbarOrder(next);
                setDraggingToolbarItem(null);
              }}
              className="flex items-center gap-0.5 rounded transition-all"
            >
              {renderToolbarWidget(itemId)}
            </div>
          ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#090D16] select-none overflow-hidden relative">
      {/* Hidden Font File Input for Timeline Toolbar "+Add Font" */}
      <input
        ref={toolbarFontInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const cleanName = f.name
            .replace(/\.(ttf|otf|woff2?)$/i, '')
            .replace(/[^a-zA-Z0-9 _-]/g, '');
          onAddCustomFont?.(cleanName, f);
          setCapFontFamily(cleanName);
        }}
      />

      {/* Render Toolbar at Top (or Floating Freehand) */}
      {(toolbarDockEdge === 'top' || isToolbarFreehand) && timelineToolbarElement}

      {/* "+Add Font" Quick Bar when +Add Font button in Timeline Toolbar is clicked */}
      {showAddFontBar && (
        <div className="px-3 py-1.5 bg-slate-900/95 border-b border-purple-500/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Type className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-[11px] font-semibold text-purple-200 whitespace-nowrap">
              Add / Apply Font:
            </span>
            <input
              type="text"
              value={newFontNameDraft}
              onChange={(e) => setNewFontNameDraft(e.target.value)}
              placeholder="Type Google or Studio Font (e.g. Bebas Neue, Poppins, Oswald, Lobster)..."
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-purple-400 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!newFontNameDraft.trim()) return;
                onAddCustomFont?.(newFontNameDraft.trim());
                setCapFontFamily(newFontNameDraft.trim());
                setNewFontNameDraft('');
              }}
              className="px-2.5 py-0.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-semibold rounded text-[11px] whitespace-nowrap"
            >
              + Add & Use Font
            </button>
            <button
              type="button"
              onClick={() => toolbarFontInputRef.current?.click()}
              className="px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 rounded text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
            >
              <Upload className="w-3 h-3" /> Upload .TTF/.OTF
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5">
            {availableFonts.slice(0, 10).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onAddCustomFont?.(f);
                  setCapFontFamily(f);
                }}
                style={{ fontFamily: f }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-purple-500 text-slate-200 hover:text-slate-950 rounded text-[10px] border border-slate-700 whitespace-nowrap"
              >
                {f}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAddFontBar(false)}
              className="p-1 text-slate-400 hover:text-white ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dedicated "+Caption" Studio Panel with ALL Options */}
      {showCaptionStudioBar && (
        <div className="px-3 py-2 bg-slate-900/95 border-b border-amber-500/50 flex flex-col gap-2 shrink-0 max-h-56 overflow-y-auto">
          {/* Row 1: Caption Text + Auto Lyrics / Auto Speech + Add / Update Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap">
                Caption Studio (All Options):
              </span>
              <input
                type="text"
                value={capText}
                onChange={(e) => setCapText(e.target.value)}
                placeholder="Type caption or multiline text (use | for second line)..."
                className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAutoCaptions?.(capPreset, 'lyrics')}
                className="px-2 py-1 bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/40 rounded text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                <Music className="w-3 h-3" /> Auto Lyrics
              </button>
              <button
                type="button"
                onClick={() => onAutoCaptions?.(capPreset, 'speech')}
                className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-slate-950 border border-purple-500/40 rounded text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                <Wand2 className="w-3 h-3" /> Auto Speech
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddOrUpdateCaptionFull?.({
                    text: capText,
                    stylePreset: capPreset,
                    fontFamily: capFontFamily,
                    fontSize: capFontSize,
                    color: capColor,
                    strokeColor: capStrokeColor,
                    strokeWidth: capStrokeWidth,
                    shadowColor: capShadowColor,
                    shadowBlur: capShadowBlur,
                    backgroundColor: capBgColor,
                    backgroundOpacity: capBgOpacity,
                    align: capAlign,
                    bold: capBold,
                    italic: capItalic,
                    underline: capUnderline,
                    positionPreset: capPosition,
                    animationIn: capAnimIn,
                    animationOut: capAnimOut,
                    animationLoop: capAnimLoop,
                    duration: capDuration,
                    updateSelected: false,
                  });
                }}
                className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded text-[11px] flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3 h-3" /> Add Caption
              </button>
              {activeOrSelectedClip &&
                (activeOrSelectedClip.type === 'caption' || activeOrSelectedClip.type === 'text') && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddOrUpdateCaptionFull?.({
                        text: capText,
                        stylePreset: capPreset,
                        fontFamily: capFontFamily,
                        fontSize: capFontSize,
                        color: capColor,
                        strokeColor: capStrokeColor,
                        strokeWidth: capStrokeWidth,
                        shadowColor: capShadowColor,
                        shadowBlur: capShadowBlur,
                        backgroundColor: capBgColor,
                        backgroundOpacity: capBgOpacity,
                        align: capAlign,
                        bold: capBold,
                        italic: capItalic,
                        underline: capUnderline,
                        positionPreset: capPosition,
                        animationIn: capAnimIn,
                        animationOut: capAnimOut,
                        animationLoop: capAnimLoop,
                        duration: capDuration,
                        updateSelected: true,
                      });
                    }}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded text-[11px] flex items-center gap-1 whitespace-nowrap"
                  >
                    <Check className="w-3 h-3" /> Update Selected
                  </button>
                )}
              <button
                type="button"
                onClick={() => setShowCaptionStudioBar(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: All 10 Caption Style Presets */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <span className="text-[10px] text-slate-400 font-medium mr-1 shrink-0">Style:</span>
            {(
              [
                { id: 'WordGlowing', label: '✦ Word Glowing' },
                { id: 'Multiline', label: '☰ Multiline' },
                { id: 'Karaoke', label: '♪ Karaoke' },
                { id: 'Highlight', label: '★ Highlight' },
                { id: 'Bold', label: 'Bold' },
                { id: 'Modern', label: 'Modern' },
                { id: 'Cinematic', label: 'Cinematic' },
                { id: 'Podcast', label: 'Podcast' },
                { id: 'Minimal', label: 'Minimal' },
                { id: 'Clean', label: 'Clean' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setCapPreset(st.id)}
                className={`px-2 py-0.5 rounded text-[10px] border whitespace-nowrap transition-colors ${
                  capPreset === st.id
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Row 3: Font Family + Add Font + Size + Colors + Position + Alignment + Animation + Duration */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
              <span className="text-slate-400">Font:</span>
              <select
                value={capFontFamily}
                onChange={(e) => setCapFontFamily(e.target.value)}
                className="bg-slate-950 text-slate-100 focus:outline-none"
              >
                {availableFonts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddFontBar(true)}
                className="px-1.5 py-0.2 bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-slate-950 rounded font-semibold"
                title="Add New Font"
              >
                +Font
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
              <span className="text-slate-400">Size:</span>
              <input
                type="number"
                min={14}
                max={140}
                value={capFontSize}
                onChange={(e) => setCapFontSize(Number(e.target.value) || 38)}
                className="w-11 bg-transparent font-mono text-slate-100 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
              <span className="text-slate-400">Text:</span>
              <input
                type="color"
                value={capColor}
                onChange={(e) => setCapColor(e.target.value)}
                className="w-4 h-4 bg-transparent cursor-pointer"
              />
              <span className="text-slate-400 ml-1">Stroke:</span>
              <input
                type="color"
                value={capStrokeColor}
                onChange={(e) => setCapStrokeColor(e.target.value)}
                className="w-4 h-4 bg-transparent cursor-pointer"
              />
              <span className="text-slate-400 ml-1">Glow:</span>
              <input
                type="color"
                value={capShadowColor}
                onChange={(e) => setCapShadowColor(e.target.value)}
                className="w-4 h-4 bg-transparent cursor-pointer"
              />
              <span className="text-slate-400 ml-1">BG:</span>
              <input
                type="color"
                value={capBgColor}
                onChange={(e) => setCapBgColor(e.target.value)}
                className="w-4 h-4 bg-transparent cursor-pointer"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={capBgOpacity}
                onChange={(e) => setCapBgOpacity(Number(e.target.value))}
                className="w-12 accent-amber-400 h-1"
                title={`Background Opacity: ${capBgOpacity}%`}
              />
            </div>

            <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded p-0.5">
              <button
                type="button"
                onClick={() => setCapBold((b) => !b)}
                className={`px-1.5 rounded font-bold ${capBold ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
              >
                B
              </button>
              <button
                type="button"
                onClick={() => setCapItalic((i) => !i)}
                className={`px-1.5 rounded italic ${capItalic ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => setCapUnderline((u) => !u)}
                className={`px-1.5 rounded underline ${capUnderline ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
              >
                U
              </button>
            </div>

            <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded p-0.5">
              {(['bottom', 'center', 'top'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setCapPosition(pos)}
                  className={`px-1.5 py-0.2 rounded capitalize ${
                    capPosition === pos ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
              <span className="text-slate-400">In:</span>
              <select
                value={capAnimIn}
                onChange={(e) => setCapAnimIn(e.target.value)}
                className="bg-slate-950 text-slate-100 focus:outline-none"
              >
                {BUILTIN_ANIMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <span className="text-slate-400 ml-1">Loop:</span>
              <select
                value={capAnimLoop}
                onChange={(e) => setCapAnimLoop(e.target.value)}
                className="bg-slate-950 text-slate-100 focus:outline-none"
              >
                {BUILTIN_LOOP_ANIMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <span className="text-slate-400 ml-1">Dur:</span>
              <input
                type="number"
                step={0.5}
                min={0.5}
                max={60}
                value={capDuration}
                onChange={(e) => setCapDuration(Number(e.target.value) || 3)}
                className="w-10 bg-transparent font-mono text-slate-100 focus:outline-none"
              />
              <span>s</span>
            </div>
          </div>
        </div>
      )}

      {/* Pencil Quick-Edit Bar (when Pencil tool is clicked in Timeline Toolbar) */}
      {showPencilPopover && (
        <div className="px-3 py-1.5 bg-slate-900/95 border-b border-sky-500/40 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Pencil className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-200 whitespace-nowrap">
              {activeOrSelectedClip ? `Edit "${activeOrSelectedClip.name}":` : 'Quick Caption / Note:'}
            </span>
            <input
              type="text"
              value={pencilDraft}
              onChange={(e) => setPencilDraft(e.target.value)}
              placeholder="Enter clip title, lyrics, or multiline text (use | or newline for multiline)..."
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-sky-400 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                onPencilQuickEdit?.(pencilDraft);
                setShowPencilPopover(false);
              }}
              className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-[11px] flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Save Edit
            </button>
            <button
              onClick={() => {
                onPencilQuickEdit?.(pencilDraft, 'WordGlowing');
                setShowPencilPopover(false);
              }}
              className="px-2 py-0.5 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-500/40 text-fuchsia-200 rounded text-[11px] flex items-center gap-1"
              title="Apply as Word Glowing Caption"
            >
              <Sparkles className="w-3 h-3 text-fuchsia-400" /> +Word Glow
            </button>
            <button
              onClick={() => {
                onPencilQuickEdit?.(pencilDraft, 'Multiline');
                setShowPencilPopover(false);
              }}
              className="px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 rounded text-[11px]"
              title="Apply as Multiline Stacked Caption"
            >
              +Multiline
            </button>
            <button
              onClick={() => setShowPencilPopover(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Between-Cut Transition Picker Bar (when [⇄] between cuts or +Cut Transition is clicked) */}
      {cutTransitionClipId && (
        <div className="px-3 py-1.5 bg-slate-900/95 border-b border-sky-500/50 flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <Shuffle className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-semibold text-sky-300 whitespace-nowrap">
              Cut Transition:
            </span>
            <input
              type="text"
              value={cutTransitionSearch}
              onChange={(e) => setCutTransitionSearch(e.target.value)}
              placeholder="Search or type any Online Transition..."
              className="w-44 bg-slate-950 border border-slate-700 focus:border-sky-400 rounded px-2 py-0.5 text-[11px] text-slate-100 focus:outline-none"
            />
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px]">
              <span className="text-slate-400">Dur:</span>
              {[0.25, 0.5, 0.8, 1.0].map((d) => (
                <button
                  key={d}
                  onClick={() => setCutTransitionDuration(d)}
                  className={`px-1 rounded font-mono ${
                    cutTransitionDuration === d
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {cutTransitionSearch.trim() &&
              !BUILTIN_TRANSITIONS.some(
                (t) => t.name.toLowerCase() === cutTransitionSearch.trim().toLowerCase()
              ) && (
                <button
                  onClick={() => {
                    onApplyTransitionBetweenCuts?.(
                      cutTransitionClipId,
                      cutTransitionSearch.trim(),
                      cutTransitionDuration
                    );
                    setCutTransitionClipId(null);
                  }}
                  className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-[10px] whitespace-nowrap"
                >
                  ✦ Online "{cutTransitionSearch.trim()}"
                </button>
              )}
            {BUILTIN_TRANSITIONS.filter(
              (t) =>
                !cutTransitionSearch.trim() ||
                t.name.toLowerCase().includes(cutTransitionSearch.toLowerCase()) ||
                t.id.toLowerCase().includes(cutTransitionSearch.toLowerCase())
            ).map((tr) => (
              <button
                key={tr.id}
                onClick={() => {
                  onApplyTransitionBetweenCuts?.(
                    cutTransitionClipId,
                    tr.id,
                    cutTransitionDuration
                  );
                  setCutTransitionClipId(null);
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-sky-500 text-slate-200 hover:text-slate-950 font-medium rounded text-[10px] border border-slate-700 whitespace-nowrap transition-colors"
              >
                ⇄ {tr.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCutTransitionClipId(null)}
            className="p-1 text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Multi-Track Workspace with Synchronized Vertical & Horizontal Scrolling */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Track Headers (Responsive width on Mobile/Tablet/Desktop) */}
        <div className="w-28 sm:w-40 bg-[#0F172A] border-r border-slate-800 flex flex-col shrink-0">
          <div className="h-5 border-b border-slate-800 px-2 flex items-center text-[10px] font-mono text-slate-400 shrink-0">
            TRACKS ({tracks.length})
          </div>
          <div
            ref={trackHeadersRef}
            onScroll={handleHeadersScroll}
            className="flex-1 overflow-y-auto divide-y divide-slate-800/80"
          >
            {tracks.map((track, tIdx) => (
              <div
                key={track.id}
                className="h-11 px-1.5 sm:px-2 flex items-center justify-between bg-[#0F172A] hover:bg-slate-900/80 transition-colors"
              >
                <div className="min-w-0 flex items-center gap-1">
                  <div className="flex flex-col -space-y-0.5 mr-0.5">
                    <button
                      onClick={() => onMoveTrackVertical?.(track.id, -1)}
                      disabled={tIdx === 0}
                      className="text-slate-500 hover:text-sky-400 disabled:opacity-20"
                      title="Move Track Up (Within Same Track Type)"
                    >
                      <ArrowUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => onMoveTrackVertical?.(track.id, 1)}
                      disabled={tIdx === tracks.length - 1}
                      className="text-slate-500 hover:text-sky-400 disabled:opacity-20"
                      title="Move Track Down (Within Same Track Type)"
                    >
                      <ArrowDown className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      track.type === 'video'
                        ? 'bg-sky-400'
                        : track.type === 'audio'
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <p className="text-[10px] sm:text-[11px] font-medium text-slate-200 truncate">{track.name}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onToggleTrackProp(track.id, 'locked')}
                    className={`p-1 rounded ${
                      track.locked ? 'text-amber-400 bg-amber-500/15' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={track.locked ? 'Unlock Track' : 'Lock Track'}
                  >
                    {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  {track.type !== 'audio' && (
                    <button
                      onClick={() => onToggleTrackProp(track.id, 'hidden')}
                      className={`p-1 rounded ${
                        track.hidden ? 'text-rose-400 bg-rose-500/15' : 'text-slate-500 hover:text-slate-300'
                      }`}
                      title={track.hidden ? 'Show Track' : 'Hide Track'}
                    >
                      {track.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  )}
                  <button
                    onClick={() => onToggleTrackProp(track.id, 'muted')}
                    className={`p-1 rounded ${
                      track.muted ? 'text-rose-400 bg-rose-500/15' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={track.muted ? 'Unmute Track' : 'Mute Track'}
                  >
                    {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  {track.type === 'audio' && (
                    <button
                      onClick={() => onToggleTrackProp(track.id, 'solo')}
                      className={`px-1 py-0.5 rounded text-[9px] font-mono ${
                        track.solo ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-500 hover:text-slate-300'
                      }`}
                      title="Solo Audio Track"
                    >
                      S
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Scrollable Timeline Canvas (Both Horizontal & Vertical Scroll) */}
        <div
          ref={scrollContainerRef}
          onScroll={handleCanvasScroll}
          className="flex-1 overflow-auto relative bg-[#090D16]"
        >
          <div style={{ width: `${timelineWidthPx}px` }} className="relative min-h-full">
            {/* Sticky Time Ruler (Adaptive step for long-form videos up to multi-hour durations) */}
            <div
              onMouseDown={handleRulerMouseDown}
              className="h-5 bg-[#0F172A] border-b border-slate-800 relative cursor-pointer sticky top-0 z-20"
            >
              {(() => {
                const rulerStepSec =
                  totalTimelineSeconds > 1800
                    ? 30
                    : totalTimelineSeconds > 600
                    ? 10
                    : totalTimelineSeconds > 240
                    ? 5
                    : zoomPxPerSec < 25
                    ? 5
                    : 1;
                const tickCount = Math.ceil(totalTimelineSeconds / rulerStepSec);
                return Array.from({ length: tickCount }).map((_, idx) => {
                  const sec = idx * rulerStepSec;
                  const leftPx = sec * zoomPxPerSec;
                  const showLabel = zoomPxPerSec >= 35 || idx % 2 === 0 || rulerStepSec > 1;
                  const labelText =
                    sec >= 60
                      ? `${Math.floor(sec / 60)}m${sec % 60 > 0 ? `${sec % 60}s` : ''}`
                      : `${sec}s`;
                  return (
                    <div
                      key={sec}
                      style={{ left: `${leftPx}px` }}
                      className="absolute top-0 bottom-0 border-l border-slate-800 pl-1 flex items-center"
                    >
                      {showLabel && (
                        <span className="text-[9px] font-mono tabular-nums text-slate-400">
                          {labelText}
                        </span>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Track Lanes (h-11 = 44px per track) with Mouse Cursor Marquee Box Selection & Empty-Click Unselect */}
            <div
              ref={lanesContainerRef}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const container = lanesContainerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const startX = e.clientX - rect.left;
                const startY = e.clientY - rect.top;
                setMarqueeBox({ startX, startY, currX: startX, currY: startY });

                const onMoveMarquee = (mv: MouseEvent) => {
                  const r = container.getBoundingClientRect();
                  const cx = Math.max(0, mv.clientX - r.left);
                  const cy = Math.max(0, mv.clientY - r.top);
                  setMarqueeBox({ startX, startY, currX: cx, currY: cy });

                  if (Math.abs(cx - startX) > 4 || Math.abs(cy - startY) > 4) {
                    const minX = Math.min(startX, cx);
                    const maxX = Math.max(startX, cx);
                    const minY = Math.min(startY, cy);
                    const maxY = Math.max(startY, cy);

                    const minTime = minX / zoomPxPerSec;
                    const maxTime = maxX / zoomPxPerSec;

                    const matchedIds: string[] = [];
                    tracks.forEach((tr, tIdx) => {
                      const rowTop = tIdx * 44;
                      const rowBottom = rowTop + 44;
                      if (rowBottom >= minY && rowTop <= maxY) {
                        clips
                          .filter((c) => c.trackId === tr.id)
                          .forEach((c) => {
                            const cStart = c.startTime;
                            const cEnd = c.startTime + c.duration;
                            if (cEnd >= minTime && cStart <= maxTime) {
                              matchedIds.push(c.id);
                            }
                          });
                      }
                    });
                    onSetSelectedClipIds?.(matchedIds);
                  }
                };

                const onUpMarquee = (upEv: MouseEvent) => {
                  const r = container.getBoundingClientRect();
                  const endX = upEv.clientX - r.left;
                  const endY = upEv.clientY - r.top;
                  if (Math.abs(endX - startX) <= 4 && Math.abs(endY - startY) <= 4) {
                    // Clicked on empty timeline space -> unselect all clips and move playhead
                    onSetSelectedClipIds?.([]);
                    setCutTransitionClipId(null);
                  }
                  setMarqueeBox(null);
                  window.removeEventListener('mousemove', onMoveMarquee);
                  window.removeEventListener('mouseup', onUpMarquee);
                };

                window.addEventListener('mousemove', onMoveMarquee);
                window.addEventListener('mouseup', onUpMarquee);
              }}
              className="divide-y divide-slate-800/70 relative"
            >
              {/* Visual Mouse Drag Marquee Selection Rectangle */}
              {marqueeBox &&
                (Math.abs(marqueeBox.currX - marqueeBox.startX) > 4 ||
                  Math.abs(marqueeBox.currY - marqueeBox.startY) > 4) && (
                  <div
                    style={{
                      left: `${Math.min(marqueeBox.startX, marqueeBox.currX)}px`,
                      top: `${Math.min(marqueeBox.startY, marqueeBox.currY)}px`,
                      width: `${Math.abs(marqueeBox.currX - marqueeBox.startX)}px`,
                      height: `${Math.abs(marqueeBox.currY - marqueeBox.startY)}px`,
                    }}
                    className="absolute bg-sky-500/20 border border-sky-400 rounded-xs pointer-events-none z-40"
                  />
                )}

              {tracks.map((track, trackIdx) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                const isDragTargetTrack = dragHoverTrackId === track.id;
                return (
                  <div
                    key={track.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (track.locked) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const dropTime = snapTime((e.clientX - rect.left) / zoomPxPerSec);

                      const assetRaw = e.dataTransfer.getData('application/hve-asset');
                      if (assetRaw && onDropAssetOnTimeline) {
                        try {
                          const parsed = JSON.parse(assetRaw);
                          onDropAssetOnTimeline(parsed, track.id, dropTime);
                          return;
                        } catch {
                          // fallback below
                        }
                      }

                      const mediaId = e.dataTransfer.getData('application/hve-media-id');
                      if (mediaId) {
                        onDropMediaOnTrack(mediaId, track.id, dropTime);
                      }
                    }}
                    className={`h-11 relative transition-colors ${
                      track.locked
                        ? 'bg-slate-950/60 opacity-60'
                        : isDragTargetTrack
                        ? 'bg-sky-500/15 ring-1 ring-inset ring-sky-400/60'
                        : 'bg-[#090D16]'
                    }`}
                  >
                    {trackClips.map((clip) => {
                      const left = clip.startTime * zoomPxPerSec;
                      const width = Math.max(24, clip.duration * zoomPxPerSec);
                      const isSelected = selectedClipIds.includes(clip.id);
                      const previewImg = clip.thumbnailUrl || (clip.type === 'image' ? clip.url : undefined);
                      const hasAudioControl = clip.type === 'video' || clip.type === 'audio';
                      const volLineTopPct = Math.max(8, Math.min(92, 100 - (clip.volume / 200) * 85));

                      const colorClass =
                        clip.type === 'video' || clip.type === 'image'
                          ? 'bg-sky-900 border-sky-400 text-white'
                          : clip.type === 'audio'
                          ? 'bg-emerald-900 border-emerald-400 text-white'
                          : clip.type === 'caption'
                          ? 'bg-amber-900 border-amber-400 text-white'
                          : 'bg-purple-900 border-purple-400 text-white';

                      const startClipDrag = (clientX: number, clientY: number, isModifier: boolean) => {
                        let activeSelection = selectedClipIds;
                        if (isModifier) {
                          onSelectClip(clip.id, true);
                          activeSelection = selectedClipIds.includes(clip.id)
                            ? selectedClipIds
                            : [...selectedClipIds, clip.id];
                        } else if (!isSelected) {
                          onSelectClip(clip.id, false);
                          activeSelection = [clip.id];
                        }
                        if (track.locked) return;

                        const initialSelectedPositions: Record<
                          string,
                          { startTime: number; trackIdx: number }
                        > = {};
                        clips.forEach((c) => {
                          if (activeSelection.includes(c.id)) {
                            const cTrkIdx = tracks.findIndex((t) => t.id === c.trackId);
                            initialSelectedPositions[c.id] = {
                              startTime: c.startTime,
                              trackIdx: cTrkIdx >= 0 ? cTrkIdx : trackIdx,
                            };
                          }
                        });

                        setDragState({
                          clipId: clip.id,
                          mode: 'move',
                          initialX: clientX,
                          initialY: clientY,
                          initialStart: clip.startTime,
                          initialDuration: clip.duration,
                          initialTrimStart: clip.trimStart,
                          initialTrackIdx: trackIdx,
                          initialSelectedPositions,
                        });
                      };

                      return (
                        <div
                          key={clip.id}
                          style={{ left: `${left}px`, width: `${width}px`, filter: 'none', opacity: 1 }}
                          onMouseEnter={() => setHoveredClipId(clip.id)}
                          onMouseLeave={() => setHoveredClipId(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (track.locked) return;
                            const assetRaw = e.dataTransfer.getData('application/hve-asset');
                            if (assetRaw && onDropAssetOnTimeline) {
                              try {
                                const parsed = JSON.parse(assetRaw);
                                onDropAssetOnTimeline(parsed, track.id, clip.startTime, clip.id);
                                return;
                              } catch {
                                // ignore
                              }
                            }
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const isModifier = multiSelectMode || e.shiftKey || e.ctrlKey || e.metaKey;
                            startClipDrag(e.clientX, e.clientY, isModifier);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            if (e.touches.length > 0) {
                              startClipDrag(e.touches[0].clientX, e.touches[0].clientY, multiSelectMode);
                            }
                          }}
                          className={`group absolute top-0.5 bottom-0.5 rounded border px-1.5 flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing ${colorClass} ${
                            isSelected
                              ? 'ring-2 ring-amber-400 z-10 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                              : 'opacity-100'
                          }`}
                          title="Click to Select · Drag Left/Right or Up/Down Across Compatible Tracks (Video stays on Video, Audio stays on Audio)"
                        >
                          {/* Crystal-Clear Full-Clarity Filmstrip Thumbnail Preview (No Blur, No Fade when Unselected!) */}
                          {previewImg && (
                            <div
                              className="absolute inset-0 opacity-100 pointer-events-none flex overflow-hidden"
                              style={{
                                backgroundImage: `url(${previewImg})`,
                                backgroundRepeat: 'repeat-x',
                                backgroundSize: 'auto 100%',
                                imageRendering: 'auto',
                                filter: 'none',
                              }}
                            />
                          )}

                          {/* Subtle Top Label Strip so Text is Crisp While Filmstrip Remains 100% Clear Below */}
                          {previewImg && (
                            <div className="absolute top-0 left-0 right-0 h-4 bg-slate-950/65 pointer-events-none" />
                          )}

                          {/* Hover Mini Preview Floating Card on Timeline Clip */}
                          {hoveredClipId === clip.id && (
                            <div className="hidden group-hover:flex items-center gap-1.5 absolute bottom-1 left-2 bg-slate-950/95 border border-sky-500/50 rounded px-1.5 py-0.5 z-30 pointer-events-none shadow-lg">
                              {previewImg ? (
                                <img
                                  src={previewImg}
                                  alt={clip.name}
                                  className="w-7 h-5 object-cover rounded-xs border border-slate-700"
                                />
                              ) : (
                                <Film className="w-3.5 h-3.5 text-sky-400" />
                              )}
                              <span className="text-[9px] font-mono text-slate-200 whitespace-nowrap">
                                {clip.duration.toFixed(1)}s · Vol {clip.muted ? '0' : clip.volume}%
                              </span>
                            </div>
                          )}

                          {/* Left Trim Handle */}
                          {!track.locked && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                onSelectClip(clip.id, false);
                                setDragState({
                                  clipId: clip.id,
                                  mode: 'trim-start',
                                  initialX: e.clientX,
                                  initialY: e.clientY,
                                  initialStart: clip.startTime,
                                  initialDuration: clip.duration,
                                  initialTrimStart: clip.trimStart,
                                  initialTrackIdx: trackIdx,
                                });
                              }}
                              className="absolute left-0 top-0 bottom-0 w-1.5 bg-white/20 hover:bg-sky-400 cursor-ew-resize z-20"
                              title="Drag to Trim In-Point"
                            />
                          )}

                          {/* Right Trim Handle */}
                          {!track.locked && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                onSelectClip(clip.id, false);
                                setDragState({
                                  clipId: clip.id,
                                  mode: 'trim-end',
                                  initialX: e.clientX,
                                  initialY: e.clientY,
                                  initialStart: clip.startTime,
                                  initialDuration: clip.duration,
                                  initialTrimStart: clip.trimStart,
                                  initialTrackIdx: trackIdx,
                                });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/20 hover:bg-sky-400 cursor-ew-resize z-20"
                              title="Drag to Trim Out-Point"
                            />
                          )}

                          {/* Interactive Horizontal Volume Gain Line Directly on Clip (Drag Up/Down for Volume) */}
                          {hasAudioControl && !track.locked && (
                            <div
                              style={{ top: `${volLineTopPct}%` }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                onSelectClip(clip.id, false);
                                const startY = e.clientY;
                                const initVol = clip.volume;
                                const onMoveVol = (mv: MouseEvent) => {
                                  const dy = startY - mv.clientY;
                                  const nextVol = Math.max(0, Math.min(200, Math.round(initVol + dy * 4)));
                                  onClipVolumeChange?.(clip.id, nextVol);
                                };
                                const onUpVol = () => {
                                  window.removeEventListener('mousemove', onMoveVol);
                                  window.removeEventListener('mouseup', onUpVol);
                                };
                                window.addEventListener('mousemove', onMoveVol);
                                window.addEventListener('mouseup', onUpVol);
                              }}
                              className="absolute left-1.5 right-1.5 h-1 bg-amber-400/70 hover:bg-amber-300 cursor-ns-resize z-20 flex items-center justify-center"
                              title={`Drag Up/Down to Adjust Clip Volume (${clip.volume}%)`}
                            />
                          )}

                          {/* Clip Header with Selection Checkbox, Thumbnail Preview, Badges, Inline Volume +/- & Track Up/Down Swap */}
                          <div className="relative z-20 flex items-center justify-between gap-1 text-[10px] font-medium truncate leading-tight pt-0.5">
                            <div className="flex items-center gap-1 min-w-0">
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectClip(clip.id, true);
                                }}
                                className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-sky-400 border-sky-300 text-slate-950 font-bold'
                                    : 'bg-black/50 border-white/30 text-transparent hover:border-sky-400'
                                }`}
                                title="Click to Select / Multi-Select Clip (Ctrl+K)"
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </button>
                              {previewImg && (
                                <img
                                  src={previewImg}
                                  alt=""
                                  className="w-4 h-3.5 object-cover rounded-xs border border-white/20 shrink-0 pointer-events-none"
                                />
                              )}
                              <span className="truncate drop-shadow pointer-events-none">
                                {clip.textContent || clip.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              {/* Move Clip Up / Down Within Its Own Track Type (Video <-> Video, Audio <-> Audio) */}
                              <div
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center bg-black/70 rounded px-0.5 border border-white/15"
                                title="Move Clip Up/Down Within Same Track Type (Video on Video, Audio on Audio)"
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveClipVertical?.(clip.id, -1);
                                  }}
                                  className="text-slate-200 hover:text-sky-300 p-0.5"
                                  title="Move Up to Compatible Track"
                                >
                                  <ArrowUp className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveClipVertical?.(clip.id, 1);
                                  }}
                                  className="text-slate-200 hover:text-sky-300 p-0.5"
                                  title="Move Down to Compatible Track"
                                >
                                  <ArrowDown className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* Inline On-Clip Volume Down / Up Controls */}
                              {hasAudioControl && (
                                <div
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="flex items-center bg-black/60 rounded px-1 py-0.2 gap-0.5 border border-white/10"
                                  title="Adjust Clip Volume Up / Down"
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClipVolumeChange?.(clip.id, Math.max(0, clip.volume - 15));
                                    }}
                                    className="text-[9px] font-mono text-slate-300 hover:text-amber-300 px-0.5"
                                    title="Volume Down (-15%)"
                                  >
                                    -
                                  </button>
                                  <span className="text-[8px] font-mono tabular-nums text-amber-300">
                                    {clip.muted ? '0%' : `${clip.volume}%`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClipVolumeChange?.(clip.id, Math.min(200, clip.volume + 15));
                                    }}
                                    className="text-[9px] font-mono text-slate-300 hover:text-amber-300 px-0.5"
                                    title="Volume Up (+15%)"
                                  >
                                    +
                                  </button>
                                </div>
                              )}

                              {clip.transitionIn?.type && clip.transitionIn.type !== 'None' && (
                                <span className="text-[8px] font-mono bg-sky-500/30 text-sky-200 px-1 rounded pointer-events-none">
                                  ⇄ {clip.transitionIn.type}
                                </span>
                              )}
                              {clip.effects && clip.effects.length > 0 && (
                                <span className="text-[8px] font-mono bg-purple-500/30 text-purple-200 px-1 rounded pointer-events-none">
                                  ✦ {clip.effects.length} FX
                                </span>
                              )}
                              {clip.animationLoop && clip.animationLoop !== 'None' && (
                                <span className="text-[8px] font-mono bg-emerald-500/30 text-emerald-200 px-1 rounded pointer-events-none">
                                  ∞ {clip.animationLoop}
                                </span>
                              )}
                              {clip.audioEffects && clip.audioEffects.length > 0 && (
                                <span className="text-[8px] font-mono bg-amber-500/30 text-amber-200 px-1 rounded pointer-events-none">
                                  ♪ {clip.audioEffects.length} AFX
                                </span>
                              )}
                              {clip.speed !== 1 && (
                                <span className="text-[8px] font-mono bg-black/50 px-1 rounded pointer-events-none">
                                  {clip.speed}x
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Audio Waveform Bars */}
                          {clip.peaks && clip.peaks.length > 0 && (
                            <div className="flex items-end gap-0.5 h-2.5 opacity-65 pointer-events-none">
                              {clip.peaks.slice(0, 40).map((pk, idx) => (
                                <div
                                  key={idx}
                                  style={{ height: `${Math.max(15, pk * 100)}%` }}
                                  className="flex-1 bg-current rounded-t"
                                />
                              ))}
                            </div>
                          )}

                          {/* Keyframe Markers */}
                          {clip.keyframes && clip.keyframes.length > 0 && (
                            <div className="absolute bottom-0.5 left-0 right-0 h-2.5 pointer-events-none">
                              {clip.keyframes.map((kf) => (
                                <div
                                  key={kf.id}
                                  style={{ left: `${kf.timeOffset * zoomPxPerSec}px` }}
                                  className="absolute bottom-0 text-amber-400"
                                >
                                  <Diamond className="w-2 h-2 fill-amber-400" />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Interactive Cut-Junction Transition Button [⇄] at the Start Cut of Clip */}
                          {clip.startTime > 0.05 && !track.locked && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectClip(clip.id, false);
                                setCutTransitionClipId((prev) =>
                                  prev === clip.id ? null : clip.id
                                );
                              }}
                              className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 w-4 h-4 rounded-sm border flex items-center justify-center shadow transition-colors ${
                                clip.transitionIn?.type && clip.transitionIn.type !== 'None'
                                  ? 'bg-sky-500 border-white text-slate-950 font-bold'
                                  : 'bg-slate-900/95 hover:bg-sky-500 border-sky-400/70 text-sky-300 hover:text-slate-950'
                              }`}
                              title={
                                clip.transitionIn?.type && clip.transitionIn.type !== 'None'
                                  ? `Transition at Cut: ${clip.transitionIn.type} (${clip.transitionIn.duration}s) — Click to Change`
                                  : 'Click to Add Transition Between Cut (⇄)'
                              }
                            >
                              <Shuffle className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Vertical Red Playhead Line with Attached Moving Cut / Split & +Transition Buttons */}
            <div
              style={{ left: `${playheadTime * zoomPxPerSec}px` }}
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 pointer-events-none z-30"
            >
              {/* Draggable Playhead Cap */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const initTime = playheadTime;
                  const onMove = (ev: MouseEvent) => {
                    const dt = (ev.clientX - startX) / zoomPxPerSec;
                    setPlayheadTime(Math.max(0, Math.round((initTime + dt) * 100) / 100));
                  };
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
                className="w-3.5 h-3.5 -ml-[6px] bg-rose-500 rotate-45 rounded-xs pointer-events-auto cursor-ew-resize shadow"
                title="Drag Playhead Slider"
              />

              {/* Floating Cut / Split Action Pill Moving Directly with the Playhead Pointer */}
              <div className="pointer-events-auto absolute top-5 -left-5 flex items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSplitAtPlayhead();
                  }}
                  className="px-2 py-0.5 bg-rose-600 hover:bg-sky-500 text-white hover:text-slate-950 font-semibold text-[9px] rounded-full shadow-lg border border-white/25 flex items-center gap-0.5 transition-colors whitespace-nowrap"
                  title="Cut / Split Clip Here (S)"
                >
                  <Scissors className="w-2.5 h-2.5" />
                  <span>Cut</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Render Toolbar at Bottom if User Docked It at Bottom */}
      {toolbarDockEdge === 'bottom' && !isToolbarFreehand && timelineToolbarElement}
    </div>
  );
};
