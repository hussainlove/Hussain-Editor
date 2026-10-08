import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Undo2,
  Redo2,
  Save,
  Settings,
  Download,
  FolderOpen,
  Film,
  Check,
  AlertTriangle,
  X,
  RotateCcw,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import {
  APP_CONFIG,
  SidebarTabId,
  ProjectData,
  ImportedMediaItem,
  TimelineClip,
  DEFAULT_TRACKS,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_TEXT_STYLE,
  AspectRatioOption,
  PreviewResolutionOption,
  KeyframePoint,
  MaskShapeType,
  BUILTIN_TRANSITIONS,
  BUILTIN_EFFECTS,
  BUILTIN_FILTERS,
  BUILTIN_FONTS,
  BUILTIN_AUDIO_EFFECTS,
  BUILTIN_LOOP_ANIMATIONS,
  isTrackCompatibleWithClip,
} from './types/editor';
import { splitClipAtTime } from './utils/editorMath';
import { extractClipVoiceFromBrowser } from './utils/voiceAudioExtractor';
import { LeftSidebar } from './components/LeftSidebar';
import { PreviewMonitor } from './components/PreviewMonitor';
import { RightInspector } from './components/RightInspector';
import { TimelinePanel } from './components/TimelinePanel';
import {
  ExportModal,
  SettingsModal,
  WelcomeAndProjectModal,
} from './components/EditorModals';
import {
  WorkspacePanelBox,
  PanelFloatingGeometry,
} from './components/WorkspacePanelBox';

type TopSectionId = 'library' | 'monitor' | 'inspector';

export default function App() {
  const [activeTab, setActiveTab] = useState<SidebarTabId>('Media');
  const [mediaItems, setMediaItems] = useState<ImportedMediaItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'info' | 'error' | 'success';
    message: string;
    technicalDetails?: string;
  } | null>(null);

  // Project State & Command History (Undo / Redo)
  const [project, setProject] = useState<ProjectData>({
    id: 'proj_default',
    name: 'Hussain Studio Sequence',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    fps: 30,
    tracks: DEFAULT_TRACKS,
    clips: [],
  });

  const [undoStack, setUndoStack] = useState<ProjectData[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectData[]>([]);

  // Playback & Timeline UI State
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null);
  const [zoomPxPerSec, setZoomPxPerSec] = useState(55);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [previewResolution, setPreviewResolution] = useState<PreviewResolutionOption>('1080p');
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const availableFonts = React.useMemo(
    () => Array.from(new Set([...customFonts, ...BUILTIN_FONTS])),
    [customFonts]
  );

  const handleAddCustomFont = useCallback(
    async (fontName: string, fontFile?: File) => {
      const clean = fontName.trim();
      if (!clean) return;
      if (fontFile) {
        try {
          const buf = await fontFile.arrayBuffer();
          const face = new FontFace(clean, buf);
          await face.load();
          document.fonts.add(face);
        } catch {
          // ignore if FontFace fails
        }
      } else {
        // Dynamically load from Google Fonts stylesheet if available
        const id = `gf_${clean.replace(/\s+/g, '_').toLowerCase()}`;
        if (!document.getElementById(id)) {
          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean)}:wght@400;600;700;800&display=swap`;
          document.head.appendChild(link);
        }
      }
      setCustomFonts((prev) => (prev.includes(clean) ? prev : [clean, ...prev]));
      setProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) =>
          selectedClipIds.includes(c.id) && (c.type === 'text' || c.type === 'caption')
            ? {
                ...c,
                textStyle: {
                  ...(c.textStyle || DEFAULT_TEXT_STYLE),
                  fontFamily: clean,
                },
              }
            : c
        ),
      }));
      setStatusBanner({
        type: 'success',
        message: `Font "${clean}" added and ready to use across Captions & Titles.`,
      });
    },
    [selectedClipIds]
  );

  // Resizable & Movable Workspace Layout State
  const [topOrder, setTopOrder] = useState<TopSectionId[]>(['library', 'monitor', 'inspector']);
  const [timelineDockPosition, setTimelineDockPosition] = useState<'bottom' | 'top'>('bottom');
  const [libraryWidthPx, setLibraryWidthPx] = useState(340);
  const [inspectorWidthPx, setInspectorWidthPx] = useState(310);
  // Compact default timeline height (215px) with full vertical & horizontal scrollbars
  const [timelineHeightPx, setTimelineHeightPx] = useState(215);

  const [floatingPanels, setFloatingPanels] = useState<Record<string, boolean>>({
    library: false,
    monitor: false,
    inspector: false,
    timeline: false,
  });

  const [maximizedPanel, setMaximizedPanel] = useState<string | null>(null);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    library: false,
    monitor: false,
    inspector: false,
    timeline: false,
  });

  const [floatingGeometries, setFloatingGeometries] = useState<
    Record<string, PanelFloatingGeometry>
  >({
    library: { x: 24, y: 68, w: 380, h: 480 },
    monitor: { x: 260, y: 72, w: 680, h: 460 },
    inspector: { x: 780, y: 68, w: 340, h: 480 },
    timeline: { x: 80, y: 420, w: 960, h: 250 },
  });

  const resetWorkspaceLayout = () => {
    setTopOrder(['library', 'monitor', 'inspector']);
    setTimelineDockPosition('bottom');
    setLibraryWidthPx(340);
    setInspectorWidthPx(310);
    setTimelineHeightPx(215);
    setFloatingPanels({ library: false, monitor: false, inspector: false, timeline: false });
    setMaximizedPanel(null);
    setCollapsedPanels({ library: false, monitor: false, inspector: false, timeline: false });
  };

  const moveTopSection = (id: TopSectionId, direction: -1 | 1) => {
    setTopOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Modals
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [autoSaveIntervalSec, setAutoSaveIntervalSec] = useState(
    APP_CONFIG.defaultAutoSaveIntervalSec
  );

  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // Commit state change with undo history
  const commitProjectChange = useCallback(
    (updater: (prev: ProjectData) => ProjectData, _label?: string) => {
      setProject((prev) => {
        setUndoStack((u) => [...u.slice(-29), prev]);
        setRedoStack([]);
        return updater(prev);
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousState = prevUndo[prevUndo.length - 1];
      setRedoStack((r) => [project, ...r]);
      setProject(previousState);
      return prevUndo.slice(0, -1);
    });
  }, [project]);

  const handleRedo = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextState = prevRedo[0];
      setUndoStack((u) => [...u, project]);
      setProject(nextState);
      return prevRedo.slice(1);
    });
  }, [project]);

  // Initial Media Load & Starter FFmpeg Sample Generation
  useEffect(() => {
    const initWorkspace = async () => {
      try {
        const res = await fetch('/api/media');
        if (res.ok) {
          const data = await res.json();
          if (data.media && data.media.length > 0) {
            setMediaItems(data.media);
            return;
          }
        }
        const genRes = await fetch('/api/media/generate-samples', { method: 'POST' });
        if (genRes.ok) {
          const genData = await genRes.json();
          const items: ImportedMediaItem[] = genData.media || [];
          setMediaItems(items);
          if (items.length > 0) {
            const firstVideo = items.find((i) => i.type === 'video') || items[0];
            const firstAudio = items.find((i) => i.type === 'audio');
            const initialClips: TimelineClip[] = [
              {
                id: 'clip_starter_v1',
                trackId: 'track-v1',
                mediaId: firstVideo.id,
                name: firstVideo.originalName,
                type: firstVideo.type,
                url: firstVideo.url,
                filePath: firstVideo.filePath,
                thumbnailUrl: firstVideo.thumbnailUrl,
                startTime: 0,
                duration: firstVideo.duration,
                trimStart: 0,
                sourceDuration: firstVideo.duration,
                positionX: 0,
                positionY: 0,
                scaleX: 100,
                scaleY: 100,
                rotation: 0,
                flipH: false,
                flipV: false,
                anchorX: 50,
                anchorY: 50,
                opacity: 100,
                blendMode: 'normal',
                cropTop: 0,
                cropBottom: 0,
                cropLeft: 0,
                cropRight: 0,
                speed: 1,
                reversed: false,
                volume: 100,
                muted: false,
                fadeIn: 0.3,
                fadeOut: 0.3,
                pitch: 0,
                noiseReduction: false,
                peaks: firstVideo.peaks,
                effects: [],
                filterPreset: 'None',
                transitionIn: { type: 'Fade', duration: 0.5 },
                transitionOut: { type: 'None', duration: 0.5 },
                animationIn: 'None',
                animationOut: 'None',
                adjustments: { ...DEFAULT_ADJUSTMENTS },
                keyframes: [],
              },
              {
                id: 'clip_starter_title',
                trackId: 'track-v2',
                name: 'Studio Title Overlay',
                type: 'text',
                startTime: 0.5,
                duration: 4.5,
                trimStart: 0,
                sourceDuration: 4.5,
                positionX: 0,
                positionY: -90,
                scaleX: 100,
                scaleY: 100,
                rotation: 0,
                flipH: false,
                flipV: false,
                anchorX: 50,
                anchorY: 50,
                opacity: 100,
                blendMode: 'normal',
                cropTop: 0,
                cropBottom: 0,
                cropLeft: 0,
                cropRight: 0,
                speed: 1,
                reversed: false,
                volume: 100,
                muted: false,
                fadeIn: 0.2,
                fadeOut: 0.2,
                pitch: 0,
                noiseReduction: false,
                effects: [],
                filterPreset: 'None',
                transitionIn: { type: 'Fade', duration: 0.25 },
                transitionOut: { type: 'Fade', duration: 0.25 },
                animationIn: 'Slide Up',
                animationOut: 'Fade Out',
                adjustments: { ...DEFAULT_ADJUSTMENTS },
                textContent: 'HUSSAIN VIDEO EDITOR 1.0',
                textStyle: {
                  ...DEFAULT_TEXT_STYLE,
                  fontSize: 52,
                  backgroundOpacity: 75,
                },
                keyframes: [],
              },
            ];

            if (firstAudio) {
              initialClips.push({
                id: 'clip_starter_a1',
                trackId: 'track-a1',
                mediaId: firstAudio.id,
                name: firstAudio.originalName,
                type: 'audio',
                url: firstAudio.url,
                filePath: firstAudio.filePath,
                startTime: 0,
                duration: firstAudio.duration,
                trimStart: 0,
                sourceDuration: firstAudio.duration,
                positionX: 0,
                positionY: 0,
                scaleX: 100,
                scaleY: 100,
                rotation: 0,
                flipH: false,
                flipV: false,
                anchorX: 50,
                anchorY: 50,
                opacity: 100,
                blendMode: 'normal',
                cropTop: 0,
                cropBottom: 0,
                cropLeft: 0,
                cropRight: 0,
                speed: 1,
                reversed: false,
                volume: 75,
                muted: false,
                fadeIn: 0.5,
                fadeOut: 1.0,
                pitch: 0,
                noiseReduction: false,
                peaks: firstAudio.peaks,
                effects: [],
                filterPreset: 'None',
                transitionIn: { type: 'None', duration: 0 },
                transitionOut: { type: 'None', duration: 0 },
                animationIn: 'None',
                animationOut: 'None',
                adjustments: { ...DEFAULT_ADJUSTMENTS },
                keyframes: [],
              });
            }

            setProject((p) => ({ ...p, clips: initialClips }));
            setSelectedClipIds(['clip_starter_v1']);
          }
        }
      } catch {
        // ignore
      }
    };
    initWorkspace();
  }, []);

  // Auto-save background interval
  useEffect(() => {
    const timer = window.setInterval(() => {
      fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, isAutoSave: true }),
      }).catch(() => {});
    }, autoSaveIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [project, autoSaveIntervalSec]);

  // Import Project File (.hveproject or .json) from user disk
  const handleImportProjectFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = JSON.parse(String(reader.result));
          const unpacked = raw.project ? raw.project : raw;
          const loadedProject: ProjectData = {
            id: unpacked.id || `proj_${Date.now()}`,
            name:
              unpacked.name ||
              file.name.replace(/\.hveproject$/i, '').replace(/\.json$/i, '') ||
              'Imported Project',
            aspectRatio: unpacked.aspectRatio || '16:9',
            resolution: unpacked.resolution || '1920x1080',
            fps: Number(unpacked.fps) || 30,
            tracks:
              Array.isArray(unpacked.tracks) && unpacked.tracks.length > 0
                ? unpacked.tracks
                : DEFAULT_TRACKS,
            clips: Array.isArray(unpacked.clips) ? unpacked.clips : [],
          };

          setProject(loadedProject);
          setUndoStack([]);
          setRedoStack([]);
          setPlayheadTime(0);
          if (loadedProject.clips.length > 0) {
            setSelectedClipIds([loadedProject.clips[0].id]);
          }

          await fetch('/api/projects/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: loadedProject, isAutoSave: false }),
          }).catch(() => {});

          setStatusBanner({
            type: 'success',
            message: `Imported project "${loadedProject.name}" (${loadedProject.clips.length} timeline clips).`,
          });
        } catch (err: any) {
          setStatusBanner({
            type: 'error',
            message: 'Could not parse project file. Please select a valid .hveproject or media file.',
            technicalDetails: err?.message,
          });
        }
      };
      reader.readAsText(file);
    },
    []
  );

  // Fast HTML5 Browser Media Prober for Long / Large Videos (works instantaneously for any file size or duration)
  const probeMediaFileInBrowser = async (file: File): Promise<ImportedMediaItem> => {
    const objectUrl = URL.createObjectURL(file);
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) || file.type.startsWith('image/');
    const isAudio = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'].includes(ext) || file.type.startsWith('audio/');
    const mediaType: 'video' | 'audio' | 'image' = isImage ? 'image' : isAudio ? 'audio' : 'video';
    const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (mediaType === 'image') {
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 1920, h: img.naturalHeight || 1080 });
        img.onerror = () => resolve({ w: 1920, h: 1080 });
        img.src = objectUrl;
      });
      return {
        id,
        filename: file.name,
        originalName: file.name,
        filePath: file.name,
        url: objectUrl,
        thumbnailUrl: objectUrl,
        type: 'image',
        format: ext.toUpperCase(),
        duration: 5.0,
        width: dims.w,
        height: dims.h,
        fps: 30,
        videoCodec: ext,
        audioCodec: 'none',
        hasVideo: true,
        hasAudio: false,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
        isOffline: false,
      };
    }

    if (mediaType === 'audio') {
      const dur = await new Promise<number>((resolve) => {
        const aud = document.createElement('audio');
        aud.preload = 'metadata';
        aud.onloadedmetadata = () => resolve(Number.isFinite(aud.duration) && aud.duration > 0 ? aud.duration : 15);
        aud.onerror = () => resolve(15);
        aud.src = objectUrl;
      });
      const peaks = Array.from({ length: 64 }, (_, idx) =>
        Math.round((0.22 + 0.45 * Math.abs(Math.sin(idx * 0.45))) * 100) / 100
      );
      return {
        id,
        filename: file.name,
        originalName: file.name,
        filePath: file.name,
        url: objectUrl,
        type: 'audio',
        format: ext.toUpperCase(),
        duration: Math.round(dur * 100) / 100,
        width: 0,
        height: 0,
        fps: 30,
        videoCodec: 'none',
        audioCodec: ext,
        hasVideo: false,
        hasAudio: true,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
        peaks,
        isOffline: false,
      };
    }

    // Video probing with frame thumbnail extraction (supports multi-hour long videos)
    const videoMeta = await new Promise<{ duration: number; width: number; height: number; thumb?: string }>((resolve) => {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.muted = true;
      vid.playsInline = true;
      let resolved = false;
      const finish = (d: number, w: number, h: number, thumb?: string) => {
        if (resolved) return;
        resolved = true;
        resolve({ duration: d, width: w, height: h, thumb });
      };
      const timeoutId = window.setTimeout(() => finish(30, 1920, 1080), 6000);

      vid.onloadedmetadata = () => {
        const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 30;
        const w = vid.videoWidth || 1920;
        const h = vid.videoHeight || 1080;
        vid.currentTime = Math.min(1.0, dur * 0.1);
        vid.onseeked = () => {
          window.clearTimeout(timeoutId);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = Math.max(180, Math.round((320 * h) / Math.max(1, w)));
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(vid, 0, 0, canvas.width, canvas.height);
            finish(dur, w, h, canvas.toDataURL('image/jpeg', 0.72));
          } catch {
            finish(dur, w, h);
          }
        };
      };
      vid.onerror = () => {
        window.clearTimeout(timeoutId);
        finish(30, 1920, 1080);
      };
      vid.src = objectUrl;
    });

    const peaks = Array.from({ length: 64 }, (_, idx) =>
      Math.round((0.2 + 0.45 * Math.abs(Math.sin(idx * 0.38))) * 100) / 100
    );

    return {
      id,
      filename: file.name,
      originalName: file.name,
      filePath: file.name,
      url: objectUrl,
      thumbnailUrl: videoMeta.thumb,
      type: 'video',
      format: ext.toUpperCase(),
      duration: Math.round(videoMeta.duration * 100) / 100,
      width: videoMeta.width,
      height: videoMeta.height,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      hasVideo: true,
      hasAudio: true,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      peaks,
      isOffline: false,
    };
  };

  // Import Media Files via FFprobe (or instant HTML5 stream for long/large videos) and place onto timeline
  const handleImportFiles = async (
    files: FileList | File[],
    autoAddToTimeline = true
  ) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Separate any .hveproject / .json files first
    const projFile = fileArray.find(
      (f) =>
        f.name.toLowerCase().endsWith('.hveproject') ||
        f.name.toLowerCase().endsWith('.json')
    );
    if (projFile) {
      handleImportProjectFile(projFile);
    }

    const mediaFiles = fileArray.filter(
      (f) =>
        !f.name.toLowerCase().endsWith('.hveproject') &&
        !f.name.toLowerCase().endsWith('.json')
    );
    if (mediaFiles.length === 0) return;

    setIsBusy(true);
    try {
      let importedList: ImportedMediaItem[] = [];
      const hasLargeOrLongFile = mediaFiles.some((f) => f.size > 18 * 1024 * 1024);

      if (!hasLargeOrLongFile) {
        try {
          const formData = new FormData();
          mediaFiles.forEach((f) => formData.append('files', f));
          const res = await fetch('/api/media/import', {
            method: 'POST',
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            importedList = data.imported || [];
            setMediaItems(data.media || []);
          }
        } catch {
          // fallback to instant browser stream below
        }
      }

      // If file is a large/long video (>18MB) or server upload failed, probe instantaneously in browser
      if (importedList.length === 0) {
        const localProbed = await Promise.all(mediaFiles.map((f) => probeMediaFileInBrowser(f)));
        importedList = localProbed;
        setMediaItems((prev) => [...localProbed, ...prev]);
        fetch('/api/media/register-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: localProbed }),
        }).catch(() => {});
      }

      if (autoAddToTimeline && importedList.length > 0) {
        // Automatically adjust timeline zoom if a long video is imported so it's easy to view
        const maxImportedDur = Math.max(...importedList.map((m) => m.duration));
        if (maxImportedDur > 180) {
          setZoomPxPerSec(15);
        } else if (maxImportedDur > 60) {
          setZoomPxPerSec(25);
        }

        commitProjectChange((prev) => {
          const addedClips: TimelineClip[] = [];
          const updatedClips = [...prev.clips];

          importedList.forEach((media) => {
            const targetType = media.type === 'audio' ? 'audio' : 'video';
            const track =
              prev.tracks.find((t) => t.type === targetType && !t.locked) ||
              prev.tracks[0];
            const existingOnTrack = [...updatedClips, ...addedClips].filter(
              (c) => c.trackId === track.id
            );
            const appendStart = existingOnTrack.reduce(
              (max, c) => Math.max(max, Math.round((c.startTime + c.duration) * 100) / 100),
              0
            );

            const newClip: TimelineClip = {
              id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              trackId: track.id,
              mediaId: media.id,
              name: media.originalName,
              type: media.type,
              url: media.url,
              filePath: media.filePath,
              thumbnailUrl: media.thumbnailUrl,
              startTime: appendStart,
              duration: media.duration,
              trimStart: 0,
              sourceDuration: media.duration,
              positionX: 0,
              positionY: 0,
              scaleX: 100,
              scaleY: 100,
              rotation: 0,
              flipH: false,
              flipV: false,
              anchorX: 50,
              anchorY: 50,
              opacity: 100,
              blendMode: 'normal',
              cropTop: 0,
              cropBottom: 0,
              cropLeft: 0,
              cropRight: 0,
              speed: 1,
              reversed: false,
              volume: 100,
              muted: false,
              fadeIn: 0,
              fadeOut: 0,
              pitch: 0,
              noiseReduction: false,
              peaks: media.peaks,
              effects: [],
              filterPreset: 'None',
              transitionIn: { type: 'None', duration: 0.5 },
              transitionOut: { type: 'None', duration: 0.5 },
              animationIn: 'None',
              animationOut: 'None',
              adjustments: { ...DEFAULT_ADJUSTMENTS },
              keyframes: [],
            };
            addedClips.push(newClip);
          });

          if (addedClips.length > 0) {
            setSelectedClipIds([addedClips[addedClips.length - 1].id]);
            setPlayheadTime(addedClips[0].startTime);
          }

          return {
            ...prev,
            clips: [...updatedClips, ...addedClips],
          };
        }, 'Import and add media to timeline');
      }

      setStatusBanner({
        type: 'success',
        message: `Imported ${importedList.length} file(s) and placed directly on the timeline.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: 'Media import error',
        technicalDetails: err?.message,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateSamples = async () => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/media/generate-samples', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMediaItems(data.media || []);
        setStatusBanner({
          type: 'success',
          message: 'Generated studio sample clips using bundled FFmpeg.',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  // When a media file is deleted from the Media Library, also remove all its clips from the Timeline
  const handleRemoveMedia = async (id: string, deleteDisk: boolean) => {
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
    commitProjectChange(
      (prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.mediaId !== id),
      }),
      'Remove deleted media from timeline'
    );
    setSelectedClipIds((prev) =>
      prev.filter((clipId) => {
        const clip = project.clips.find((c) => c.id === clipId);
        return clip ? clip.mediaId !== id : false;
      })
    );
    try {
      const res = await fetch(`/api/media/${id}?deleteDisk=${deleteDisk}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.media)) {
          setMediaItems(data.media);
        }
      }
    } catch {
      // ignore network error
    }
    setStatusBanner({
      type: 'info',
      message: 'Media file deleted and removed from the timeline.',
    });
  };

  const handleRelinkMedia = async (mediaId: string, file: File) => {
    const fd = new FormData();
    fd.append('mediaId', mediaId);
    fd.append('file', file);
    const res = await fetch('/api/media/relink', { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json();
      setMediaItems(data.media || []);
      setStatusBanner({ type: 'success', message: 'Offline media relinked successfully.' });
    }
  };

  // Add Media Item to Timeline (Strictly keeps Audio on Audio tracks and Video on Video tracks)
  const handleAddMediaToTimeline = (
    media: ImportedMediaItem,
    targetTrackId?: string,
    startTimeOverride?: number
  ) => {
    const targetType = media.type === 'audio' ? 'audio' : 'video';
    const requestedTrack = project.tracks.find((t) => t.id === targetTrackId);
    const track =
      (requestedTrack && requestedTrack.type === targetType && !requestedTrack.locked
        ? requestedTrack
        : undefined) ||
      project.tracks.find((t) => t.type === targetType && !t.locked) ||
      project.tracks[0];

    const existingOnTrack = project.clips.filter((c) => c.trackId === track.id);
    const appendStart =
      startTimeOverride !== undefined
        ? startTimeOverride
        : existingOnTrack.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);

    const newClip: TimelineClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      mediaId: media.id,
      name: media.originalName,
      type: media.type,
      url: media.url,
      filePath: media.filePath,
      thumbnailUrl: media.thumbnailUrl,
      startTime: appendStart,
      duration: media.duration,
      trimStart: 0,
      sourceDuration: media.duration,
      positionX: 0,
      positionY: 0,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      flipH: false,
      flipV: false,
      anchorX: 50,
      anchorY: 50,
      opacity: 100,
      blendMode: 'normal',
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      speed: 1,
      reversed: false,
      volume: 100,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      pitch: 0,
      noiseReduction: false,
      peaks: media.peaks,
      effects: [],
      filterPreset: 'None',
      transitionIn: { type: 'None', duration: 0.5 },
      transitionOut: { type: 'None', duration: 0.5 },
      animationIn: 'None',
      animationOut: 'None',
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      keyframes: [],
    };

    commitProjectChange((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }), 'Add clip to timeline');
    setSelectedClipIds([newClip.id]);
  };

  // Add Text Clip
  const handleAddTextClip = (
    presetName: string,
    text: string,
    fontSize: number,
    styleOverrides?: Partial<typeof DEFAULT_TEXT_STYLE>
  ) => {
    const overlayTrack =
      project.tracks.find((t) => t.id === 'track-v2' || t.id === 'track-v3') || project.tracks[1];
    const newClip: TimelineClip = {
      id: `text_${Date.now()}`,
      trackId: overlayTrack.id,
      name: presetName,
      type: 'text',
      startTime: playheadTime,
      duration: 4.0,
      trimStart: 0,
      sourceDuration: 4.0,
      positionX: 0,
      positionY: 0,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      flipH: false,
      flipV: false,
      anchorX: 50,
      anchorY: 50,
      opacity: 100,
      blendMode: 'normal',
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      speed: 1,
      reversed: false,
      volume: 100,
      muted: false,
      fadeIn: 0.2,
      fadeOut: 0.2,
      pitch: 0,
      noiseReduction: false,
      effects: [],
      filterPreset: 'None',
      transitionIn: { type: 'Fade', duration: 0.25 },
      transitionOut: { type: 'Fade', duration: 0.25 },
      animationIn: 'Slide Up',
      animationOut: 'Fade Out',
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      textContent: text,
      textStyle: {
        ...DEFAULT_TEXT_STYLE,
        fontSize,
        ...styleOverrides,
      },
      keyframes: [],
    };
    commitProjectChange((prev) => ({ ...prev, clips: [...prev.clips, newClip] }), 'Add text overlay');
    setSelectedClipIds([newClip.id]);
  };

  // Auto-Captions & Voice Tracer (extracts real audio from the video/audio clip and transcribes spoken voice)
  const handleAutoCaptions = async (style: string, mode: 'lyrics' | 'speech' = 'speech') => {
    const selected =
      project.clips.find(
        (c) => selectedClipIds.includes(c.id) && (c.type === 'video' || c.type === 'audio')
      ) ||
      project.clips.find(
        (c) =>
          (c.type === 'video' || c.type === 'audio') &&
          playheadTime >= c.startTime &&
          playheadTime <= c.startTime + c.duration
      ) ||
      project.clips.find((c) => c.type === 'video' || c.type === 'audio');

    if (!selected) {
      setStatusBanner({
        type: 'error',
        message: 'Please add a video or audio clip to the timeline first so its voice can be traced.',
      });
      return;
    }

    setIsBusy(true);
    setStatusBanner({
      type: 'info',
      message: `Tracing voice from "${selected.name}" and generating synchronized captions...`,
    });

    try {
      const targetDuration = Math.max(1, selected.duration || 8);
      const voicePayload = await extractClipVoiceFromBrowser(
        selected.url,
        selected.trimStart || 0,
        targetDuration,
        selected.peaks
      );

      let segments: Array<{ startTime: number; endTime: number; text: string }> | null = null;
      try {
        const res = await fetch('/api/captions/auto-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId: selected.mediaId,
            clipStartTime: selected.startTime || 0,
            trimStart: selected.trimStart || 0,
            duration: targetDuration,
            style,
            mode,
            audioBase64: voicePayload.audioBase64,
            mimeType: voicePayload.mimeType,
            vadIntervals: voicePayload.vadIntervals,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.segments) && data.segments.length > 0) {
            segments = data.segments;
          }
        }
      } catch {
        // Fallback below if server route is unreachable
      }

      if (!segments || segments.length === 0) {
        if (voicePayload.vadIntervals.length > 0) {
          segments = voicePayload.vadIntervals.map((iv, i) => ({
            startTime: Math.round(((selected.startTime || 0) + iv.start) * 100) / 100,
            endTime: Math.round(((selected.startTime || 0) + Math.max(iv.start + 0.5, iv.end)) * 100) / 100,
            text: `Voice Segment #${i + 1} (${iv.start.toFixed(1)}s - ${iv.end.toFixed(1)}s)`,
          }));
        } else {
          setStatusBanner({
            type: 'error',
            message: `No audible voice detected in "${selected.name}". Make sure the video has spoken audio.`,
          });
          return;
        }
      }

      const capTrack = project.tracks.find((t) => t.type === 'caption') || project.tracks[0];
      const generatedClips: TimelineClip[] = segments.map((seg: any, idx: number) => ({
        id: `cap_${Date.now()}_${idx}`,
        trackId: capTrack.id,
        name: mode === 'lyrics' ? `Lyric #${idx + 1}` : `Caption #${idx + 1}`,
        type: 'caption',
        startTime: seg.startTime,
        duration: Math.max(0.45, seg.endTime - seg.startTime),
        trimStart: 0,
        sourceDuration: Math.max(0.45, seg.endTime - seg.startTime),
        positionX: 0,
        positionY: 110,
        scaleX: 100,
        scaleY: 100,
        rotation: 0,
        flipH: false,
        flipV: false,
        anchorX: 50,
        anchorY: 50,
        opacity: 100,
        blendMode: 'normal',
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
        speed: 1,
        reversed: false,
        volume: 100,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        pitch: 0,
        noiseReduction: false,
        effects: [],
        filterPreset: 'None',
        transitionIn: { type: 'Fade', duration: 0.15 },
        transitionOut: { type: 'Fade', duration: 0.15 },
        animationIn: 'Pop',
        animationOut: 'None',
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        textContent: seg.text,
        textStyle: {
          ...DEFAULT_TEXT_STYLE,
          fontSize: 38,
          color: style === 'Karaoke' || style === 'Highlight' ? '#38BDF8' : '#FFFFFF',
          backgroundOpacity: style === 'Minimal' ? 0 : 80,
          captionPreset: (style || 'WordGlowing') as any,
        },
        keyframes: [],
      }));

      commitProjectChange((prev) => ({
        ...prev,
        clips: [...prev.clips.filter((c) => c.type !== 'caption'), ...generatedClips],
      }), `Voice-trace ${mode} captions`);
      if (generatedClips.length > 0) {
        setSelectedClipIds([generatedClips[0].id]);
      }
      setStatusBanner({
        type: 'success',
        message: `Traced ${generatedClips.length} voice-synced caption segments from "${selected.name}" onto CAPTIONS track.`,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddManualCaption = (text: string, style: string) => {
    const capTrack = project.tracks.find((t) => t.type === 'caption') || project.tracks[0];
    const newClip: TimelineClip = {
      id: `cap_manual_${Date.now()}`,
      trackId: capTrack.id,
      name: 'Caption Segment',
      type: 'caption',
      startTime: playheadTime,
      duration: 2.5,
      trimStart: 0,
      sourceDuration: 2.5,
      positionX: 0,
      positionY: 110,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      flipH: false,
      flipV: false,
      anchorX: 50,
      anchorY: 50,
      opacity: 100,
      blendMode: 'normal',
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      speed: 1,
      reversed: false,
      volume: 100,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      pitch: 0,
      noiseReduction: false,
      effects: [],
      filterPreset: 'None',
      transitionIn: { type: 'None', duration: 0 },
      transitionOut: { type: 'None', duration: 0 },
      animationIn: 'Pop',
      animationOut: 'None',
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      textContent: text,
      textStyle: {
        ...DEFAULT_TEXT_STYLE,
        fontSize: 38,
        backgroundOpacity: 80,
        captionPreset: style as any,
      },
      keyframes: [],
    };
    commitProjectChange((prev) => ({ ...prev, clips: [...prev.clips, newClip] }), 'Add manual caption');
    setSelectedClipIds([newClip.id]);
  };

  const handleAddStickerClip = (
    shape: TimelineClip['stickerShape'],
    name: string,
    color: string,
    customSvgDataUrl?: string,
    customPolygonPoints?: string,
    targetTrackId?: string,
    startTimeOverride?: number
  ) => {
    const overlayTrack =
      project.tracks.find((t) => t.id === targetTrackId) ||
      project.tracks.find((t) => t.id === 'track-v3') ||
      project.tracks[1];
    const newClip: TimelineClip = {
      id: `sticker_${Date.now()}`,
      trackId: overlayTrack.id,
      name,
      type: 'sticker',
      startTime: startTimeOverride !== undefined ? startTimeOverride : playheadTime,
      duration: 3.5,
      trimStart: 0,
      sourceDuration: 3.5,
      positionX: 0,
      positionY: 0,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      flipH: false,
      flipV: false,
      anchorX: 50,
      anchorY: 50,
      opacity: 100,
      blendMode: 'normal',
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      speed: 1,
      reversed: false,
      volume: 100,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      pitch: 0,
      noiseReduction: false,
      effects: [],
      filterPreset: 'None',
      transitionIn: { type: 'Fade', duration: 0.2 },
      transitionOut: { type: 'Fade', duration: 0.2 },
      animationIn: 'Pop',
      animationOut: 'Fade Out',
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      stickerShape: shape,
      stickerColor: color,
      customSvgDataUrl,
      customPolygonPoints,
      keyframes: [],
    };
    commitProjectChange((prev) => ({ ...prev, clips: [...prev.clips, newClip] }), 'Add sticker');
    setSelectedClipIds([newClip.id]);
  };

  const handleApplyMaskToTimeline = useCallback(
    (maskShape: MaskShapeType, customPolygon?: string) => {
      const targetId =
        selectedClipIds[0] ||
        project.clips.find((c) => c.type === 'video' || c.type === 'image')?.id;
      if (!targetId) return;
      setSelectedClipIds([targetId]);
      commitProjectChange(
        (prev) => ({
          ...prev,
          clips: prev.clips.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  mask: {
                    shape: maskShape,
                    feather: 0,
                    invert: false,
                    customPolygon,
                  },
                }
              : c
          ),
        }),
        `Apply mask ${maskShape}`
      );
    },
    [selectedClipIds, project.clips, commitProjectChange]
  );

  // Timeline Clip Editing Operations — splits selected clip(s) OR any clip currently under the playhead pointer
  const handleSplitAtPlayhead = useCallback(() => {
    commitProjectChange((prev) => {
      const targetIds =
        selectedClipIds.length > 0
          ? selectedClipIds
          : prev.clips
              .filter(
                (c) =>
                  playheadTime > c.startTime + 0.08 &&
                  playheadTime < c.startTime + c.duration - 0.08
              )
              .map((c) => c.id);

      if (targetIds.length === 0) return prev;

      const nextClips: TimelineClip[] = [];
      let newSecondClipId: string | null = null;
      prev.clips.forEach((c) => {
        if (targetIds.includes(c.id)) {
          const splitResult = splitClipAtTime(c, playheadTime);
          if (splitResult) {
            nextClips.push(splitResult[0], splitResult[1]);
            newSecondClipId = splitResult[1].id;
            return;
          }
        }
        nextClips.push(c);
      });
      if (newSecondClipId) {
        setSelectedClipIds([newSecondClipId]);
      }
      return { ...prev, clips: nextClips };
    }, 'Split clip at playhead');
  }, [selectedClipIds, playheadTime, commitProjectChange]);

  // Helper to resolve target visual clip (selected clip -> clip at playhead -> first visual clip)
  const resolveTargetVisualClipId = useCallback((): string | null => {
    if (selectedClipIds.length > 0) return selectedClipIds[0];
    const atPlayhead = project.clips.find(
      (c) =>
        (c.type === 'video' || c.type === 'image' || c.type === 'text') &&
        playheadTime >= c.startTime &&
        playheadTime <= c.startTime + c.duration
    );
    if (atPlayhead) return atPlayhead.id;
    const firstVisual = project.clips.find((c) => c.type === 'video' || c.type === 'image');
    return firstVisual ? firstVisual.id : project.clips[0]?.id || null;
  }, [selectedClipIds, project.clips, playheadTime]);

  const handleApplyEffectToTimeline = useCallback(
    (effectId: string) => {
      const targetId = resolveTargetVisualClipId();
      if (!targetId) return;
      setSelectedClipIds([targetId]);
      commitProjectChange((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => {
          if (c.id !== targetId) return c;
          const has = c.effects.includes(effectId);
          return {
            ...c,
            effects: has ? c.effects.filter((e) => e !== effectId) : [...c.effects, effectId],
          };
        }),
      }), `Apply effect ${effectId}`);
      setStatusBanner({
        type: 'success',
        message: `Applied "${effectId}" effect to timeline clip.`,
      });
    },
    [resolveTargetVisualClipId, commitProjectChange]
  );

  const handleApplyTransitionToTimeline = useCallback(
    (transitionId: string, duration = 0.5) => {
      const targetId = resolveTargetVisualClipId();
      if (!targetId) return;
      setSelectedClipIds([targetId]);
      commitProjectChange((prev) => ({
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === targetId
            ? {
                ...c,
                transitionIn: { type: transitionId, duration },
                transitionOut: { type: transitionId, duration },
              }
            : c
        ),
      }), `Apply transition ${transitionId}`);
      setStatusBanner({
        type: 'success',
        message: `Applied "${transitionId}" (${duration}s) transition to clip.`,
      });
    },
    [resolveTargetVisualClipId, commitProjectChange]
  );

  const handleApplyFilterToTimeline = useCallback(
    (filterId: string) => {
      const targetId = resolveTargetVisualClipId();
      if (!targetId) return;
      setSelectedClipIds([targetId]);
      commitProjectChange((prev) => ({
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === targetId ? { ...c, filterPreset: filterId } : c
        ),
      }), `Apply filter ${filterId}`);
      setStatusBanner({
        type: 'success',
        message: `Applied "${filterId}" color filter to clip.`,
      });
    },
    [resolveTargetVisualClipId, commitProjectChange]
  );

  const handleDeleteSelected = useCallback(
    (ripple: boolean) => {
      if (selectedClipIds.length === 0) return;
      commitProjectChange((prev) => {
        const toRemove = prev.clips.filter((c) => selectedClipIds.includes(c.id));
        let remaining = prev.clips.filter((c) => !selectedClipIds.includes(c.id));
        if (ripple && toRemove.length > 0) {
          toRemove.forEach((removed) => {
            remaining = remaining.map((c) => {
              if (c.trackId === removed.trackId && c.startTime > removed.startTime) {
                return {
                  ...c,
                  startTime: Math.max(0, Math.round((c.startTime - removed.duration) * 100) / 100),
                };
              }
              return c;
            });
          });
        }
        return { ...prev, clips: remaining };
      }, 'Delete selected clips');
      setSelectedClipIds([]);
    },
    [selectedClipIds, commitProjectChange]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    commitProjectChange((prev) => {
      const clones: TimelineClip[] = [];
      prev.clips.forEach((c) => {
        if (selectedClipIds.includes(c.id)) {
          clones.push({
            ...c,
            id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: `${c.name} (Copy)`,
            startTime: Math.round((c.startTime + c.duration) * 100) / 100,
          });
        }
      });
      return { ...prev, clips: [...prev.clips, ...clones] };
    }, 'Duplicate clip');
  }, [selectedClipIds, commitProjectChange]);

  const handleGroupSelected = useCallback(() => {
    if (selectedClipIds.length < 2) return;
    const gid = `group_${Date.now()}`;
    commitProjectChange((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        selectedClipIds.includes(c.id)
          ? { ...c, groupId: c.groupId ? undefined : gid }
          : c
      ),
    }), 'Group/Ungroup clips');
  }, [selectedClipIds, commitProjectChange]);

  // Save Project (.hveproject)
  const handleSaveProject = useCallback(async () => {
    const res = await fetch('/api/projects/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, isAutoSave: false }),
    });
    if (res.ok) {
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${APP_CONFIG.projectExtension}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusBanner({
        type: 'success',
        message: `Saved project "${project.name}${APP_CONFIG.projectExtension}".`,
      });
    }
  }, [project]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const projectEndTime = project.clips.reduce(
        (max, c) => Math.max(max, Math.round((c.startTime + c.duration) * 100) / 100),
        0
      );

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prevPlaying) => {
          if (!prevPlaying && projectEndTime > 0 && playheadTime >= projectEndTime - 0.05) {
            setPlayheadTime(0);
          }
          return !prevPlaying;
        });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const sel = project.clips.find((c) => selectedClipIds.includes(c.id));
        if (sel) setClipboardClip(sel);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardClip) {
          const pasted: TimelineClip = {
            ...clipboardClip,
            id: `clip_${Date.now()}`,
            startTime: playheadTime,
          };
          commitProjectChange((prev) => ({ ...prev, clips: [...prev.clips, pasted] }), 'Paste clip');
        }
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setPlayheadTime((t) => Math.max(0, t - 1 / project.fps));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setPlayheadTime((t) => t + 1 / project.fps);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const atPlayhead = project.clips
          .filter((c) => playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration)
          .map((c) => c.id);
        if (atPlayhead.length > 0) {
          setSelectedClipIds(atPlayhead);
        } else if (project.clips.length > 0) {
          const curIdx = project.clips.findIndex((c) => selectedClipIds.includes(c.id));
          const nextClip = project.clips[(curIdx + 1) % project.clips.length];
          setSelectedClipIds([nextClip.id]);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (selectedClipIds.length === project.clips.length) {
          setSelectedClipIds([]);
        } else {
          setSelectedClipIds(project.clips.map((c) => c.id));
        }
      } else if (e.key.toLowerCase() === 'k') {
        setIsPlaying(false);
      } else if (e.key.toLowerCase() === 'l') {
        setIsPlaying(true);
      } else if (e.key.toLowerCase() === 'j') {
        setIsPlaying(false);
        setPlayheadTime((t) => Math.max(0, t - 0.5));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleSaveProject,
    handleDuplicateSelected,
    handleSplitAtPlayhead,
    handleDeleteSelected,
    clipboardClip,
    playheadTime,
    project.clips,
    project.fps,
    selectedClipIds,
    commitProjectChange,
  ]);

  const selectedClip = project.clips.find((c) => c.id === selectedClipIds[0]) || null;
  const totalDuration = Math.max(
    5,
    project.clips.reduce((acc, c) => Math.max(acc, c.startTime + c.duration), 5)
  );

  // Direct FFmpeg Backend Operation Handler
  const handleRunFFmpegDirectOp = async (operation: 'reverse' | 'freeze' | 'normalize') => {
    if (!selectedClip || !selectedClip.mediaId) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/ffmpeg/process-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: selectedClip.mediaId,
          operation,
          freezeTime: Math.max(0, playheadTime - selectedClip.startTime),
        }),
      });
      const data = await res.json();
      if (res.ok && data.processed) {
        setMediaItems(data.media || []);
        handleAddMediaToTimeline(
          data.processed,
          selectedClip.trackId,
          selectedClip.startTime + selectedClip.duration
        );
        setStatusBanner({
          type: 'success',
          message: `FFmpeg ${operation} completed and added to timeline.`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          message: data.error || 'FFmpeg operation failed',
          technicalDetails: data.technicalDetails,
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  // Drag handle between docked columns
  const startColumnResize = (
    e: React.MouseEvent,
    target: 'library' | 'inspector',
    invertDelta = false
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = target === 'library' ? libraryWidthPx : inspectorWidthPx;
    const onMove = (ev: MouseEvent) => {
      const rawDelta = ev.clientX - startX;
      const delta = invertDelta ? -rawDelta : rawDelta;
      const nextW = Math.max(240, Math.min(580, startW + delta));
      if (target === 'library') setLibraryWidthPx(nextW);
      else setInspectorWidthPx(nextW);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderSectionById = (sectionId: TopSectionId, indexInRow: number) => {
    const isFloating = floatingPanels[sectionId];
    const isMaximized = maximizedPanel === sectionId;
    const isCollapsed = collapsedPanels[sectionId];
    const canMoveLeft = indexInRow > 0;
    const canMoveRight = indexInRow < topOrder.length - 1;

    if (sectionId === 'library') {
      return (
        <React.Fragment key="library">
          <WorkspacePanelBox
            id="library"
            title="Media & Creative Assets"
            subtitle={activeTab}
            isFloating={isFloating}
            isMaximized={isMaximized}
            isCollapsed={isCollapsed}
            floatingGeo={floatingGeometries.library}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
            onMoveLeft={() => moveTopSection('library', -1)}
            onMoveRight={() => moveTopSection('library', 1)}
            onToggleFloat={() =>
              setFloatingPanels((p) => ({ ...p, library: !p.library }))
            }
            onToggleMaximize={() =>
              setMaximizedPanel((m) => (m === 'library' ? null : 'library'))
            }
            onToggleCollapse={() =>
              setCollapsedPanels((c) => ({ ...c, library: !c.library }))
            }
            onUpdateFloatingGeo={(geo) =>
              setFloatingGeometries((g) => ({ ...g, library: geo }))
            }
            style={
              !isFloating && !isMaximized
                ? {
                    width: isCollapsed ? '190px' : `${libraryWidthPx}px`,
                    height: isCollapsed ? '28px' : '100%',
                  }
                : undefined
            }
            className={!isFloating && !isMaximized ? 'shrink-0' : ''}
          >
            <LeftSidebar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              mediaItems={mediaItems}
              onImportFiles={handleImportFiles}
              onImportProjectFile={handleImportProjectFile}
              onGenerateSamples={handleGenerateSamples}
              onRemoveMedia={handleRemoveMedia}
              onRelinkMedia={handleRelinkMedia}
              onAddMediaToTimeline={(m) => handleAddMediaToTimeline(m)}
              onAddTextClip={handleAddTextClip}
              onAutoCaptions={handleAutoCaptions}
              onAddManualCaption={handleAddManualCaption}
              onAddStickerClip={handleAddStickerClip}
              selectedClip={selectedClip}
              onUpdateClip={(clipId, updater, label) => {
                commitProjectChange(
                  (prev) => ({
                    ...prev,
                    clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
                  }),
                  label
                );
              }}
              onApplyEffectToTimeline={handleApplyEffectToTimeline}
              onApplyTransitionToTimeline={handleApplyTransitionToTimeline}
              onApplyFilterToTimeline={handleApplyFilterToTimeline}
              onApplyMaskToTimeline={handleApplyMaskToTimeline}
              onLoadTemplateSequence={(templateId) => {
                if (templateId === 'shorts-vertical') {
                  commitProjectChange((prev) => ({
                    ...prev,
                    aspectRatio: '9:16',
                    resolution: '1080x1920',
                  }), 'Apply Shorts 9:16 template');
                } else {
                  commitProjectChange((prev) => ({
                    ...prev,
                    aspectRatio: '16:9',
                    resolution: '1920x1080',
                  }), 'Apply 16:9 template');
                }
              }}
              isBusy={isBusy}
            />
          </WorkspacePanelBox>

          {/* Interactive Vertical Splitter for Library Width */}
          {!isFloating && !isMaximized && !isCollapsed && (
            <div
              onMouseDown={(e) =>
                startColumnResize(e, 'library', indexInRow === topOrder.length - 1)
              }
              className="w-1.5 bg-slate-900 hover:bg-sky-500/70 cursor-col-resize shrink-0 transition-colors flex items-center justify-center group"
              title="Drag to resize Media Library width"
            >
              <div className="w-0.5 h-8 bg-slate-700 group-hover:bg-sky-300 rounded" />
            </div>
          )}
        </React.Fragment>
      );
    }

    if (sectionId === 'monitor') {
      return (
        <div
          key="monitor"
          data-display-monitor="true"
          className={!isFloating && !isMaximized ? 'flex-1 min-w-[280px] h-full flex' : 'contents'}
        >
          <WorkspacePanelBox
            id="monitor"
            title="Video Preview Monitor"
            subtitle={`${project.aspectRatio} · ${previewResolution}`}
            isFloating={isFloating}
            isMaximized={isMaximized}
            isCollapsed={isCollapsed}
            floatingGeo={floatingGeometries.monitor}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
            onMoveLeft={() => moveTopSection('monitor', -1)}
            onMoveRight={() => moveTopSection('monitor', 1)}
            onToggleFloat={() =>
              setFloatingPanels((p) => ({ ...p, monitor: !p.monitor }))
            }
            onToggleMaximize={() =>
              setMaximizedPanel((m) => (m === 'monitor' ? null : 'monitor'))
            }
            onToggleCollapse={() =>
              setCollapsedPanels((c) => ({ ...c, monitor: !c.monitor }))
            }
            onUpdateFloatingGeo={(geo) =>
              setFloatingGeometries((g) => ({ ...g, monitor: geo }))
            }
            className={!isFloating && !isMaximized ? 'flex-1 min-w-[280px] h-full' : ''}
          >
            <PreviewMonitor
              tracks={project.tracks}
              clips={project.clips}
              playheadTime={playheadTime}
              setPlayheadTime={setPlayheadTime}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              aspectRatio={project.aspectRatio}
              setAspectRatio={(ar) => setProject((p) => ({ ...p, aspectRatio: ar }))}
              previewResolution={previewResolution}
              setPreviewResolution={setPreviewResolution}
              fps={project.fps}
              selectedClipId={selectedClipIds[0] || null}
              onSelectClip={(id, multi) => {
                if (multi) {
                  setSelectedClipIds((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                  );
                } else {
                  setSelectedClipIds([id]);
                }
              }}
              onUpdateClipTransformDrag={(clipId, newPosX, newPosY) => {
                setProject((prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) =>
                    c.id === clipId ? { ...c, positionX: newPosX, positionY: newPosY } : c
                  ),
                }));
              }}
            />
          </WorkspacePanelBox>
        </div>
      );
    }

    return (
      <React.Fragment key="inspector">
        {/* Interactive Vertical Splitter for Inspector Width */}
        {!isFloating && !isMaximized && !isCollapsed && (
          <div
            onMouseDown={(e) =>
              startColumnResize(e, 'inspector', indexInRow > 0)
            }
            className="w-1.5 bg-slate-900 hover:bg-sky-500/70 cursor-col-resize shrink-0 transition-colors flex items-center justify-center group"
            title="Drag to resize Property Inspector width"
          >
            <div className="w-0.5 h-8 bg-slate-700 group-hover:bg-sky-300 rounded" />
          </div>
        )}

        <WorkspacePanelBox
          id="inspector"
          title="Property Inspector"
          subtitle={selectedClip ? selectedClip.name : 'No Clip Selected'}
          isFloating={isFloating}
          isMaximized={isMaximized}
          isCollapsed={isCollapsed}
          floatingGeo={floatingGeometries.inspector}
          canMoveLeft={canMoveLeft}
          canMoveRight={canMoveRight}
          onMoveLeft={() => moveTopSection('inspector', -1)}
          onMoveRight={() => moveTopSection('inspector', 1)}
          onToggleFloat={() =>
            setFloatingPanels((p) => ({ ...p, inspector: !p.inspector }))
          }
          onToggleMaximize={() =>
            setMaximizedPanel((m) => (m === 'inspector' ? null : 'inspector'))
          }
          onToggleCollapse={() =>
            setCollapsedPanels((c) => ({ ...c, inspector: !c.inspector }))
          }
          onUpdateFloatingGeo={(geo) =>
            setFloatingGeometries((g) => ({ ...g, inspector: geo }))
          }
          style={
            !isFloating && !isMaximized
              ? {
                  width: isCollapsed ? '190px' : `${inspectorWidthPx}px`,
                  height: isCollapsed ? '28px' : '100%',
                }
              : undefined
          }
          className={!isFloating && !isMaximized ? 'shrink-0' : ''}
        >
          <RightInspector
            selectedClip={selectedClip}
            playheadTime={playheadTime}
            onUpdateClip={(clipId, updater, label) => {
              commitProjectChange(
                (prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
                }),
                label
              );
            }}
            onAddOrUpdateKeyframe={(
              clipId: string,
              property: KeyframePoint['property'],
              value: number
            ) => {
              commitProjectChange((prev) => ({
                ...prev,
                clips: prev.clips.map((c) => {
                  if (c.id !== clipId) return c;
                  const offset = Math.max(0, Math.round((playheadTime - c.startTime) * 100) / 100);
                  const existingIdx = c.keyframes.findIndex(
                    (k) => k.property === property && Math.abs(k.timeOffset - offset) < 0.08
                  );
                  const nextKfs = [...c.keyframes];
                  if (existingIdx >= 0) {
                    nextKfs[existingIdx] = { ...nextKfs[existingIdx], value };
                  } else {
                    nextKfs.push({
                      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                      timeOffset: offset,
                      property,
                      value,
                    });
                  }
                  return { ...c, [property]: value, keyframes: nextKfs };
                }),
              }), 'Add keyframe');
            }}
            onRemoveKeyframe={(clipId, keyframeId) => {
              commitProjectChange((prev) => ({
                ...prev,
                clips: prev.clips.map((c) =>
                  c.id === clipId
                    ? { ...c, keyframes: c.keyframes.filter((k) => k.id !== keyframeId) }
                    : c
                ),
              }), 'Remove keyframe');
            }}
            onRunFFmpegDirectOp={handleRunFFmpegDirectOp}
            isProcessingFFmpeg={isBusy}
          />
        </WorkspacePanelBox>
      </React.Fragment>
    );
  };

  const timelineSectionNode = (
    <WorkspacePanelBox
      id="timeline"
      title="Multi-Track Nonlinear Timeline"
      subtitle={`${project.tracks.length} Tracks · ${project.clips.length} Clips`}
      isFloating={floatingPanels.timeline}
      isMaximized={maximizedPanel === 'timeline'}
      isCollapsed={collapsedPanels.timeline}
      floatingGeo={floatingGeometries.timeline}
      onToggleFloat={() =>
        setFloatingPanels((p) => ({ ...p, timeline: !p.timeline }))
      }
      onToggleMaximize={() =>
        setMaximizedPanel((m) => (m === 'timeline' ? null : 'timeline'))
      }
      onToggleCollapse={() =>
        setCollapsedPanels((c) => ({ ...c, timeline: !c.timeline }))
      }
      onUpdateFloatingGeo={(geo) =>
        setFloatingGeometries((g) => ({ ...g, timeline: geo }))
      }
      style={
        !floatingPanels.timeline && maximizedPanel !== 'timeline'
          ? {
              height: collapsedPanels.timeline ? '28px' : `${timelineHeightPx}px`,
            }
          : undefined
      }
      className={!floatingPanels.timeline && maximizedPanel !== 'timeline' ? 'shrink-0 w-full' : ''}
    >
      <TimelinePanel
        tracks={project.tracks}
        clips={project.clips}
        playheadTime={playheadTime}
        setPlayheadTime={setPlayheadTime}
        selectedClipIds={selectedClipIds}
        onSelectClip={(id, multi) => {
          if (multi) {
            setSelectedClipIds((prev) =>
              prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
            );
          } else {
            setSelectedClipIds([id]);
          }
        }}
        onSetSelectedClipIds={setSelectedClipIds}
        onSelectAllClips={() => {
          if (selectedClipIds.length === project.clips.length) {
            setSelectedClipIds([]);
          } else {
            setSelectedClipIds(project.clips.map((c) => c.id));
          }
        }}
        onSelectAtPlayhead={() => {
          const atPlayhead = project.clips
            .filter((c) => playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration)
            .map((c) => c.id);
          if (atPlayhead.length > 0) {
            setSelectedClipIds(atPlayhead);
          } else if (project.clips.length > 0) {
            const curIdx = project.clips.findIndex((c) => selectedClipIds.includes(c.id));
            const nextClip = project.clips[(curIdx + 1) % project.clips.length];
            setSelectedClipIds([nextClip.id]);
          }
        }}
        zoomPxPerSec={zoomPxPerSec}
        setZoomPxPerSec={setZoomPxPerSec}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onDeleteSelected={handleDeleteSelected}
        onDuplicateSelected={handleDuplicateSelected}
        onGroupSelected={handleGroupSelected}
        onToggleTrackProp={(trackId, prop) => {
          commitProjectChange((prev) => ({
            ...prev,
            tracks: prev.tracks.map((t) =>
              t.id === trackId ? { ...t, [prop]: !t[prop] } : t
            ),
          }), `Toggle track ${prop}`);
        }}
        onAddTrack={(type) => {
          commitProjectChange((prev) => {
            const count = prev.tracks.filter((t) => t.type === type).length + 1;
            const newTrack = {
              id: `track_${type}_${Date.now()}`,
              name: type === 'video' ? `V${count} Video` : `AUDIO ${count}`,
              type,
              locked: false,
              hidden: false,
              muted: false,
              solo: false,
            };
            return {
              ...prev,
              tracks: type === 'video' ? [newTrack, ...prev.tracks] : [...prev.tracks, newTrack],
            };
          }, `Add ${type} track`);
        }}
        onUpdateClipTiming={(clipId, newStart, newDur, newTrim, newTrackId, batchUpdates) => {
          setProject((prev) => ({
            ...prev,
            clips: prev.clips.map((c) => {
              if (batchUpdates && batchUpdates[c.id]) {
                return {
                  ...c,
                  startTime: batchUpdates[c.id].startTime,
                  trackId: batchUpdates[c.id].trackId || c.trackId,
                };
              }
              if (c.id === clipId) {
                return {
                  ...c,
                  startTime: newStart,
                  duration: newDur,
                  trimStart: newTrim,
                  trackId: newTrackId || c.trackId,
                };
              }
              return c;
            }),
          }));
        }}
        onDropMediaOnTrack={(mediaId, trackId, dropTime) => {
          const found = mediaItems.find((m) => m.id === mediaId);
          if (found) {
            handleAddMediaToTimeline(found, trackId, dropTime);
          }
        }}
        onDropAssetOnTimeline={(assetPayload, trackId, dropTime, targetClipId) => {
          if (!assetPayload || !assetPayload.kind) return;
          const resolvedClipId =
            targetClipId ||
            project.clips.find(
              (c) =>
                c.trackId === trackId &&
                dropTime >= c.startTime &&
                dropTime <= c.startTime + c.duration
            )?.id ||
            resolveTargetVisualClipId();

          if (assetPayload.kind === 'transition') {
            if (resolvedClipId) {
              commitProjectChange(
                (prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) =>
                    c.id === resolvedClipId
                      ? {
                          ...c,
                          transitionIn: {
                            type: assetPayload.id,
                            duration: assetPayload.duration || 0.5,
                          },
                        }
                      : c
                  ),
                }),
                `Drop transition ${assetPayload.id}`
              );
              setSelectedClipIds([resolvedClipId]);
            }
          } else if (assetPayload.kind === 'effect') {
            if (resolvedClipId) {
              commitProjectChange(
                (prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) =>
                    c.id === resolvedClipId && !c.effects.includes(assetPayload.id)
                      ? { ...c, effects: [...c.effects, assetPayload.id] }
                      : c
                  ),
                }),
                `Drop effect ${assetPayload.id}`
              );
              setSelectedClipIds([resolvedClipId]);
            }
          } else if (assetPayload.kind === 'filter') {
            if (resolvedClipId) {
              commitProjectChange(
                (prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) =>
                    c.id === resolvedClipId ? { ...c, filterPreset: assetPayload.id } : c
                  ),
                }),
                `Drop filter ${assetPayload.id}`
              );
              setSelectedClipIds([resolvedClipId]);
            }
          } else if (assetPayload.kind === 'audio-effect') {
            if (resolvedClipId) {
              commitProjectChange(
                (prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) =>
                    c.id === resolvedClipId
                      ? {
                          ...c,
                          audioEffects: [...(c.audioEffects || []), assetPayload.id],
                        }
                      : c
                  ),
                }),
                `Drop audio effect ${assetPayload.id}`
              );
              setSelectedClipIds([resolvedClipId]);
            }
          } else if (assetPayload.kind === 'text') {
            const newTextClip: TimelineClip = {
              id: `text_${Date.now()}`,
              trackId,
              name: assetPayload.name || 'Title Overlay',
              type: 'text',
              startTime: dropTime,
              duration: 4.0,
              trimStart: 0,
              sourceDuration: 4.0,
              positionX: 0,
              positionY: 0,
              scaleX: 100,
              scaleY: 100,
              rotation: 0,
              flipH: false,
              flipV: false,
              anchorX: 50,
              anchorY: 50,
              opacity: 100,
              blendMode: 'normal',
              cropTop: 0,
              cropBottom: 0,
              cropLeft: 0,
              cropRight: 0,
              speed: 1,
              reversed: false,
              volume: 100,
              muted: false,
              fadeIn: 0.2,
              fadeOut: 0.2,
              pitch: 0,
              noiseReduction: false,
              effects: [],
              filterPreset: 'None',
              transitionIn: { type: 'Fade', duration: 0.25 },
              transitionOut: { type: 'Fade', duration: 0.25 },
              animationIn: 'Slide Up',
              animationOut: 'Fade Out',
              adjustments: { ...DEFAULT_ADJUSTMENTS },
              textContent: assetPayload.text || 'STUDIO TITLE',
              textStyle: {
                ...DEFAULT_TEXT_STYLE,
                fontSize: assetPayload.size || 50,
                fontFamily: assetPayload.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                backgroundOpacity: assetPayload.bg ?? 65,
                captionPreset: assetPayload.captionPreset,
              },
              keyframes: [],
            };
            commitProjectChange(
              (prev) => ({ ...prev, clips: [...prev.clips, newTextClip] }),
              'Drop title onto timeline'
            );
            setSelectedClipIds([newTextClip.id]);
          } else if (assetPayload.kind === 'caption') {
            const newCapClip: TimelineClip = {
              id: `cap_${Date.now()}`,
              trackId,
              name: `Caption (${assetPayload.style || 'WordGlowing'})`,
              type: 'caption',
              startTime: dropTime,
              duration: 3.0,
              trimStart: 0,
              sourceDuration: 3.0,
              positionX: 0,
              positionY: 110,
              scaleX: 100,
              scaleY: 100,
              rotation: 0,
              flipH: false,
              flipV: false,
              anchorX: 50,
              anchorY: 50,
              opacity: 100,
              blendMode: 'normal',
              cropTop: 0,
              cropBottom: 0,
              cropLeft: 0,
              cropRight: 0,
              speed: 1,
              reversed: false,
              volume: 100,
              muted: false,
              fadeIn: 0,
              fadeOut: 0,
              pitch: 0,
              noiseReduction: false,
              effects: [],
              filterPreset: 'None',
              transitionIn: { type: 'Fade', duration: 0.2 },
              transitionOut: { type: 'Fade', duration: 0.2 },
              animationIn: 'Pop',
              animationOut: 'None',
              adjustments: { ...DEFAULT_ADJUSTMENTS },
              textContent: assetPayload.text || 'Glowing Caption Text',
              textStyle: {
                ...DEFAULT_TEXT_STYLE,
                fontSize: 38,
                backgroundOpacity: 80,
                captionPreset: (assetPayload.style || 'WordGlowing') as any,
              },
              keyframes: [],
            };
            commitProjectChange(
              (prev) => ({ ...prev, clips: [...prev.clips, newCapClip] }),
              'Drop caption onto timeline'
            );
            setSelectedClipIds([newCapClip.id]);
          } else if (assetPayload.kind === 'sticker') {
            handleAddStickerClip(
              assetPayload.shape || 'sparkle-burst',
              assetPayload.name || 'Sticker',
              assetPayload.color || '#38BDF8',
              undefined,
              undefined,
              trackId,
              dropTime
            );
          }
        }}
        fps={project.fps}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAddKeyframeAtPlayhead={(prop = 'scaleX') => {
          const target =
            selectedClip ||
            project.clips.find(
              (c) => playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration
            ) ||
            project.clips[0];
          if (!target) return;
          const offset = Math.max(0, Math.round((playheadTime - target.startTime) * 100) / 100);
          const currentVal = Number((target as any)[prop] ?? 100);
          commitProjectChange(
            (prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === target.id
                  ? {
                      ...c,
                      keyframes: [
                        ...c.keyframes.filter(
                          (k) => !(k.property === prop && Math.abs(k.timeOffset - offset) < 0.08)
                        ),
                        {
                          id: `kf_${Date.now()}`,
                          timeOffset: offset,
                          property: prop,
                          value: currentVal,
                        },
                      ],
                    }
                  : c
              ),
            }),
            `Add ${prop} keyframe`
          );
          setSelectedClipIds([target.id]);
        }}
        onQuickVolumeChange={(vol, toggleMute) => {
          const target =
            selectedClip ||
            project.clips.find(
              (c) => playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration
            ) ||
            project.clips[0];
          if (!target) return;
          commitProjectChange(
            (prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === target.id
                  ? {
                      ...c,
                      volume: toggleMute ? c.volume : vol,
                      muted: toggleMute ? !c.muted : vol === 0,
                    }
                  : c
              ),
            }),
            'Adjust clip volume'
          );
        }}
        onClipVolumeChange={(clipId, newVol) => {
          setProject((prev) => ({
            ...prev,
            clips: prev.clips.map((c) =>
              c.id === clipId ? { ...c, volume: newVol, muted: newVol === 0 } : c
            ),
          }));
        }}
        onPencilQuickEdit={(newText, preset) => {
          const target =
            selectedClip ||
            project.clips.find(
              (c) => playheadTime >= c.startTime && playheadTime <= c.startTime + c.duration
            );
          if (target) {
            commitProjectChange(
              (prev) => ({
                ...prev,
                clips: prev.clips.map((c) =>
                  c.id === target.id
                    ? {
                        ...c,
                        name: c.type === 'text' || c.type === 'caption' ? c.name : newText,
                        textContent:
                          c.type === 'text' || c.type === 'caption' || preset ? newText : c.textContent,
                        textStyle: preset
                          ? {
                              ...(c.textStyle || DEFAULT_TEXT_STYLE),
                              captionPreset: preset,
                            }
                          : c.textStyle,
                      }
                    : c
                ),
              }),
              'Pencil quick edit'
            );
          } else {
            handleAddManualCaption(newText, preset || 'WordGlowing');
          }
        }}
        onMoveClipVertical={(clipId, direction) => {
          commitProjectChange((prev) => {
            const targetClip = prev.clips.find((c) => c.id === clipId);
            if (!targetClip) return prev;
            const compatibleTracks = prev.tracks.filter(
              (t) => !t.locked && isTrackCompatibleWithClip(t.type, targetClip.type)
            );
            const curIdx = compatibleTracks.findIndex((t) => t.id === targetClip.trackId);
            if (curIdx === -1) return prev;
            const nextIdx = curIdx + direction;
            if (nextIdx < 0 || nextIdx >= compatibleTracks.length) return prev;
            const nextTrack = compatibleTracks[nextIdx];
            return {
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === clipId ? { ...c, trackId: nextTrack.id } : c
              ),
            };
          }, 'Move clip up/down within compatible track');
        }}
        onMoveTrackVertical={(trackId, direction) => {
          commitProjectChange((prev) => {
            const idx = prev.tracks.findIndex((t) => t.id === trackId);
            if (idx === -1) return prev;
            const trackType = prev.tracks[idx].type;
            const targetIdx = idx + direction;
            if (targetIdx < 0 || targetIdx >= prev.tracks.length) return prev;
            // Keep audio tracks grouped with audio tracks and video tracks with video tracks
            if (prev.tracks[targetIdx].type !== trackType) return prev;
            const nextTracks = [...prev.tracks];
            const temp = nextTracks[idx];
            nextTracks[idx] = nextTracks[targetIdx];
            nextTracks[targetIdx] = temp;
            return { ...prev, tracks: nextTracks };
          }, 'Reorder track');
        }}
        onApplyTransitionBetweenCuts={(clipId, transitionType, duration) => {
          commitProjectChange(
            (prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      transitionIn: { type: transitionType, duration },
                    }
                  : c
              ),
            }),
            `Add ${transitionType} transition at cut`
          );
          setSelectedClipIds([clipId]);
        }}
        availableFonts={availableFonts}
        onAddCustomFont={handleAddCustomFont}
        onAutoCaptions={handleAutoCaptions}
        onAddOrUpdateCaptionFull={(opts) => {
          const posY =
            opts.positionPreset === 'top'
              ? -110
              : opts.positionPreset === 'center'
              ? 0
              : 110;
          const styleObj = {
            fontFamily: opts.fontFamily,
            fontSize: opts.fontSize,
            color: opts.color,
            strokeColor: opts.strokeColor,
            strokeWidth: opts.strokeWidth,
            shadowColor: opts.shadowColor,
            shadowBlur: opts.shadowBlur,
            backgroundColor: opts.backgroundColor,
            backgroundOpacity: opts.backgroundOpacity,
            align: opts.align,
            bold: opts.bold,
            italic: opts.italic,
            underline: opts.underline,
            captionPreset: opts.stylePreset,
          };

          if (
            opts.updateSelected &&
            selectedClip &&
            (selectedClip.type === 'caption' || selectedClip.type === 'text')
          ) {
            commitProjectChange(
              (prev) => ({
                ...prev,
                clips: prev.clips.map((c) =>
                  c.id === selectedClip.id
                    ? {
                        ...c,
                        textContent: opts.text,
                        duration: opts.duration,
                        positionY: posY,
                        animationIn: opts.animationIn,
                        animationOut: opts.animationOut,
                        animationLoop: opts.animationLoop,
                        textStyle: styleObj,
                      }
                    : c
                ),
              }),
              'Update caption with all options'
            );
            setStatusBanner({
              type: 'success',
              message: `Updated caption (${opts.stylePreset} · ${opts.fontFamily}).`,
            });
            return;
          }

          const capTrack =
            project.tracks.find((t) => t.type === 'caption') || project.tracks[0];
          const newCapClip: TimelineClip = {
            id: `cap_full_${Date.now()}`,
            trackId: capTrack.id,
            name: `Caption (${opts.stylePreset})`,
            type: 'caption',
            startTime: playheadTime,
            duration: opts.duration || 3.0,
            trimStart: 0,
            sourceDuration: opts.duration || 3.0,
            positionX: 0,
            positionY: posY,
            scaleX: 100,
            scaleY: 100,
            rotation: 0,
            flipH: false,
            flipV: false,
            anchorX: 50,
            anchorY: 50,
            opacity: 100,
            blendMode: 'normal',
            cropTop: 0,
            cropBottom: 0,
            cropLeft: 0,
            cropRight: 0,
            speed: 1,
            reversed: false,
            volume: 100,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
            pitch: 0,
            noiseReduction: false,
            effects: [],
            filterPreset: 'None',
            transitionIn: { type: 'Fade', duration: 0.2 },
            transitionOut: { type: 'Fade', duration: 0.2 },
            animationIn: opts.animationIn || 'Pop',
            animationOut: opts.animationOut || 'Fade Out',
            animationLoop: opts.animationLoop || 'None',
            adjustments: { ...DEFAULT_ADJUSTMENTS },
            textContent: opts.text,
            textStyle: styleObj,
            keyframes: [],
          };
          commitProjectChange(
            (prev) => ({ ...prev, clips: [...prev.clips, newCapClip] }),
            'Add full caption'
          );
          setSelectedClipIds([newCapClip.id]);
          setStatusBanner({
            type: 'success',
            message: `Added "${opts.stylePreset}" caption with font "${opts.fontFamily}" to CAPTIONS track.`,
          });
        }}
      />
    </WorkspacePanelBox>
  );

  const horizontalTimelineResizer = !floatingPanels.timeline &&
    maximizedPanel !== 'timeline' &&
    !collapsedPanels.timeline && (
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = timelineHeightPx;
          const onMove = (moveEv: MouseEvent) => {
            const rawDelta = startY - moveEv.clientY;
            const delta = timelineDockPosition === 'bottom' ? rawDelta : -rawDelta;
            setTimelineHeightPx(Math.max(130, Math.min(460, startH + delta)));
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        className="h-1.5 bg-slate-900 hover:bg-sky-500/70 cursor-ns-resize shrink-0 transition-colors flex items-center justify-center group"
        title="Drag up/down to resize Timeline height"
      >
        <div className="w-10 h-0.5 bg-slate-700 group-hover:bg-sky-300 rounded" />
      </div>
    );

  return (
    <div
      onMouseDownCapture={(e) => {
        if (!isPlaying) return;
        const targetEl = e.target as HTMLElement | null;
        if (targetEl && !targetEl.closest('[data-display-monitor="true"]')) {
          setIsPlaying(false);
        }
      }}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#090D16] text-slate-100 font-sans"
    >
      {/* Hidden Project & Media File Picker (.hveproject, .json, or video/audio/image) */}
      <input
        ref={projectFileInputRef}
        type="file"
        multiple
        accept=".hveproject,.json,video/*,audio/*,image/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (!list || list.length === 0) return;
          const arr = Array.from(list);
          e.target.value = '';
          handleImportFiles(arr, true);
        }}
      />

      {/* TOP BAR (Strict 3-zone contract) */}
      <header className="h-11 px-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap">
            {APP_CONFIG.appName}
          </span>
        </div>

        {/* Zone 2: Project Name, File Actions & Workspace Arrangement Controls */}
        <div className="flex items-center gap-2.5 overflow-x-auto">
          <button
            onClick={() => setShowWelcomeModal(true)}
            className="text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors whitespace-nowrap"
          >
            New / Projects
          </button>
          <button
            onClick={() => projectFileInputRef.current?.click()}
            className="text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Open
          </button>
          <input
            type="text"
            value={project.name}
            onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
            aria-label="Project Name"
            className="bg-slate-900 border border-slate-800 focus:border-sky-500 rounded px-2 py-0.5 text-xs font-medium text-slate-200 text-center w-44 focus:outline-none"
          />
          <button
            onClick={() =>
              setTimelineDockPosition((pos) => (pos === 'bottom' ? 'top' : 'bottom'))
            }
            className="text-xs font-medium text-slate-400 hover:text-sky-400 transition-colors flex items-center gap-1 whitespace-nowrap"
            title="Move Timeline to Top or Bottom"
          >
            <ArrowUpDown className="w-3 h-3" /> Swap Timeline
          </button>
          <button
            onClick={resetWorkspaceLayout}
            className="text-xs font-medium text-slate-400 hover:text-sky-400 transition-colors flex items-center gap-1 whitespace-nowrap"
            title="Reset All Panel Positions and Sizes"
          >
            <RotateCcw className="w-3 h-3" /> Reset Layout
          </button>

          {/* Compact All-Over Omni-Search Bar (Transitions, Fonts, Audio FX, Captions: Word Glowing & Multiline, Effects) */}
          <div className="relative">
            <div className="flex items-center bg-slate-900 border border-slate-700/80 focus-within:border-sky-400 rounded px-2 py-0.5 w-56">
              <Search className="w-3 h-3 text-sky-400 mr-1.5 shrink-0" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search Transition, Font, Audio FX, Word Glow..."
                className="bg-transparent text-[11px] text-slate-100 placeholder-slate-500 w-full focus:outline-none"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="text-slate-400 hover:text-white ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {globalSearch.trim() && (
              <div className="absolute left-0 top-8 w-80 max-h-80 overflow-y-auto bg-slate-950 border border-sky-500/50 rounded-md shadow-2xl p-2 z-50 space-y-1.5">
                <div className="text-[10px] font-mono text-sky-400 px-1 flex items-center justify-between">
                  <span>ALL-OVER STUDIO SEARCH</span>
                  <span>Click to Apply / Add</span>
                </div>

                {/* Caption Formats: Word Glowing & Multiline */}
                {(['WordGlowing', 'Multiline', 'Karaoke', 'Highlight', 'Cinematic', 'Modern'] as const)
                  .filter((c) => c.toLowerCase().includes(globalSearch.toLowerCase()) || 'caption glow multiline'.includes(globalSearch.toLowerCase()))
                  .map((capPreset) => (
                    <button
                      key={`cap_${capPreset}`}
                      onClick={() => {
                        handleAddManualCaption(
                          capPreset === 'Multiline'
                            ? 'First Line Caption\nSecond Line Glowing'
                            : 'Glowing Studio Caption',
                          capPreset
                        );
                        setGlobalSearch('');
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-sky-500/20 flex items-center justify-between text-xs text-slate-200"
                    >
                      <span>✦ Caption: {capPreset === 'WordGlowing' ? 'Word Glowing' : capPreset}</span>
                      <span className="text-[9px] font-mono text-amber-300 bg-amber-500/15 px-1.5 rounded">Caption</span>
                    </button>
                  ))}

                {/* Transitions */}
                {BUILTIN_TRANSITIONS.filter((t) =>
                  t.name.toLowerCase().includes(globalSearch.toLowerCase())
                ).map((tr) => (
                  <button
                    key={`tr_${tr.id}`}
                    onClick={() => {
                      handleApplyTransitionToTimeline(tr.id, tr.defaultDuration || 0.5);
                      setGlobalSearch('');
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-sky-500/20 flex items-center justify-between text-xs text-slate-200"
                  >
                    <span>⇄ {tr.name}</span>
                    <span className="text-[9px] font-mono text-sky-300 bg-sky-500/15 px-1.5 rounded">Transition</span>
                  </button>
                ))}

                {/* Fonts */}
                {BUILTIN_FONTS.filter((f) =>
                  f.toLowerCase().includes(globalSearch.toLowerCase())
                ).map((font) => (
                  <button
                    key={`font_${font}`}
                    onClick={() => {
                      handleAddTextClip(`${font} Title`, `${font} Studio Text`, 50, {
                        fontFamily: font,
                      });
                      setGlobalSearch('');
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-sky-500/20 flex items-center justify-between text-xs text-slate-200"
                  >
                    <span style={{ fontFamily: font }}>Aa {font}</span>
                    <span className="text-[9px] font-mono text-purple-300 bg-purple-500/15 px-1.5 rounded">Font</span>
                  </button>
                ))}

                {/* Audio Effects */}
                {BUILTIN_AUDIO_EFFECTS.filter(
                  (a) =>
                    a.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
                    a.category.toLowerCase().includes(globalSearch.toLowerCase())
                ).map((afx) => (
                  <button
                    key={`afx_${afx.id}`}
                    onClick={() => {
                      const targetId = selectedClipIds[0] || project.clips[0]?.id;
                      if (targetId) {
                        commitProjectChange(
                          (prev) => ({
                            ...prev,
                            clips: prev.clips.map((c) =>
                              c.id === targetId
                                ? { ...c, audioEffects: [...(c.audioEffects || []), afx.id] }
                                : c
                            ),
                          }),
                          `Apply audio FX ${afx.name}`
                        );
                      }
                      setGlobalSearch('');
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-sky-500/20 flex items-center justify-between text-xs text-slate-200"
                  >
                    <span>♪ {afx.name}</span>
                    <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/15 px-1.5 rounded">Audio FX</span>
                  </button>
                ))}

                {/* Video Effects & Filters */}
                {BUILTIN_EFFECTS.filter((fx) =>
                  fx.name.toLowerCase().includes(globalSearch.toLowerCase())
                ).map((fx) => (
                  <button
                    key={`fx_${fx.id}`}
                    onClick={() => {
                      handleApplyEffectToTimeline(fx.id);
                      setGlobalSearch('');
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-sky-500/20 flex items-center justify-between text-xs text-slate-200"
                  >
                    <span>✦ {fx.name}</span>
                    <span className="text-[9px] font-mono text-fuchsia-300 bg-fuchsia-500/15 px-1.5 rounded">Effect</span>
                  </button>
                ))}

                {/* Limitless Online Instant Generator for any query */}
                <div className="pt-1 border-t border-slate-800 flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      handleApplyTransitionToTimeline(globalSearch.trim(), 0.5);
                      setGlobalSearch('');
                    }}
                    className="px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 rounded text-[10px] font-medium"
                  >
                    + Online Transition "{globalSearch.trim()}"
                  </button>
                  <button
                    onClick={() => {
                      handleAddManualCaption(globalSearch.trim(), 'WordGlowing');
                      setGlobalSearch('');
                    }}
                    className="px-2 py-0.5 bg-fuchsia-500/20 hover:bg-fuchsia-500 text-fuchsia-300 hover:text-slate-950 rounded text-[10px] font-medium"
                  >
                    + Word Glow "{globalSearch.trim()}"
                  </button>
                  <button
                    onClick={() => {
                      handleAddManualCaption(globalSearch.trim(), 'Multiline');
                      setGlobalSearch('');
                    }}
                    className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 rounded text-[10px] font-medium"
                  >
                    + Multiline "{globalSearch.trim()}"
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zone 3: Undo, Redo, Save, Settings, Export */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 rounded transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 rounded transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleSaveProject}
            className="px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Save Project (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            <span>Save</span>
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Settings & Diagnostics"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="ml-1 px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Non-Blocking Status & Error Toast Banner */}
      {statusBanner && (
        <div
          className={`px-4 py-1 text-xs flex items-center justify-between border-b shrink-0 ${
            statusBanner.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
              : 'bg-sky-950/80 border-sky-500/30 text-sky-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'error' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button onClick={() => setStatusBanner(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Optional Docked Top Timeline if Swapped */}
      {timelineDockPosition === 'top' && (
        <>
          {timelineSectionNode}
          {horizontalTimelineResizer}
        </>
      )}

      {/* UPPER WORKSPACE: Movable & Resizable Sections */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-x-auto overflow-y-hidden">
        {topOrder.map((secId, idx) => renderSectionById(secId, idx))}
      </div>

      {/* Default Docked Bottom Timeline */}
      {timelineDockPosition === 'bottom' && (
        <>
          {horizontalTimelineResizer}
          {timelineSectionNode}
        </>
      )}

      {/* MODALS */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        project={project}
        totalDuration={totalDuration}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        autoSaveIntervalSec={autoSaveIntervalSec}
        setAutoSaveIntervalSec={setAutoSaveIntervalSec}
      />

      <WelcomeAndProjectModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onImportProjectFileFromDisk={(f) => handleImportProjectFile(f)}
        onImportMediaFilesFromDisk={(files) => handleImportFiles(files, true)}
        onCreateNewProject={(name: string, ar: AspectRatioOption, res: string, fps: number) => {
          setProject({
            id: `proj_${Date.now()}`,
            name,
            aspectRatio: ar,
            resolution: res,
            fps,
            tracks: DEFAULT_TRACKS,
            clips: [],
          });
          setUndoStack([]);
          setRedoStack([]);
          setPlayheadTime(0);
        }}
        onOpenExistingProject={(loadedProj) => {
          setProject(loadedProj);
          setUndoStack([]);
          setRedoStack([]);
          setPlayheadTime(0);
        }}
      />
    </div>
  );
}
