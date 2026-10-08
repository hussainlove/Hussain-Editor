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
  { id: 'yt-1080', label: 'YouTube 1080p', format: 'mp4', codec: 'libx264', res: '1080p', fps: 30, ar: '16:9' },
  { id: 'yt-4k', label: 'YouTube 4K Ultra', format: 'mp4', codec: 'libx265', res: '4k', fps: 60, ar: '16:9' },
  { id: 'shorts', label: 'YouTube Shorts (9:16)', format: 'mp4', codec: 'libx264', res: '1080p', fps: 60, ar: '9:16' },
  { id: 'tiktok', label: 'TikTok Vertical', format: 'mp4', codec: 'libx264', res: '1080p', fps: 30, ar: '9:16' },
  { id: 'ig-reels', label: 'Instagram Reels / Feed', format: 'mp4', codec: 'libx264', res: '1080p', fps: 30, ar: '4:5' },
  { id: 'webm-vp9', label: 'WebM VP9 Archive', format: 'webm', codec: 'libvpx-vp9', res: '1080p', fps: 30, ar: '16:9' },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  totalDuration,
}) => {
  const [selectedPreset, setSelectedPreset] = useState('yt-1080');
  const [format, setFormat] = useState<'mp4' | 'mov' | 'webm'>('mp4');
  const [videoCodec, setVideoCodec] = useState<'libx264' | 'libx265' | 'libvpx-vp9'>('libx264');
  const [resolution, setResolution] = useState<'720p' | '1080p' | '1440p' | '4k'>('1080p');
  const [fps, setFps] = useState<number>(project.fps || 30);
  const [bitratePreset, setBitratePreset] = useState<'low' | 'medium' | 'high' | 'custom'>('high');
  const [customBitrateMbps, setCustomBitrateMbps] = useState(12);
  const [audioCodec, setAudioCodec] = useState<'aac' | 'pcm_s16le'>('aac');
  const [outputDirectory, setOutputDirectory] = useState('C:\\Users\\User\\Videos\\HussainExports\\');

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

  useEffect(() => {
    if (!jobState || jobState.status !== 'rendering') return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/export/status/${jobState.jobId}`);
        if (res.ok) {
          const data = await res.json();
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
    bitratePreset === 'low' ? 2.5 : bitratePreset === 'medium' ? 6 : bitratePreset === 'high' ? 12 : customBitrateMbps;
  const estimatedSizeBytes = Math.round(((estimatedMbps * 1024 * 1024) / 8) * Math.max(1, totalDuration));

  const startExport = async () => {
    try {
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
              trackType: tr?.type || 'video',
            };
          }),
        }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJobState(data.job);
      } else {
        setJobState({
          jobId: 'err',
          status: 'failed',
          progress: 0,
          error: data.error || 'Failed to launch FFmpeg export',
          technicalDetails: data.technicalDetails,
        });
      }
    } catch (err: any) {
      setJobState({
        jobId: 'err',
        status: 'failed',
        progress: 0,
        error: err?.message || 'Network error starting export',
      });
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
                <label className="text-[11px] text-slate-400">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="720p">720p HD (1280x720)</option>
                  <option value="1080p">1080p Full HD (1920x1080)</option>
                  <option value="1440p">1440p QHD (2560x1440)</option>
                  <option value="4k">4K UHD (3840x2160)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Frame Rate (FPS)</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 mt-1"
                >
                  {[24, 25, 30, 50, 60].map((f) => (
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
                  <option value="high">High (12 Mbps)</option>
                  <option value="custom">Custom Bitrate</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Audio Codec</label>
                <select
                  value={audioCodec}
                  onChange={(e) => setAudioCodec(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1"
                >
                  <option value="aac">AAC Stereo 192kbps</option>
                  <option value="pcm_s16le">Uncompressed WAV PCM</option>
                </select>
              </div>
            </div>

            {bitratePreset === 'custom' && (
              <div>
                <label className="text-[11px] text-slate-400">Custom Bitrate (Mbps)</label>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={customBitrateMbps}
                  onChange={(e) => setCustomBitrateMbps(Number(e.target.value) || 8)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 mt-1"
                />
              </div>
            )}

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
                      await fetch(`/api/export/cancel/${jobState.jobId}`, { method: 'POST' });
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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  autoSaveIntervalSec,
  setAutoSaveIntervalSec,
}) => {
  const [activeTab, setActiveTab] = useState<'General' | 'Performance' | 'Cache' | 'Shortcuts' | 'Logs'>('General');
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [logsText, setLogsText] = useState('');
  const [logType, setLogType] = useState<'app' | 'ffmpeg'>('app');

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
            <h2 className="text-sm font-semibold text-slate-100">Application Settings & Hardware Diagnostics</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex h-96">
          {/* Left Settings Tabs */}
          <div className="w-44 bg-[#090D16] border-r border-slate-800 p-2 space-y-1">
            {(['General', 'Performance', 'Cache', 'Shortcuts', 'Logs'] as const).map((tab) => (
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
