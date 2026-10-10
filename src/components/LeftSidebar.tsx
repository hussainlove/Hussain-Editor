import React, { useState, useRef, useMemo } from 'react';
import {
  FolderOpen,
  Upload,
  Music,
  Mic,
  Square,
  Type,
  MessageSquare,
  Smile,
  Sparkles,
  Shuffle,
  Sliders,
  LayoutTemplate,
  Search,
  Trash2,
  Plus,
  Film,
  RefreshCw,
  AlertTriangle,
  Wand2,
  Check,
  Volume2,
  Download,
  Eye,
  Shapes,
  Globe,
  X,
} from 'lucide-react';
import {
  SidebarTabId,
  ImportedMediaItem,
  TimelineClip,
  BUILTIN_EFFECTS,
  BUILTIN_FILTERS,
  BUILTIN_TRANSITIONS,
  BUILTIN_MASKS,
  BUILTIN_FONTS,
  BUILTIN_AUDIO_EFFECTS,
  ONLINE_STICKER_PACK_CATALOG,
  StickerPackCategory,
  MaskShapeType,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_TEXT_STYLE,
} from '../types/editor';
import { formatBytes } from '../utils/editorMath';

interface LeftSidebarProps {
  activeTab: SidebarTabId;
  setActiveTab: (tab: SidebarTabId) => void;
  mediaItems: ImportedMediaItem[];
  onImportFiles: (files: FileList | File[], autoAddToTimeline?: boolean) => Promise<void>;
  onImportProjectFile: (file: File) => void;
  onGenerateSamples: () => Promise<void>;
  onRemoveMedia: (id: string, deleteDisk: boolean) => Promise<void>;
  onRelinkMedia: (mediaId: string, file: File) => Promise<void>;
  onAddMediaToTimeline: (media: ImportedMediaItem) => void;
  onAddTextClip: (presetName: string, text: string, fontSize: number, styleOverrides?: Partial<typeof DEFAULT_TEXT_STYLE>) => void;
  onAutoCaptions: (style: string, mode?: 'lyrics' | 'speech') => Promise<void>;
  onAddManualCaption: (text: string, style: string) => void;
  onAddStickerClip: (
    shape: TimelineClip['stickerShape'],
    name: string,
    color: string,
    customSvgDataUrl?: string,
    customPolygonPoints?: string
  ) => void;
  selectedClip: TimelineClip | null;
  onUpdateClip: (clipId: string, updater: (c: TimelineClip) => TimelineClip, label: string) => void;
  onApplyEffectToTimeline: (effectId: string) => void;
  onApplyTransitionToTimeline: (transitionId: string, duration?: number) => void;
  onApplyFilterToTimeline: (filterId: string) => void;
  onApplyMaskToTimeline: (maskShape: MaskShapeType, customPolygon?: string) => void;
  onLoadTemplateSequence: (templateId: string) => void;
  isBusy: boolean;
}

const SIDEBAR_TABS: Array<{ id: SidebarTabId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'Media', label: 'Media', icon: FolderOpen },
  { id: 'Audio', label: 'Audio', icon: Music },
  { id: 'Text', label: 'Text', icon: Type },
  { id: 'Captions', label: 'Captions', icon: MessageSquare },
  { id: 'Stickers', label: 'Stickers', icon: Smile },
  { id: 'Effects', label: 'Effects', icon: Sparkles },
  { id: 'Transitions', label: 'Transitions', icon: Shuffle },
  { id: 'Filters', label: 'Filters', icon: Wand2 },
  { id: 'Adjust', label: 'Adjust', icon: Sliders },
  { id: 'Templates', label: 'Templates', icon: LayoutTemplate },
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeTab,
  setActiveTab,
  mediaItems,
  onImportFiles,
  onImportProjectFile,
  onGenerateSamples,
  onRemoveMedia,
  onRelinkMedia,
  onAddMediaToTimeline,
  onAddTextClip,
  onAutoCaptions,
  onAddManualCaption,
  onAddStickerClip,
  selectedClip,
  onUpdateClip,
  onApplyEffectToTimeline,
  onApplyTransitionToTimeline,
  onApplyFilterToTimeline,
  onApplyMaskToTimeline,
  onLoadTemplateSequence,
  isBusy,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const customShapeInputRef = useRef<HTMLInputElement>(null);
  const [relinkTargetId, setRelinkTargetId] = useState<string | null>(null);

  // Online Asset Store Download & Live Preview State
  const [downloadedAssetIds, setDownloadedAssetIds] = useState<string[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingItemId, setPreviewingItemId] = useState<string | null>(null);
  const [stickerPackFilter, setStickerPackFilter] = useState<StickerPackCategory>('All');
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [newFontNameInput, setNewFontNameInput] = useState('');
  const fontFileInputRef = useRef<HTMLInputElement>(null);

  // Custom User Shape & Mask Builder State
  const [customPolygonPoints, setCustomPolygonPoints] = useState(
    '50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%'
  );
  const [customShapeColor, setCustomShapeColor] = useState('#38BDF8');

  React.useEffect(() => {
    fetch('/api/store/downloaded')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.downloadedIds)) {
          setDownloadedAssetIds(d.downloadedIds);
        }
      })
      .catch(() => {});
  }, []);

  const handleDownloadOnlineAsset = async (
    assetId: string,
    assetType: 'sticker' | 'effect' | 'transition',
    assetName: string
  ) => {
    setDownloadingId(assetId);
    try {
      const res = await fetch('/api/store/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, assetType, assetName }),
      });
      if (res.ok) {
        const data = await res.json();
        setDownloadedAssetIds(data.downloadedIds || [...downloadedAssetIds, assetId]);
      } else {
        setDownloadedAssetIds((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
      }
    } catch {
      setDownloadedAssetIds((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadStickerPack = async (packIds: string[]) => {
    setDownloadingId('pack_batch');
    try {
      for (const id of packIds) {
        if (!downloadedAssetIds.includes(id)) {
          await fetch('/api/store/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId: id, assetType: 'sticker', assetName: id }),
          }).catch(() => {});
        }
      }
      setDownloadedAssetIds((prev) => Array.from(new Set([...prev, ...packIds])));
    } finally {
      setDownloadingId(null);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'duration'>('date');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');

  // Voiceover recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  // Captions state
  const [captionStyle, setCaptionStyle] = useState<string>('Modern');
  const [manualCaptionText, setManualCaptionText] = useState('Welcome to Hussain Video Editor');

  const filteredMedia = useMemo(() => {
    return mediaItems
      .filter((item) => {
        if (mediaTypeFilter !== 'all' && item.type !== mediaTypeFilter) return false;
        if (searchQuery.trim() && !item.originalName.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.originalName.localeCompare(b.originalName);
        if (sortBy === 'duration') return b.duration - a.duration;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [mediaItems, mediaTypeFilter, searchQuery, sortBy]);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingSec(0);

        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `Voiceover_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`, {
          type: 'audio/webm',
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        await onImportFiles(dt.files);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSec(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch {
      // Fallback if mic permission denied in sandbox: synthesize clean voiceover track
      await onGenerateSamples();
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0F172A] select-none overflow-hidden">
      {/* Vertical Navigation Rail */}
      <div className="w-15 bg-[#090D16] border-r border-slate-800/80 flex flex-col items-center py-2 gap-1 shrink-0 overflow-y-auto">
        {SIDEBAR_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'Captions') {
                window.dispatchEvent(new CustomEvent('hve-open-caption-window'));
              }
            }}
              className={`w-13 py-2 rounded-md flex flex-col items-center justify-center gap-1 transition-colors ${
                active
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
              title={tab.label}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Hidden File Pickers */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.mp3,.wav,.aac,.m4a,.flac,.ogg,.png,.jpg,.jpeg,.webp,.gif,.bmp,.hveproject,.json"
        className="hidden"
        onChange={async (e) => {
          const fileList = e.target.files;
          if (!fileList || fileList.length === 0) return;
          const filesArray = Array.from(fileList);
          e.target.value = '';

          const projFile = filesArray.find(
            (f) =>
              f.name.toLowerCase().endsWith('.hveproject') ||
              f.name.toLowerCase().endsWith('.json')
          );
          if (projFile) {
            onImportProjectFile(projFile);
          }

          const mediaFiles = filesArray.filter(
            (f) =>
              !f.name.toLowerCase().endsWith('.hveproject') &&
              !f.name.toLowerCase().endsWith('.json')
          );
          if (mediaFiles.length > 0) {
            await onImportFiles(mediaFiles, true);
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is standard in desktop chromium
        webkitdirectory="true"
        className="hidden"
        onChange={async (e) => {
          const fileList = e.target.files;
          if (!fileList || fileList.length === 0) return;
          const filesArray = Array.from(fileList);
          e.target.value = '';
          await onImportFiles(filesArray, false);
        }}
      />
      <input
        ref={relinkInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && relinkTargetId) {
            onRelinkMedia(relinkTargetId, f);
            setRelinkTargetId(null);
          }
        }}
      />

      {/* Active Drawer Content */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Universal Section Search & Limitless Online Generator Bar (Available in ALL Sidebar Sections) */}
        <div className="px-3 pt-2.5 pb-2 bg-[#0B1120] border-b border-slate-800/80 space-y-1.5 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-sky-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab} or type any Online ${
                activeTab === 'Text'
                  ? 'Font / Title'
                  : activeTab === 'Captions'
                  ? 'Caption Style (Word Glowing, Multiline...)'
                  : activeTab === 'Audio'
                  ? 'Audio Effect / Track'
                  : activeTab.replace(/s$/, '')
              }...`}
              className="w-full bg-slate-900 border border-slate-700/80 focus:border-sky-400 rounded pl-8 pr-7 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-white"
                title="Clear Search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Limitless Online Cloud Generator Pill whenever user types any query */}
          {searchQuery.trim() && (
            <div className="bg-sky-500/10 border border-sky-500/30 rounded p-1.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-[10px] text-sky-200 truncate">
                  Online {activeTab}: <strong>"{searchQuery.trim()}"</strong>
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activeTab === 'Stickers' &&
                !downloadedAssetIds.includes(`online_sticker_${searchQuery.trim().toLowerCase()}`) ? (
                  <button
                    onClick={() =>
                      handleDownloadOnlineAsset(
                        `online_sticker_${searchQuery.trim().toLowerCase()}`,
                        'sticker',
                        searchQuery.trim()
                      )
                    }
                    className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-[10px] flex items-center gap-1 whitespace-nowrap"
                    title="Download Online Sticker First"
                  >
                    <Download className="w-3 h-3" /> Download Online
                  </button>
                ) : (
                  <button
                    draggable
                    onDragStart={(e) => {
                      const q = searchQuery.trim();
                      const payload =
                        activeTab === 'Transitions'
                          ? { kind: 'transition', id: q, duration: 0.5 }
                          : activeTab === 'Effects'
                          ? { kind: 'effect', id: q }
                          : activeTab === 'Filters'
                          ? { kind: 'filter', id: q }
                          : activeTab === 'Stickers'
                          ? { kind: 'sticker', shape: `online:${q}`, name: q, color: '#38BDF8' }
                          : activeTab === 'Captions'
                          ? { kind: 'caption', text: q, style: 'WordGlowing' }
                          : { kind: 'text', name: q, text: q, size: 48, fontFamily: q };
                      e.dataTransfer.setData('application/hve-asset', JSON.stringify(payload));
                    }}
                    onClick={() => {
                      const q = searchQuery.trim();
                      if (activeTab === 'Transitions') {
                        onApplyTransitionToTimeline(q, 0.5);
                      } else if (activeTab === 'Effects') {
                        onApplyEffectToTimeline(q);
                      } else if (activeTab === 'Filters') {
                        onApplyFilterToTimeline(q);
                      } else if (activeTab === 'Stickers') {
                        onAddStickerClip(`online:${q}`, q, '#38BDF8');
                      } else if (activeTab === 'Captions') {
                        onAddManualCaption(q, 'WordGlowing');
                      } else if (activeTab === 'Audio' && selectedClip) {
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            audioEffects: [...(c.audioEffects || []), q],
                          }),
                          `Apply online audio effect ${q}`
                        );
                      } else {
                        onAddTextClip(`Online Font: ${q}`, q, 48, { fontFamily: q });
                      }
                    }}
                    className="px-2 py-0.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-[10px] cursor-grab active:cursor-grabbing whitespace-nowrap"
                    title="Click or Drag to Timeline"
                  >
                    + Use / Drag Online
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {activeTab === 'Media' && (
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-2.5">
            <div className="flex items-center justify-between gap-1">
              <h2 className="text-xs font-semibold text-slate-200 tracking-wide truncate">
                Project & Media Import
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                  title="Import Video, Audio, Image, or .hveproject File"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isBusy ? 'Importing...' : 'Import Media / Project'}
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isBusy}
                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors whitespace-nowrap cursor-pointer"
                  title="Import Folder"
                >
                  Folder
                </button>
              </div>
            </div>

            {/* Filter & Sort Controls */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                  {(['all', 'video', 'audio', 'image'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMediaTypeFilter(t)}
                      className={`px-2 py-0.5 rounded capitalize transition-colors ${
                        mediaTypeFilter === t ? 'bg-slate-800 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 text-[11px]"
                >
                  <option value="date">Newest</option>
                  <option value="name">Name</option>
                  <option value="duration">Duration</option>
                </select>
              </div>
            </div>

            {/* Dropzone & Media Grid */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) {
                  const dropped = Array.from(e.dataTransfer.files);
                  const proj = dropped.find(
                    (f) =>
                      f.name.toLowerCase().endsWith('.hveproject') ||
                      f.name.toLowerCase().endsWith('.json')
                  );
                  if (proj) onImportProjectFile(proj);
                  const mediaDropped = dropped.filter(
                    (f) =>
                      !f.name.toLowerCase().endsWith('.hveproject') &&
                      !f.name.toLowerCase().endsWith('.json')
                  );
                  if (mediaDropped.length > 0) {
                    onImportFiles(mediaDropped, true);
                  }
                }
              }}
              className="flex-1 overflow-y-auto space-y-2 pr-1"
            >
              {filteredMedia.length === 0 ? (
                <div className="h-60 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center p-4 text-center gap-2">
                  <Film className="w-7 h-7 text-slate-500" />
                  <p className="text-xs text-slate-300 font-medium">Drop videos, audio, or images here</p>
                  <p className="text-[11px] text-slate-500">
                    Supports MP4, MOV, MKV, WEBM, MP3, WAV, FLAC, PNG, JPG
                  </p>
                  <button
                    onClick={onGenerateSamples}
                    disabled={isBusy}
                    className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                    Load FFmpeg Studio Sample Clips
                  </button>
                </div>
              ) : (
                filteredMedia.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/hve-media-id', item.id);
                    }}
                    className="group bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800 rounded-md p-2 flex gap-2.5 items-center transition-colors"
                  >
                    <div className="w-16 h-11 bg-slate-950 rounded overflow-hidden shrink-0 relative flex items-center justify-center border border-slate-800">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.originalName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-sky-400" />
                      )}
                      <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] font-mono tabular-nums px-1 rounded text-slate-200">
                        {item.duration.toFixed(1)}s
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-slate-200 truncate" title={item.originalName}>
                          {item.originalName}
                        </p>
                        {item.isOffline && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-0.5 shrink-0">
                            <AlertTriangle className="w-3 h-3" /> Offline
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums flex items-center gap-1 mt-0.5">
                        <span>{item.format}</span>
                        <span>·</span>
                        <span>{item.width > 0 ? `${item.width}x${item.height}` : 'Audio'}</span>
                        <span>·</span>
                        <span>{item.fps}fps</span>
                        <span>·</span>
                        <span>{formatBytes(item.fileSize)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.isOffline ? (
                        <button
                          onClick={() => {
                            setRelinkTargetId(item.id);
                            relinkInputRef.current?.click();
                          }}
                          className="px-2 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded text-[10px] font-medium"
                        >
                          Relink
                        </button>
                      ) : (
                        <button
                          onClick={() => onAddMediaToTimeline(item)}
                          className="p-1.5 bg-sky-500/15 hover:bg-sky-500 text-sky-400 hover:text-slate-950 rounded transition-colors"
                          title="Add to Timeline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveMedia(item.id, false)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        title="Remove from project (keeps disk file)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'Audio' && (
          <div className="flex flex-col h-full p-3 gap-3 overflow-y-auto">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">Audio & Voiceover Studio</h2>

            {/* Voice Recorder */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">Record Microphone Voiceover</span>
                <span className="text-xs font-mono tabular-nums text-rose-400">
                  {isRecording ? `REC 00:${String(recordingSec).padStart(2, '0')}` : 'Ready'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <button
                    onClick={startVoiceRecording}
                    className="w-full py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Start Voice Recording
                  </button>
                ) : (
                  <button
                    onClick={stopVoiceRecording}
                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/40 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop & Import Voiceover
                  </button>
                )}
              </div>
            </div>

            {/* Import Audio Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-200 font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Volume2 className="w-4 h-4 text-sky-400" />
              Import Music / WAV / MP3 / FLAC
            </button>

            <div className="border-t border-slate-800 pt-2 space-y-2">
              <span className="text-[11px] text-slate-400 font-medium">Available Audio Assets (Drag to Timeline)</span>
              {mediaItems
                .filter(
                  (m) =>
                    (m.type === 'audio' || m.hasAudio) &&
                    (!searchQuery.trim() ||
                      m.originalName.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/hve-media-id', item.id);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded p-2 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-slate-200 truncate">{item.originalName}</p>
                      <p className="text-[10px] text-slate-400 font-mono tabular-nums">
                        {item.duration.toFixed(1)}s · {item.audioCodec.toUpperCase()}
                      </p>
                    </div>
                    <button
                      onClick={() => onAddMediaToTimeline(item)}
                      className="px-2 py-1 bg-sky-500/15 hover:bg-sky-500 text-sky-400 hover:text-slate-950 rounded text-xs font-medium"
                    >
                      Add
                    </button>
                  </div>
                ))}
            </div>

            {/* Built-in & Online Audio Effects Rack */}
            <div className="border-t border-slate-800 pt-2 space-y-1.5">
              <span className="text-[11px] text-slate-400 font-medium">
                Audio Effects & Mastering Presets (Click or Drag to Timeline)
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {BUILTIN_AUDIO_EFFECTS.filter(
                  (afx) =>
                    !searchQuery.trim() ||
                    afx.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    afx.category.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((afx) => {
                  const isActive = selectedClip?.audioEffects?.includes(afx.id) || false;
                  return (
                    <div
                      key={afx.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/hve-asset',
                          JSON.stringify({ kind: 'audio-effect', id: afx.id })
                        );
                      }}
                      className="bg-slate-900 border border-slate-800 rounded p-2 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-slate-200 font-medium truncate">{afx.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {afx.category} · {afx.desc}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!selectedClip) return;
                          onUpdateClip(
                            selectedClip.id,
                            (c) => {
                              const curr = c.audioEffects || [];
                              const has = curr.includes(afx.id);
                              return {
                                ...c,
                                audioEffects: has
                                  ? curr.filter((x) => x !== afx.id)
                                  : [...curr, afx.id],
                              };
                            },
                            `Toggle audio effect ${afx.name}`
                          );
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-medium shrink-0 ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950'
                        }`}
                      >
                        {isActive ? 'Active' : '+ Apply'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Text' && (
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-2.5 overflow-y-auto">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
              Typography, Motion Titles & Fonts (Drag to Timeline)
            </h2>
            {[
              { name: 'Default Heading', text: 'MAIN HEADLINE', size: 64, bg: 0, preset: 'Bold' },
              { name: 'Word Glowing Title', text: 'GLOWING NEON MOTION', size: 54, bg: 40, preset: 'WordGlowing' },
              { name: 'Multiline Stacked Title', text: 'FIRST LINE HEADLINE\nSECOND LINE SUBTITLE', size: 46, bg: 75, preset: 'Multiline' },
              { name: 'Subtitle Bar', text: 'Clear Documentary Subtitle', size: 38, bg: 75, preset: 'Modern' },
              { name: 'Lower Third Broadcast', text: 'Hussain Studio · Senior Director', size: 34, bg: 85, preset: 'Cinematic' },
              { name: 'Callout Annotation', text: 'Key Detail Highlight →', size: 40, bg: 90, preset: 'Highlight' },
              { name: 'Minimal Title', text: 'CHAPTER 01', size: 52, bg: 0, preset: 'Minimal' },
            ]
              .filter(
                (p) =>
                  !searchQuery.trim() ||
                  p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.text.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((preset) => (
                <div
                  key={preset.name}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/hve-asset',
                      JSON.stringify({
                        kind: 'text',
                        name: preset.name,
                        text: preset.text,
                        size: preset.size,
                        bg: preset.bg,
                        captionPreset: preset.preset,
                      })
                    );
                  }}
                  className="bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-md p-2.5 flex items-center justify-between gap-2 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{preset.name}</p>
                    <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{preset.text}</p>
                  </div>
                  <button
                    onClick={() =>
                      onAddTextClip(preset.name, preset.text, preset.size, {
                        backgroundOpacity: preset.bg,
                        captionPreset: preset.preset as any,
                      })
                    }
                    className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              ))}

            {/* Font Family Catalog (Built-in + Added Custom/Online Fonts) */}
            <div className="border-t border-slate-800 pt-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">
                  Font Library & +Add Font
                </span>
                <button
                  type="button"
                  onClick={() => fontFileInputRef.current?.click()}
                  className="px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                  title="Upload Custom Font File (.ttf, .otf, .woff2)"
                >
                  <Upload className="w-2.5 h-2.5" /> + Upload Font File
                </button>
                <input
                  ref={fontFileInputRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const cleanName = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[^a-zA-Z0-9 _-]/g, '');
                    try {
                      const buf = await file.arrayBuffer();
                      const fontFace = new FontFace(cleanName, buf);
                      await fontFace.load();
                      document.fonts.add(fontFace);
                    } catch {
                      // fallback if FontFace fails
                    }
                    setCustomFonts((prev) => (prev.includes(cleanName) ? prev : [cleanName, ...prev]));
                    if (selectedClip && (selectedClip.type === 'text' || selectedClip.type === 'caption')) {
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({
                          ...c,
                          textStyle: { ...(c.textStyle || DEFAULT_TEXT_STYLE), fontFamily: cleanName },
                        }),
                        `Apply uploaded font ${cleanName}`
                      );
                    } else {
                      onAddTextClip(`${cleanName} Title`, `${cleanName} Studio Text`, 50, {
                        fontFamily: cleanName,
                      });
                    }
                  }}
                />
              </div>

              {/* Add Online / Custom Font by Name Input */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newFontNameInput}
                  onChange={(e) => setNewFontNameInput(e.target.value)}
                  placeholder="Type font name (e.g. Bebas Neue, Oswald, Anton)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const fName = newFontNameInput.trim();
                    if (!fName) return;
                    setCustomFonts((prev) => (prev.includes(fName) ? prev : [fName, ...prev]));
                    setNewFontNameInput('');
                    if (selectedClip && (selectedClip.type === 'text' || selectedClip.type === 'caption')) {
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({
                          ...c,
                          textStyle: { ...(c.textStyle || DEFAULT_TEXT_STYLE), fontFamily: fName },
                        }),
                        `Set font ${fName}`
                      );
                    } else {
                      onAddTextClip(`${fName} Title`, `${fName} Text`, 50, { fontFamily: fName });
                    }
                  }}
                  className="px-2 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-[10px] whitespace-nowrap"
                >
                  + Add Font
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {[...customFonts, ...BUILTIN_FONTS]
                  .filter(
                    (f) => !searchQuery.trim() || f.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((fontName) => (
                  <div
                    key={fontName}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/hve-asset',
                        JSON.stringify({
                          kind: 'text',
                          name: `${fontName} Title`,
                          text: `${fontName} Headline`,
                          size: 50,
                          fontFamily: fontName,
                        })
                      );
                    }}
                    className="bg-slate-900/90 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
                  >
                    <span style={{ fontFamily: fontName }} className="text-xs text-slate-200 truncate">
                      {fontName}
                    </span>
                    <button
                      onClick={() => {
                        if (selectedClip && (selectedClip.type === 'text' || selectedClip.type === 'caption')) {
                          onUpdateClip(
                            selectedClip.id,
                            (c) => ({
                              ...c,
                              textStyle: { ...(c.textStyle || DEFAULT_TEXT_STYLE), fontFamily: fontName },
                            }),
                            `Set font ${fontName}`
                          );
                        } else {
                          onAddTextClip(`${fontName} Title`, `${fontName} Text`, 50, {
                            fontFamily: fontName,
                          });
                        }
                      }}
                      className="px-2 py-0.5 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 rounded text-[10px] font-medium"
                    >
                      Use Font
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Captions' && (
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-3 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
                Auto Lyrics & Speech Captions
              </h2>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('hve-open-caption-window'))}
                className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded text-[11px] flex items-center gap-1 shadow-xs"
              >
                <MessageSquare className="w-3 h-3" /> Open Full Caption Window
              </button>
            </div>

            <div className="bg-slate-900 border border-sky-500/30 rounded-md p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-sky-300">
                  Auto Lyrics, Word Glowing & Multiline Sync
                </p>
                <span className="text-[10px] font-mono text-emerald-400">All Formats</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Select or drag any caption format (including Word Glowing & Multiline) directly onto the timeline.
              </p>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">
                  Caption Format & Style (Click or Drag to Timeline)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      'WordGlowing',
                      'Multiline',
                      'Karaoke',
                      'Highlight',
                      'Modern',
                      'Bold',
                      'Cinematic',
                      'Podcast',
                      'Minimal',
                      'Clean',
                    ] as const
                  )
                    .filter(
                      (st) =>
                        !searchQuery.trim() || st.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((st) => (
                      <button
                        key={st}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/hve-asset',
                            JSON.stringify({
                              kind: 'caption',
                              text:
                                st === 'Multiline'
                                  ? 'First Line Caption\nSecond Line Glowing'
                                  : manualCaptionText,
                              style: st,
                            })
                          );
                        }}
                        onClick={() => {
                          setCaptionStyle(st);
                          if (selectedClip && (selectedClip.type === 'caption' || selectedClip.type === 'text')) {
                            onUpdateClip(
                              selectedClip.id,
                              (c) => ({
                                ...c,
                                textStyle: {
                                  ...(c.textStyle || DEFAULT_TEXT_STYLE),
                                  captionPreset: st,
                                },
                              }),
                              `Set caption style ${st}`
                            );
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs text-left border transition-colors cursor-grab active:cursor-grabbing ${
                          captionStyle === st
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-medium'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {st === 'WordGlowing' ? '✦ Word Glowing' : st === 'Multiline' ? '☰ Multiline' : st}
                      </button>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <button
                  onClick={() => onAutoCaptions(captionStyle, 'lyrics')}
                  disabled={isBusy}
                  className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  ✦ Generate Captions Now ({captionStyle})
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onAutoCaptions('Karaoke', 'lyrics')}
                    disabled={isBusy}
                    className="py-1.5 px-2 bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/40 font-semibold rounded text-[11px] flex items-center justify-center gap-1 transition-colors"
                  >
                    <Music className="w-3 h-3" />
                    Auto Lyrics
                  </button>
                  <button
                    onClick={() => onAutoCaptions(captionStyle, 'speech')}
                    disabled={isBusy}
                    className="py-1.5 px-2 bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-slate-950 border border-purple-500/40 font-semibold rounded text-[11px] flex items-center justify-center gap-1 transition-colors"
                  >
                    <Wand2 className="w-3 h-3" />
                    Auto Speech
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-md p-3 space-y-2">
              <p className="text-xs font-medium text-slate-200">Manual Lyric / Caption Line</p>
              <textarea
                value={manualCaptionText}
                onChange={(e) => setManualCaptionText(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
              />
              <button
                onClick={() => onAddManualCaption(manualCaptionText, captionStyle)}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
              >
                + Insert Lyric / Caption at Playhead
              </button>
            </div>
          </div>
        )}

        {activeTab === 'Stickers' && (
          <div className="flex flex-col h-full p-3 gap-3 overflow-y-auto">
            {/* Hidden Custom Shape Uploader */}
            <input
              ref={customShapeInputRef}
              type="file"
              accept=".svg,.png,.webp,.jpg,.jpeg,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  onAddStickerClip(
                    'custom-shape',
                    `Own Shape: ${f.name.slice(0, 14)}`,
                    customShapeColor,
                    String(reader.result)
                  );
                };
                reader.readAsDataURL(f);
              }}
            />

            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
                Stickers, Masks & Own Shapes
              </h2>
              <span className="text-[10px] text-sky-400 font-mono">Live Preview</span>
            </div>

            {/* Section 1: Create / Upload Your Own Custom Shape & Mask */}
            <div className="bg-slate-900 border border-sky-500/30 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-300 flex items-center gap-1">
                  <Shapes className="w-3.5 h-3.5" /> Use Your Own Custom Shape
                </span>
                <input
                  type="color"
                  value={customShapeColor}
                  onChange={(e) => setCustomShapeColor(e.target.value)}
                  className="w-5 h-5 rounded bg-transparent cursor-pointer"
                  title="Custom Shape Color"
                />
              </div>

              {/* Live Custom Shape Preview Box */}
              <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded p-2">
                <div className="w-12 h-12 bg-slate-900 rounded flex items-center justify-center shrink-0 border border-slate-800">
                  <div
                    style={{
                      clipPath: `polygon(${customPolygonPoints})`,
                      backgroundColor: customShapeColor,
                    }}
                    className="w-8 h-8 transition-all duration-300"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <label className="text-[10px] text-slate-400 block">
                    Custom Polygon Points (Edit or Pick Preset):
                  </label>
                  <input
                    type="text"
                    value={customPolygonPoints}
                    onChange={(e) => setCustomPolygonPoints(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="flex gap-1 text-[10px]">
                {[
                  { name: 'Pentagon', pts: '50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%' },
                  { name: 'Octagon', pts: '30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%' },
                  { name: 'Shield', pts: '50% 0%, 100% 20%, 85% 80%, 50% 100%, 15% 80%, 0% 20%' },
                ].map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setCustomPolygonPoints(p.pts)}
                    className="flex-1 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300"
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() =>
                    onAddStickerClip(
                      'custom-shape',
                      'Custom Polygon Shape',
                      customShapeColor,
                      undefined,
                      customPolygonPoints
                    )
                  }
                  className="py-1.5 px-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-[11px] flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Own Shape
                </button>
                <button
                  onClick={() =>
                    onApplyMaskToTimeline('custom-polygon', customPolygonPoints)
                  }
                  className="py-1.5 px-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 font-medium rounded text-[11px] flex items-center justify-center gap-1"
                >
                  Mask Video w/ Own Shape
                </button>
              </div>

              <button
                onClick={() => customShapeInputRef.current?.click()}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3 h-3 text-sky-400" /> Upload Own SVG / PNG Shape File
              </button>
            </div>

            {/* Section 2: Video & Image Clip Mask Shapes (All Shapes + Live Preview) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">
                  Clip Mask Shapes (Apply to Video / Image)
                </span>
                {selectedClip?.mask && selectedClip.mask.shape !== 'none' && (
                  <button
                    onClick={() => onApplyMaskToTimeline('none')}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Remove Mask
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {BUILTIN_MASKS.map((msk) => {
                  const isActive = selectedClip?.mask?.shape === msk.id;
                  return (
                    <button
                      key={msk.id}
                      onClick={() =>
                        onApplyMaskToTimeline(
                          msk.id,
                          msk.id === 'custom-polygon' ? customPolygonPoints : undefined
                        )
                      }
                      className={`p-2 rounded border text-left flex items-center gap-2 transition-colors ${
                        isActive
                          ? 'bg-sky-500/15 border-sky-500 text-sky-300'
                          : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <div className="w-8 h-8 rounded bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                        <div
                          style={{
                            clipPath: msk.clipPath === 'none' ? undefined : msk.clipPath,
                          }}
                          className="w-6 h-6 bg-gradient-to-tr from-sky-400 to-purple-500"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate">{msk.name}</p>
                        <span className="text-[9px] text-sky-400 font-mono">
                          {isActive ? '● Masked' : '+ Mask Clip'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: All Sticker Packs (Emojis, Arrows, Circles, Shapes, Badges — Online Mode Download) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  Online Sticker Packs ({ONLINE_STICKER_PACK_CATALOG.length}+)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const packItems = ONLINE_STICKER_PACK_CATALOG.filter(
                      (s) => stickerPackFilter === 'All' || s.category === stickerPackFilter
                    ).map((s) => s.shape);
                    handleDownloadStickerPack(packItems);
                  }}
                  disabled={downloadingId === 'pack_batch'}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                  title="Download All Stickers in Current Pack (Online Mode)"
                >
                  <Download className="w-2.5 h-2.5" />
                  {downloadingId === 'pack_batch' ? 'Downloading...' : `Download ${stickerPackFilter} Pack`}
                </button>
              </div>

              {/* Category Filter Tabs: All, Emojis, Arrows, Circles, Shapes, Badges */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {(['All', 'Emojis', 'Arrows', 'Circles', 'Shapes', 'Badges'] as StickerPackCategory[]).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setStickerPackFilter(cat)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border transition-colors ${
                        stickerPackFilter === cat
                          ? 'bg-sky-500 text-slate-950 border-sky-400 font-semibold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {ONLINE_STICKER_PACK_CATALOG.filter(
                  (item) =>
                    (stickerPackFilter === 'All' || item.category === stickerPackFilter) &&
                    (!searchQuery.trim() ||
                      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      item.category.toLowerCase().includes(searchQuery.toLowerCase()))
                ).map((item) => {
                  const isDownloaded = downloadedAssetIds.includes(item.shape);
                  const isPreviewing = previewingItemId === item.shape;
                  return (
                    <div
                      key={item.shape}
                      draggable={isDownloaded}
                      onDragStart={(e) => {
                        if (!isDownloaded) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.setData(
                          'application/hve-asset',
                          JSON.stringify({
                            kind: 'sticker',
                            shape: item.shape,
                            name: item.label,
                            color: item.color,
                          })
                        );
                      }}
                      onMouseEnter={() => setPreviewingItemId(item.shape)}
                      onMouseLeave={() => setPreviewingItemId(null)}
                      className={`bg-slate-900 border rounded-md p-2 flex flex-col justify-between gap-2 transition-colors ${
                        isDownloaded
                          ? 'border-slate-800 hover:border-sky-500/50 cursor-grab active:cursor-grabbing'
                          : 'border-amber-500/25'
                      }`}
                    >
                      {/* Visual Animated Preview Box */}
                      <div className="h-12 bg-slate-950 rounded border border-slate-800/80 flex items-center justify-center relative overflow-hidden">
                        <div
                          style={{ color: item.color }}
                          className={`transition-transform duration-300 flex items-center justify-center ${
                            isPreviewing ? 'scale-125 rotate-6' : 'scale-100'
                          }`}
                        >
                          {item.glyph ? (
                            <span className="text-xl leading-none drop-shadow">{item.glyph}</span>
                          ) : item.shape === 'circle' ? (
                            <div className="w-7 h-7 rounded-full border-2 border-current" />
                          ) : item.shape === 'circle-dashed' ? (
                            <div className="w-7 h-7 rounded-full border-2 border-dashed border-current" />
                          ) : item.shape === 'circle-neon-glow' ? (
                            <div className="w-7 h-7 rounded-full border-2 border-current shadow-[0_0_12px_currentColor]" />
                          ) : item.shape === 'circle-crosshair' ? (
                            <div className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                            </div>
                          ) : item.shape === 'circle-double' ? (
                            <div className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center">
                              <div className="w-4 h-4 rounded-full border border-current" />
                            </div>
                          ) : item.shape === 'circle-dotted' ? (
                            <div className="w-7 h-7 rounded-full border-2 border-dotted border-current" />
                          ) : item.shape === 'circle-radar' ? (
                            <div className="w-7 h-7 rounded-full bg-current/20 border-2 border-current flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-current" />
                            </div>
                          ) : item.shape === 'rectangle' ? (
                            <div className="w-8 h-5 border-2 border-current rounded-xs" />
                          ) : item.shape === 'shape-triangle' ? (
                            <div
                              style={{ clipPath: 'polygon(50% 8%, 95% 92%, 5% 92%)', backgroundColor: item.color }}
                              className="w-6 h-6"
                            />
                          ) : item.shape === 'shape-diamond' ? (
                            <div
                              style={{ clipPath: 'polygon(50% 5%, 95% 50%, 50% 95%, 5% 50%)', backgroundColor: item.color }}
                              className="w-6 h-6"
                            />
                          ) : item.shape === 'shape-hexagon' ? (
                            <div
                              style={{ clipPath: 'polygon(25% 5%, 75% 5%, 98% 50%, 75% 95%, 25% 95%, 2% 50%)', backgroundColor: item.color }}
                              className="w-6 h-6"
                            />
                          ) : item.shape === 'shape-octagon' ? (
                            <div
                              style={{ clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)', backgroundColor: item.color }}
                              className="w-6 h-6"
                            />
                          ) : item.shape === 'shape-starburst' ? (
                            <span className="text-xl leading-none">✸</span>
                          ) : item.shape === 'shape-pentagon' ? (
                            <div
                              style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', backgroundColor: item.color }}
                              className="w-6 h-6"
                            />
                          ) : item.shape === 'shape-shield' ? (
                            <div
                              style={{ clipPath: 'polygon(50% 0%, 100% 20%, 85% 80%, 50% 100%, 15% 80%, 0% 20%)', backgroundColor: item.color }}
                              className="w-6 h-6"
                            />
                          ) : item.shape === 'subscribe-pill' ? (
                            <span className="px-2 py-0.5 bg-rose-600 text-white text-[9px] font-bold rounded-full">
                              SUB ▶
                            </span>
                          ) : item.shape === 'rec-badge' ? (
                            <span className="px-1.5 py-0.5 bg-black text-rose-500 border border-rose-500/50 text-[9px] font-mono">
                              REC ●
                            </span>
                          ) : item.shape === 'badge-live' ? (
                            <span className="px-1.5 py-0.5 bg-rose-600 text-white text-[9px] font-bold rounded">
                              LIVE
                            </span>
                          ) : item.shape === 'badge-like-bell' ? (
                            <span className="px-1.5 py-0.5 bg-sky-500 text-slate-950 text-[9px] font-bold rounded-full">
                              👍 🔔
                            </span>
                          ) : item.shape === 'badge-new' ? (
                            <span className="px-1.5 py-0.5 bg-amber-400 text-slate-950 text-[9px] font-bold rounded">
                              NEW ★
                            </span>
                          ) : item.shape === 'badge-4k' ? (
                            <span className="px-1.5 py-0.5 bg-slate-800 text-white border border-white/30 text-[9px] font-mono font-bold rounded">
                              4K UHD
                            </span>
                          ) : item.shape === 'line' ? (
                            <div className="w-9 h-1 bg-current rounded" />
                          ) : (
                            <Sparkles className="w-5 h-5" />
                          )}
                        </div>
                        <span
                          className={`absolute top-1 right-1 text-[8px] font-mono px-1 rounded ${
                            isDownloaded
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {isDownloaded ? 'Downloaded' : 'Online'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-slate-200 font-medium truncate">
                          {item.label}
                        </span>
                        <span className="text-[8px] font-mono text-slate-500 shrink-0">
                          {item.category}
                        </span>
                      </div>

                      {isDownloaded ? (
                        <button
                          onClick={() => onAddStickerClip(item.shape, item.label, item.color)}
                          className="w-full py-1 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Use / Drag
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleDownloadOnlineAsset(item.shape, 'sticker', item.label)
                          }
                          disabled={downloadingId === item.shape}
                          className="w-full py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          {downloadingId === item.shape ? 'Downloading...' : 'Download Online'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Effects' && (
          <div className="flex flex-col h-full p-3 gap-2 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
                Video Effects (Preview & Online Download)
              </h2>
              <span className="text-[10px] text-sky-400 font-mono">
                {selectedClip ? selectedClip.name.slice(0, 12) : 'Auto-Target'}
              </span>
            </div>
            {BUILTIN_EFFECTS.filter(
              (fx) =>
                !searchQuery.trim() ||
                fx.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                fx.category.toLowerCase().includes(searchQuery.toLowerCase())
            ).map((fx) => {
              const isApplied = selectedClip?.effects?.includes(fx.id) || false;
              const isDownloaded = !fx.isOnlineAsset || downloadedAssetIds.includes(fx.id);
              const isPreviewing = previewingItemId === fx.id;

              const previewFilter =
                fx.id === 'Blur'
                  ? 'blur(2px)'
                  : fx.id === 'Gaussian Blur'
                  ? 'blur(4px)'
                  : fx.id === 'Grayscale'
                  ? 'grayscale(1)'
                  : fx.id === 'Color Tint'
                  ? 'sepia(0.8) hue-rotate(260deg)'
                  : fx.id === 'Chromatic Split'
                  ? 'contrast(1.3) drop-shadow(-2px 0 0 #ef4444) drop-shadow(2px 0 0 #38bdf8)'
                  : fx.id === 'VHS Retro'
                  ? 'sepia(0.5) contrast(1.2)'
                  : 'contrast(1.15) saturate(1.25)';

              return (
                <div
                  key={fx.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/hve-asset',
                      JSON.stringify({ kind: 'effect', id: fx.id })
                    );
                  }}
                  onMouseEnter={() => setPreviewingItemId(fx.id)}
                  onMouseLeave={() => setPreviewingItemId(null)}
                  className="bg-slate-900 border border-slate-800 rounded p-2 flex items-center justify-between gap-2.5 cursor-grab active:cursor-grabbing"
                >
                  {/* Visual Effect Live Thumbnail Preview */}
                  <div className="w-14 h-10 rounded bg-slate-950 border border-slate-800 overflow-hidden shrink-0 relative flex items-center justify-center">
                    <div
                      style={{ filter: previewFilter }}
                      className={`w-full h-full bg-gradient-to-br from-sky-500 via-purple-500 to-amber-400 flex items-center justify-center transition-transform duration-300 ${
                        isPreviewing ? 'scale-110' : 'scale-100'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 text-white drop-shadow" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-200 truncate">{fx.name}</span>
                      <span className="text-[9px] text-slate-400 shrink-0">· {fx.category}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{fx.desc}</p>
                  </div>

                  {isDownloaded ? (
                    <button
                      onClick={() => onApplyEffectToTimeline(fx.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 shrink-0 ${
                        isApplied
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950'
                      }`}
                    >
                      {isApplied ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {isApplied ? 'Active' : 'Use'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownloadOnlineAsset(fx.id, 'effect', fx.name)}
                      disabled={downloadingId === fx.id}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      <Download className="w-3 h-3" />
                      {downloadingId === fx.id ? '...' : 'Download'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'Transitions' && (
          <div className="flex flex-col h-full p-3 gap-2.5 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
                Transitions (Preview & Online Download)
              </h2>
              <span className="text-[10px] text-sky-400 font-mono">
                {selectedClip ? `${selectedClip.transitionIn.duration.toFixed(2)}s` : '0.50s'}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Transition Duration</span>
                <span className="font-mono tabular-nums text-sky-400">
                  {(selectedClip?.transitionIn.duration || 0.5).toFixed(2)}s
                </span>
              </div>
              <div className="flex gap-1">
                {[0.1, 0.25, 0.5, 1.0, 2.0].map((dur) => (
                  <button
                    key={dur}
                    onClick={() =>
                      onApplyTransitionToTimeline(
                        selectedClip?.transitionIn.type && selectedClip.transitionIn.type !== 'None'
                          ? selectedClip.transitionIn.type
                          : 'Fade',
                        dur
                      )
                    }
                    className={`flex-1 py-1 rounded text-[11px] font-mono tabular-nums border ${
                      (selectedClip?.transitionIn.duration || 0.5) === dur
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {dur}s
                  </button>
                ))}
              </div>
            </div>

            {BUILTIN_TRANSITIONS.filter(
              (tr) =>
                !searchQuery.trim() ||
                tr.name.toLowerCase().includes(searchQuery.toLowerCase())
            ).map((tr) => {
              const active = selectedClip?.transitionIn.type === tr.id;
              const isDownloaded = !tr.isOnlineAsset || downloadedAssetIds.includes(tr.id);
              const isPreviewing = previewingItemId === tr.id;

              return (
                <div
                  key={tr.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/hve-asset',
                      JSON.stringify({
                        kind: 'transition',
                        id: tr.id,
                        duration: selectedClip?.transitionIn.duration || tr.defaultDuration || 0.5,
                      })
                    );
                  }}
                  onMouseEnter={() => setPreviewingItemId(tr.id)}
                  onMouseLeave={() => setPreviewingItemId(null)}
                  className={`w-full p-2 rounded border flex items-center justify-between gap-2.5 transition-colors cursor-grab active:cursor-grabbing ${
                    active
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  {/* Animated Transition Mini Preview Box */}
                  <div className="w-14 h-9 rounded bg-slate-950 border border-slate-800 overflow-hidden relative flex items-center justify-center shrink-0">
                    <div
                      className={`w-full h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500 ${
                        isPreviewing
                          ? tr.id.includes('Slide') || tr.id.includes('Push') || tr.id.includes('Whip')
                            ? 'translate-x-2 scale-105'
                            : tr.id.includes('Zoom') || tr.id.includes('Spin')
                            ? 'scale-125 rotate-6'
                            : 'opacity-40'
                          : 'opacity-90'
                      }`}
                    />
                    <span className="absolute text-[9px] font-mono font-bold text-slate-950">
                      A⇄B
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{tr.name}</p>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {tr.isOnlineAsset ? 'Online Pack' : 'Built-in'} · {tr.defaultDuration || 0.5}s
                    </span>
                  </div>

                  {isDownloaded ? (
                    <button
                      onClick={() =>
                        onApplyTransitionToTimeline(
                          tr.id,
                          selectedClip?.transitionIn.duration || tr.defaultDuration || 0.5
                        )
                      }
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 shrink-0 ${
                        active
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950'
                      }`}
                    >
                      {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {active ? 'Active' : 'Use'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownloadOnlineAsset(tr.id, 'transition', tr.name)}
                      disabled={downloadingId === tr.id}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      <Download className="w-3 h-3" />
                      {downloadingId === tr.id ? '...' : 'Download'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'Filters' && (
          <div className="flex flex-col h-full p-3 gap-2 overflow-y-auto">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">Color Grading LUTs & Filters</h2>
            <div className="grid grid-cols-2 gap-2">
              {BUILTIN_FILTERS.filter(
                (flt) =>
                  !searchQuery.trim() ||
                  flt.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((flt) => {
                const active = selectedClip?.filterPreset === flt.id;
                return (
                  <button
                    key={flt.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/hve-asset',
                        JSON.stringify({ kind: 'filter', id: flt.id })
                      );
                    }}
                    onClick={() => onApplyFilterToTimeline(flt.id)}
                    className={`p-2.5 rounded border text-left transition-colors cursor-grab active:cursor-grabbing ${
                      active
                        ? 'bg-sky-500/15 border-sky-500 text-sky-300'
                        : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className="w-full h-10 rounded mb-1.5 bg-gradient-to-r from-sky-500 via-amber-400 to-rose-500"
                      style={{ filter: flt.css }}
                    />
                    <p className="text-xs font-medium truncate">{flt.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'Adjust' && (
          <div className="flex flex-col h-full p-3 gap-2.5 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-200 tracking-wide">Color & Light Adjustments</h2>
              {selectedClip && (
                <button
                  onClick={() =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({ ...c, adjustments: { ...DEFAULT_ADJUSTMENTS } }),
                      'Reset color adjustments'
                    )
                  }
                  className="text-[11px] text-slate-400 hover:text-sky-400"
                >
                  Reset All
                </button>
              )}
            </div>
            {!selectedClip ? (
              <p className="text-xs text-slate-400 bg-slate-900 p-3 rounded border border-slate-800">
                Select a clip to adjust Brightness, Contrast, Saturation, Exposure, Temperature, Tint, and Vignette.
              </p>
            ) : (
              (
                [
                  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
                  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
                  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
                  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
                  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
                  { key: 'tint', label: 'Tint', min: -100, max: 100 },
                  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
                  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
                  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
                  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
                ] as const
              ).map((item) => {
                const val = selectedClip.adjustments[item.key] ?? 0;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono tabular-nums text-sky-400">{val}</span>
                    </div>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      value={val}
                      onChange={(e) => {
                        const nextVal = Number(e.target.value);
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            adjustments: { ...c.adjustments, [item.key]: nextVal },
                          }),
                          `Adjust ${item.label}`
                        );
                      }}
                      className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'Templates' && (
          <div className="flex flex-col h-full p-3 gap-2.5 overflow-y-auto">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">Project Sequence Templates</h2>
            {[
              {
                id: 'youtube-1080p',
                title: 'YouTube Documentary Intro (16:9)',
                desc: 'Multi-track 1080p layout with B-roll, lower third title, and ambient audio bed.',
              },
              {
                id: 'shorts-vertical',
                title: 'YouTube Shorts / TikTok Vertical (9:16)',
                desc: '9:16 vertical canvas with bold karaoke captions and punchy zoom keyframes.',
              },
              {
                id: 'podcast-audiogram',
                title: 'Video Podcast Episode (16:9)',
                desc: 'Multi-track audio arrangement with waveform visuals and speaker titles.',
              },
            ].map((tpl) => (
              <div key={tpl.id} className="bg-slate-900 border border-slate-800 rounded-md p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-200">{tpl.title}</p>
                <p className="text-[11px] text-slate-400">{tpl.desc}</p>
                <button
                  onClick={() => onLoadTemplateSequence(tpl.id)}
                  className="w-full py-1.5 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 font-medium rounded text-xs transition-colors"
                >
                  Apply Template Structure
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
