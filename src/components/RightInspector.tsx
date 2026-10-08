import React, { useState } from 'react';
import {
  Sliders,
  Type,
  Volume2,
  Diamond,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  Wand2,
  Cpu,
  Trash2,
  Repeat,
  Globe,
  Download,
  Eye,
  Check,
  Search,
} from 'lucide-react';
import {
  TimelineClip,
  BUILTIN_ANIMATIONS,
  BUILTIN_LOOP_ANIMATIONS,
  ONLINE_ANIMATION_CATALOG,
  BUILTIN_AUDIO_EFFECTS,
  BUILTIN_FONTS,
  DEFAULT_ADJUSTMENTS,
  KeyframePoint,
} from '../types/editor';
import { evaluateKeyframedProperty } from '../utils/editorMath';

interface RightInspectorProps {
  selectedClip: TimelineClip | null;
  playheadTime: number;
  onUpdateClip: (clipId: string, updater: (c: TimelineClip) => TimelineClip, label: string) => void;
  onAddOrUpdateKeyframe: (
    clipId: string,
    property: KeyframePoint['property'],
    value: number
  ) => void;
  onRemoveKeyframe: (clipId: string, keyframeId: string) => void;
  onRunFFmpegDirectOp: (operation: 'reverse' | 'freeze' | 'normalize') => Promise<void>;
  isProcessingFFmpeg: boolean;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  selectedClip,
  playheadTime,
  onUpdateClip,
  onAddOrUpdateKeyframe,
  onRemoveKeyframe,
  onRunFFmpegDirectOp,
  isProcessingFFmpeg,
}) => {
  const [inspectorTab, setInspectorTab] = useState<'Basic' | 'Animation' | 'Adjustment' | 'Audio' | 'Keyframes'>(
    'Basic'
  );
  const [animSearch, setAnimSearch] = useState('');
  const [downloadedOnlineAnims, setDownloadedOnlineAnims] = useState<Record<string, boolean>>({
    '3D Flip In': true,
    'Hologram Float Loop': true,
  });
  const [previewingAnimId, setPreviewingAnimId] = useState<string | null>(null);

  if (!selectedClip) {
    return (
      <div className="w-full h-full bg-[#0F172A] p-4 flex flex-col justify-between select-none overflow-y-auto">
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">Property Inspector</h2>
          <div className="bg-slate-900/90 border border-slate-800 rounded-md p-4 text-center space-y-2">
            <Sliders className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-xs text-slate-300 font-medium">No Timeline Clip Selected</p>
            <p className="text-[11px] text-slate-500">
              Click any video, image, text, caption, or audio clip on the timeline to inspect and keyframe its properties.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded p-3 space-y-1.5 text-[11px] text-slate-400">
          <p className="font-semibold text-slate-300">Quick Shortcuts</p>
          <div className="flex justify-between">
            <span>Play / Pause</span>
            <span className="font-mono text-slate-300">Space</span>
          </div>
          <div className="flex justify-between">
            <span>Split Clip at Playhead</span>
            <span className="font-mono text-slate-300">S</span>
          </div>
          <div className="flex justify-between">
            <span>Duplicate Selected</span>
            <span className="font-mono text-slate-300">Ctrl + D</span>
          </div>
          <div className="flex justify-between">
            <span>Undo / Redo</span>
            <span className="font-mono text-slate-300">Ctrl + Z / Shift + Z</span>
          </div>
        </div>
      </div>
    );
  }

  const currentPosX = Math.round(evaluateKeyframedProperty(selectedClip, 'positionX', playheadTime));
  const currentPosY = Math.round(evaluateKeyframedProperty(selectedClip, 'positionY', playheadTime));
  const currentScaleX = Math.round(evaluateKeyframedProperty(selectedClip, 'scaleX', playheadTime));
  const currentScaleY = Math.round(evaluateKeyframedProperty(selectedClip, 'scaleY', playheadTime));
  const currentRotation = Math.round(evaluateKeyframedProperty(selectedClip, 'rotation', playheadTime));
  const currentOpacity = Math.round(evaluateKeyframedProperty(selectedClip, 'opacity', playheadTime));
  const currentVolume = Math.round(evaluateKeyframedProperty(selectedClip, 'volume', playheadTime));

  return (
    <div className="w-full h-full bg-[#0F172A] flex flex-col select-none overflow-hidden">
      {/* Header & Clip Title */}
      <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate">{selectedClip.name}</p>
          <p className="text-[10px] text-slate-400 font-mono tabular-nums uppercase">
            {selectedClip.type} · {selectedClip.duration.toFixed(2)}s
          </p>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-sky-400">
          In: {selectedClip.startTime.toFixed(2)}s
        </span>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-[#090D16] px-1 pt-1 gap-0.5">
        {(['Basic', 'Animation', 'Adjustment', 'Audio', 'Keyframes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setInspectorTab(tab)}
            className={`flex-1 py-1.5 text-[11px] font-medium rounded-t transition-colors whitespace-nowrap ${
              inspectorTab === tab
                ? 'bg-[#0F172A] text-sky-400 border-t border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {inspectorTab === 'Basic' && (
          <>
            {/* Text / Caption Editor if applicable */}
            {(selectedClip.type === 'text' || selectedClip.type === 'caption') && selectedClip.textStyle && (
              <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Type className="w-3.5 h-3.5 text-sky-400" />
                  <span>Text & Typography</span>
                </div>
                <textarea
                  value={selectedClip.textContent || ''}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({ ...c, textContent: e.target.value }),
                      'Edit text content'
                    )
                  }
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Font Family</label>
                    <select
                      value={selectedClip.textStyle.fontFamily}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            textStyle: { ...c.textStyle!, fontFamily: e.target.value },
                          }),
                          'Change font family'
                        )
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      {BUILTIN_FONTS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Font Size (px)</label>
                    <input
                      type="number"
                      min={12}
                      max={180}
                      value={selectedClip.textStyle.fontSize}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            textStyle: { ...c.textStyle!, fontSize: Number(e.target.value) || 36 },
                          }),
                          'Change font size'
                        )
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200"
                    />
                  </div>
                </div>

                {/* Caption Format & Style Selector (Word Glowing, Multiline, Karaoke, etc.) */}
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">
                    Caption / Text Format & Style (Word Glowing & Multiline)
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'WordGlowing', label: '✦ Word Glowing' },
                        { id: 'Multiline', label: '☰ Multiline Stack' },
                        { id: 'Karaoke', label: '♪ Karaoke Sync' },
                        { id: 'Highlight', label: '★ Word Highlight' },
                        { id: 'Bold', label: 'Bold Impact' },
                        { id: 'Modern', label: 'Modern Studio' },
                        { id: 'Cinematic', label: 'Cinematic' },
                        { id: 'Podcast', label: 'Podcast Box' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onUpdateClip(
                            selectedClip.id,
                            (c) => ({
                              ...c,
                              textStyle: {
                                ...c.textStyle!,
                                captionPreset: preset.id,
                                shadowBlur: preset.id === 'WordGlowing' ? 18 : c.textStyle!.shadowBlur,
                                shadowColor: preset.id === 'WordGlowing' ? '#38BDF8' : c.textStyle!.shadowColor,
                              },
                            }),
                            `Set caption style ${preset.label}`
                          )
                        }
                        className={`px-2 py-1 rounded text-[11px] border text-left transition-colors ${
                          selectedClip.textStyle?.captionPreset === preset.id
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Text Color</label>
                    <input
                      type="color"
                      value={selectedClip.textStyle.color}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            textStyle: { ...c.textStyle!, color: e.target.value },
                          }),
                          'Change text color'
                        )
                      }
                      className="w-full h-7 bg-slate-950 border border-slate-800 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Stroke</label>
                    <input
                      type="color"
                      value={selectedClip.textStyle.strokeColor}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            textStyle: { ...c.textStyle!, strokeColor: e.target.value },
                          }),
                          'Change stroke color'
                        )
                      }
                      className="w-full h-7 bg-slate-950 border border-slate-800 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Background</label>
                    <input
                      type="color"
                      value={selectedClip.textStyle.backgroundColor}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            textStyle: { ...c.textStyle!, backgroundColor: e.target.value, backgroundOpacity: 80 },
                          }),
                          'Change text background'
                        )
                      }
                      className="w-full h-7 bg-slate-950 border border-slate-800 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Transform Section with Real Keyframe Triggers */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Transform & Geometry</span>
                <span className="text-[10px] text-slate-400">Click ◆ to Keyframe</span>
              </div>

              {/* Position X / Y */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Pos X</span>
                    <button
                      onClick={() => onAddOrUpdateKeyframe(selectedClip.id, 'positionX', currentPosX)}
                      className="text-slate-400 hover:text-amber-400"
                      title="Add Keyframe for Position X"
                    >
                      <Diamond className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="number"
                    value={currentPosX}
                    onChange={(e) =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, positionX: Number(e.target.value) }),
                        'Change Position X'
                      )
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Pos Y</span>
                    <button
                      onClick={() => onAddOrUpdateKeyframe(selectedClip.id, 'positionY', currentPosY)}
                      className="text-slate-400 hover:text-amber-400"
                      title="Add Keyframe for Position Y"
                    >
                      <Diamond className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="number"
                    value={currentPosY}
                    onChange={(e) =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, positionY: Number(e.target.value) }),
                        'Change Position Y'
                      )
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-200"
                  />
                </div>
              </div>

              {/* Scale */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Scale (Zoom %)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-sky-400">{currentScaleX}%</span>
                    <button
                      onClick={() => {
                        onAddOrUpdateKeyframe(selectedClip.id, 'scaleX', currentScaleX);
                        onAddOrUpdateKeyframe(selectedClip.id, 'scaleY', currentScaleY);
                      }}
                      className="text-slate-400 hover:text-amber-400"
                      title="Add Scale Keyframe"
                    >
                      <Diamond className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={300}
                  value={currentScaleX}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({ ...c, scaleX: v, scaleY: v }),
                      'Scale clip'
                    );
                  }}
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
                />
              </div>

              {/* Rotation & Flip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Rotation</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-sky-400">{currentRotation}°</span>
                    <button
                      onClick={() => onAddOrUpdateKeyframe(selectedClip.id, 'rotation', currentRotation)}
                      className="text-slate-400 hover:text-amber-400"
                      title="Add Rotation Keyframe"
                    >
                      <Diamond className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, rotation: (c.rotation + 90) % 360 }),
                        'Rotate 90°'
                      )
                    }
                    className="flex-1 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-200 flex items-center justify-center gap-1"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> +90°
                  </button>
                  <button
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, flipH: !c.flipH }), 'Flip Horizontal')
                    }
                    className={`px-2.5 py-1 rounded border text-xs flex items-center gap-1 ${
                      selectedClip.flipH
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                    title="Flip Horizontal"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, flipV: !c.flipV }), 'Flip Vertical')
                    }
                    className={`px-2.5 py-1 rounded border text-xs flex items-center gap-1 ${
                      selectedClip.flipV
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                    title="Flip Vertical"
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Opacity & Blend */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Opacity</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-sky-400">{currentOpacity}%</span>
                    <button
                      onClick={() => onAddOrUpdateKeyframe(selectedClip.id, 'opacity', currentOpacity)}
                      className="text-slate-400 hover:text-amber-400"
                      title="Add Opacity Keyframe"
                    >
                      <Diamond className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={currentOpacity}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({ ...c, opacity: Number(e.target.value) }),
                      'Adjust opacity'
                    )
                  }
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-400">Blend Mode</span>
                <select
                  value={selectedClip.blendMode}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({ ...c, blendMode: e.target.value as any }),
                      'Change blend mode'
                    )
                  }
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                >
                  <option value="normal">Normal</option>
                  <option value="screen">Screen</option>
                  <option value="multiply">Multiply</option>
                  <option value="overlay">Overlay</option>
                </select>
              </div>
            </div>

            {/* Crop Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2">
              <span className="text-xs font-semibold text-slate-200">Edge Crop (%)</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {(['cropTop', 'cropBottom', 'cropLeft', 'cropRight'] as const).map((edge) => (
                  <div key={edge}>
                    <div className="flex justify-between text-slate-400">
                      <span className="capitalize">{edge.replace('crop', '')}</span>
                      <span className="font-mono tabular-nums text-slate-200">{selectedClip[edge]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      value={selectedClip[edge]}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => ({ ...c, [edge]: Number(e.target.value) }),
                          `Crop ${edge}`
                        )
                      }
                      className="w-full accent-sky-500 h-1 bg-slate-800 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Speed & Direct FFmpeg Native Actions */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Speed & Time Remap</span>
                <span className="font-mono tabular-nums text-sky-400">{selectedClip.speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={selectedClip.speed}
                onChange={(e) => {
                  const newSpeed = Number(e.target.value);
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({
                      ...c,
                      speed: newSpeed,
                      duration: Math.max(0.2, Math.round((c.sourceDuration / newSpeed) * 100) / 100),
                    }),
                    `Change speed to ${newSpeed}x`
                  );
                }}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
              />
              <div className="flex gap-1">
                {[0.5, 1.0, 1.5, 2.0, 4.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({
                          ...c,
                          speed: spd,
                          duration: Math.max(0.2, Math.round((c.sourceDuration / spd) * 100) / 100),
                        }),
                        `Set speed ${spd}x`
                      )
                    }
                    className="flex-1 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[11px] font-mono tabular-nums text-slate-300"
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {selectedClip.mediaId && (
                <div className="pt-1 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-sky-400" /> Native FFmpeg Engine Operations
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => onRunFFmpegDirectOp('reverse')}
                      disabled={isProcessingFFmpeg}
                      className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[11px] text-slate-200 font-medium"
                    >
                      Reverse Clip
                    </button>
                    <button
                      onClick={() => onRunFFmpegDirectOp('freeze')}
                      disabled={isProcessingFFmpeg}
                      className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[11px] text-slate-200 font-medium"
                    >
                      Freeze Frame
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {inspectorTab === 'Animation' && (
          <div className="space-y-3">
            {/* Search & Limitless Online Animation Generator Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={animSearch}
                onChange={(e) => setAnimSearch(e.target.value)}
                placeholder="Search In, Out, Loop or Online Animation..."
                className="w-full bg-slate-900 border border-slate-800 rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Live Animation Preview Box */}
            {previewingAnimId && (
              <div className="bg-slate-950 border border-sky-500/40 rounded-md p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded bg-sky-500/20 border border-sky-400 flex items-center justify-center animate-bounce">
                    <Sparkles className="w-4 h-4 text-sky-300 animate-spin" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-sky-300">
                      Live Preview: {previewingAnimId}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Click In, Out, or Loop below to apply to "{selectedClip.name}"
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewingAnimId(null)}
                  className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 bg-slate-900 rounded"
                >
                  Close
                </button>
              </div>
            )}

            {/* Entrance Animation (In) */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>Entrance Animation (In)</span>
                </div>
                <span className="text-[10px] font-mono text-sky-400">{selectedClip.animationIn}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {BUILTIN_ANIMATIONS.filter(
                  (a) => !animSearch.trim() || a.toLowerCase().includes(animSearch.toLowerCase())
                ).map((anim) => (
                  <button
                    key={anim}
                    onClick={() => {
                      setPreviewingAnimId(anim);
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, animationIn: anim }),
                        `Set In Animation ${anim}`
                      );
                    }}
                    className={`py-1.5 px-2 rounded text-xs border text-left transition-colors ${
                      selectedClip.animationIn === anim
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-medium'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {anim}
                  </button>
                ))}
              </div>
            </div>

            {/* Exit Animation (Out) */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Exit Animation (Out)</span>
                </div>
                <span className="text-[10px] font-mono text-amber-400">{selectedClip.animationOut}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {BUILTIN_ANIMATIONS.filter(
                  (a) => !animSearch.trim() || a.toLowerCase().includes(animSearch.toLowerCase())
                ).map((anim) => (
                  <button
                    key={anim}
                    onClick={() => {
                      setPreviewingAnimId(anim);
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, animationOut: anim }),
                        `Set Out Animation ${anim}`
                      );
                    }}
                    className={`py-1.5 px-2 rounded text-xs border text-left transition-colors ${
                      selectedClip.animationOut === anim
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-medium'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {anim}
                  </button>
                ))}
              </div>
            </div>

            {/* Continuous Loop Animation (Loop) */}
            <div className="bg-slate-900 border border-emerald-500/30 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <div className="flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Loop Animation (Continuous)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">
                  {selectedClip.animationLoop || 'None'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {BUILTIN_LOOP_ANIMATIONS.filter(
                  (a) => !animSearch.trim() || a.toLowerCase().includes(animSearch.toLowerCase())
                ).map((loopAnim) => (
                  <button
                    key={loopAnim}
                    onClick={() => {
                      setPreviewingAnimId(loopAnim);
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, animationLoop: loopAnim }),
                        `Set Loop Animation ${loopAnim}`
                      );
                    }}
                    className={`py-1.5 px-2 rounded text-xs border text-left transition-colors ${
                      (selectedClip.animationLoop || 'None') === loopAnim
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-medium'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {loopAnim}
                  </button>
                ))}
              </div>
            </div>

            {/* Online Animation Cloud Library (In / Out / Loop + Limitless Search Generator) */}
            <div className="bg-slate-900 border border-sky-500/30 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span>Online Animations (In / Out / Loop)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">Limitless Cloud</span>
              </div>

              {/* If user typed a custom search query, generate dynamic online In/Out/Loop presets */}
              {animSearch.trim().length > 0 && (
                <div className="bg-slate-950 border border-sky-500/40 rounded p-2 space-y-1.5">
                  <p className="text-[10px] text-sky-300 font-medium">
                    Instant Online Cloud Results for "{animSearch.trim()}":
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {(['in', 'out', 'loop'] as const).map((mode) => {
                      const customName = `${animSearch.trim()} (${mode.toUpperCase()})`;
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            setDownloadedOnlineAnims((prev) => ({ ...prev, [customName]: true }));
                            setPreviewingAnimId(customName);
                            onUpdateClip(
                              selectedClip.id,
                              (c) =>
                                mode === 'in'
                                  ? { ...c, animationIn: customName }
                                  : mode === 'out'
                                  ? { ...c, animationOut: customName }
                                  : { ...c, animationLoop: customName },
                              `Download & Apply Online ${customName}`
                            );
                          }}
                          className="py-1 px-1.5 bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 border border-sky-500/40 rounded text-[10px] text-sky-200 font-semibold flex items-center justify-center gap-1 transition-colors"
                        >
                          <Download className="w-2.5 h-2.5" /> +{mode.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {ONLINE_ANIMATION_CATALOG.filter(
                  (item) =>
                    !animSearch.trim() ||
                    item.name.toLowerCase().includes(animSearch.toLowerCase()) ||
                    item.desc.toLowerCase().includes(animSearch.toLowerCase())
                ).map((item) => {
                  const isDownloaded = !!downloadedOnlineAnims[item.id];
                  const isApplied =
                    selectedClip.animationIn === item.id ||
                    selectedClip.animationOut === item.id ||
                    selectedClip.animationLoop === item.id;

                  return (
                    <div
                      key={item.id}
                      className="bg-slate-950 border border-slate-800 rounded p-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-200 truncate">
                            {item.name}
                          </span>
                          <span className="text-[9px] font-mono px-1 rounded bg-sky-500/20 text-sky-300">
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{item.desc}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setPreviewingAnimId(item.id)}
                          className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-700"
                          title="Preview Animation"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        {!isDownloaded ? (
                          <button
                            onClick={() => {
                              setDownloadedOnlineAnims((prev) => ({ ...prev, [item.id]: true }));
                              setPreviewingAnimId(item.id);
                            }}
                            className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" /> Get
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setPreviewingAnimId(item.id);
                              onUpdateClip(
                                selectedClip.id,
                                (c) =>
                                  item.target === 'in'
                                    ? { ...c, animationIn: item.id }
                                    : item.target === 'out'
                                    ? { ...c, animationOut: item.id }
                                    : { ...c, animationLoop: item.id },
                                `Apply Online Animation ${item.name}`
                              );
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                              isApplied
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950'
                            }`}
                          >
                            <Check className="w-3 h-3" /> {isApplied ? 'Active' : 'Use'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {inspectorTab === 'Adjustment' && (
          <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Color Grading Sliders</span>
              <button
                onClick={() =>
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({ ...c, adjustments: { ...DEFAULT_ADJUSTMENTS } }),
                    'Reset adjustments'
                  )
                }
                className="text-[10px] text-slate-400 hover:text-sky-400"
              >
                Reset
              </button>
            </div>
            {(
              [
                { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
                { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
                { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
                { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
                { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
                { key: 'tint', label: 'Tint', min: -100, max: 100 },
                { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
                { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
              ] as const
            ).map((s) => (
              <div key={s.key} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300">{s.label}</span>
                  <span className="font-mono tabular-nums text-sky-400">
                    {selectedClip.adjustments[s.key]}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  value={selectedClip.adjustments[s.key]}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({
                        ...c,
                        adjustments: { ...c.adjustments, [s.key]: Number(e.target.value) },
                      }),
                      `Adjust ${s.label}`
                    )
                  }
                  className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
                />
              </div>
            ))}
          </div>
        )}

        {inspectorTab === 'Audio' && (
          <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Audio Mixing & Envelope</span>
              </div>
              <button
                onClick={() => onAddOrUpdateKeyframe(selectedClip.id, 'volume', currentVolume)}
                className="text-slate-400 hover:text-amber-400"
                title="Keyframe Volume"
              >
                <Diamond className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Clip Volume Gain</span>
                <span className="font-mono tabular-nums text-sky-400">{currentVolume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={currentVolume}
                onChange={(e) =>
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({ ...c, volume: Number(e.target.value) }),
                    'Adjust volume'
                  )
                }
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Fade In Duration</span>
                <span className="font-mono tabular-nums text-slate-200">{selectedClip.fadeIn.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={selectedClip.fadeIn}
                onChange={(e) =>
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({ ...c, fadeIn: Number(e.target.value) }),
                    'Adjust Fade In'
                  )
                }
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Fade Out Duration</span>
                <span className="font-mono tabular-nums text-slate-200">{selectedClip.fadeOut.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={selectedClip.fadeOut}
                onChange={(e) =>
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({ ...c, fadeOut: Number(e.target.value) }),
                    'Adjust Fade Out'
                  )
                }
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Pitch Shift (Semitones)</span>
                <span className="font-mono tabular-nums text-slate-200">{selectedClip.pitch} st</span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={selectedClip.pitch}
                onChange={(e) =>
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({ ...c, pitch: Number(e.target.value) }),
                    'Adjust Pitch'
                  )
                }
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded"
              />
            </div>

            <label className="flex items-center justify-between text-xs text-slate-300 pt-1 cursor-pointer">
              <span>AI Acoustic Noise Reduction</span>
              <input
                type="checkbox"
                checked={selectedClip.noiseReduction}
                onChange={(e) =>
                  onUpdateClip(
                    selectedClip.id,
                    (c) => ({ ...c, noiseReduction: e.target.checked }),
                    'Toggle noise reduction'
                  )
                }
                className="accent-sky-500"
              />
            </label>

            {/* Studio Audio Effects Rack */}
            <div className="border-t border-slate-800 pt-2.5 space-y-2">
              <span className="text-xs font-semibold text-slate-200 block">
                Studio Audio Effects (EQ / Reverb / Voice)
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {BUILTIN_AUDIO_EFFECTS.map((afx) => {
                  const isActive = (selectedClip.audioEffects || []).includes(afx.id);
                  return (
                    <button
                      key={afx.id}
                      type="button"
                      onClick={() =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) => {
                            const curr = c.audioEffects || [];
                            const next = curr.includes(afx.id)
                              ? curr.filter((x) => x !== afx.id)
                              : [...curr, afx.id];
                            return { ...c, audioEffects: next };
                          },
                          `Toggle Audio FX ${afx.name}`
                        )
                      }
                      className={`p-1.5 rounded border text-left transition-colors ${
                        isActive
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-medium'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                      title={afx.desc}
                    >
                      <div className="text-[11px] truncate">{afx.id}</div>
                      <div className="text-[9px] text-slate-400 truncate">{afx.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedClip.mediaId && (
              <button
                onClick={() => onRunFFmpegDirectOp('normalize')}
                disabled={isProcessingFFmpeg}
                className="w-full py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-xs text-sky-400 font-medium"
              >
                Run FFmpeg EBU R128 Loudness Normalization
              </button>
            )}
          </div>
        )}

        {inspectorTab === 'Keyframes' && (
          <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Active Keyframe Markers</span>
              <span className="text-[11px] font-mono tabular-nums text-amber-400">
                {selectedClip.keyframes.length} points
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Move the playhead inside the clip and click any diamond icon (◆) in Basic or Audio tabs to insert interpolated keyframes.
            </p>
            {selectedClip.keyframes.length === 0 ? (
              <div className="p-3 bg-slate-950 rounded border border-slate-800 text-center text-xs text-slate-500">
                No keyframes on this clip yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedClip.keyframes.map((kf) => (
                  <div
                    key={kf.id}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="text-amber-400 font-medium">{kf.property}</span>
                      <span className="text-slate-400 font-mono tabular-nums ml-2">
                        +{kf.timeOffset.toFixed(2)}s → {kf.value}
                      </span>
                    </div>
                    <button
                      onClick={() => onRemoveKeyframe(selectedClip.id, kf.id)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
