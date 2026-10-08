# Hussain Video Editor v1.0.0 — Desktop Architecture & QA Documentation

## 1. Architecture Overview

**Hussain Video Editor** is a self-contained nonlinear desktop video editing suite designed for Windows 10 / Windows 11 (64-bit) with offline FFmpeg processing.

```
HussainVideoEditor/
├── backend/
│   ├── cacheManager.ts          # Manages thumbnails, waveforms, proxies, exports, and cache cleanup
│   └── logger.ts                # Rotating log system for logs/app.log and logs/ffmpeg.log
├── engine/
│   └── ffmpegService.ts         # Real FFprobe metadata inspection, waveform PCM extractor, FFmpeg renderer
├── installer/
│   ├── HussainVideoEditor.iss   # Inno Setup 6 script producing HussainVideoEditor-Setup.exe
│   ├── desktop_launcher.py      # Native Windows desktop window host & bundled FFmpeg PATH binder
│   └── build_windows_installer.bat # Automated PyInstaller + Inno Setup packaging pipeline
├── src/
│   ├── components/
│   │   ├── LeftSidebar.tsx      # 10 functional tabs: Media, Audio, Text, Captions, Stickers, Effects, Transitions, Filters, Adjust, Templates
│   │   ├── PreviewMonitor.tsx   # Multi-track synchronized compositor, draggable transforms, SMPTE timecode
│   │   ├── RightInspector.tsx   # Dynamic property inspector, keyframe diamond triggers, direct FFmpeg ops
│   │   ├── TimelinePanel.tsx    # Multi-track nonlinear timeline, split/trim/snap/ripple/lock/mute/solo
│   │   └── EditorModals.tsx     # FFmpeg Export modal, Settings/Diagnostics/Logs modal, Welcome & Crash Recovery
│   ├── types/editor.ts          # Project schema (.hveproject) & branding config
│   └── utils/editorMath.ts      # Keyframe interpolation, SMPTE timecode math, clip splitting
└── tests/
    └── editor.test.ts           # Automated test suite for FFprobe, FFmpeg export, keyframes, and timeline math
```

---

## 2. Building the Self-Contained Windows Installer (`HussainVideoEditor-Setup.exe`)

1. Place static Windows 64-bit `ffmpeg.exe` and `ffprobe.exe` binaries in `ffmpeg/bin/`.
2. Run `installer\build_windows_installer.bat` on Windows 10/11:
   - Compiles the React/TypeScript frontend (`npm run build`).
   - Packages the desktop runtime via `PyInstaller` (`HussainVideoEditor.exe`).
   - Compiles `installer/HussainVideoEditor.iss` via **Inno Setup 6** to output `HussainVideoEditor-Setup.exe`.
3. The resulting `HussainVideoEditor-Setup.exe`:
   - Installs without requiring administrator privileges (`PrivilegesRequired=lowest`).
   - Bundles FFmpeg and FFprobe directly in `{app}\ffmpeg\bin`.
   - Registers the `.hveproject` file association in the Windows Registry.
   - Creates Start Menu, optional Desktop shortcuts, and a complete Uninstaller.

---

## 3. Manual QA Verification Checklist

- [x] **Media Import & FFprobe**: Drag and drop MP4/MOV/WAV/PNG files into the Media tab; verify real resolution, duration, FPS, codec, thumbnail, and audio waveform peaks are generated.
- [x] **Voice Recording**: Open the Audio tab and click *Start Voice Recording* to record microphone audio directly into the project library.
- [x] **Multi-Track Timeline**: Drag clips across V1–V3, AUDIO 1–2, and CAPTIONS tracks; test magnetic snapping, in/out handle trimming, `S` key splitting, `Ctrl+D` duplication, and Ripple Delete.
- [x] **Transform & Keyframes**: Select a clip, move the playhead, and click the `◆` diamond buttons in the Right Inspector to animate Scale, Position, Rotation, Opacity, or Volume.
- [x] **Auto Captions**: Open the Captions tab, select a preset (*Modern*, *Karaoke*, *Podcast*, etc.), and click *Generate Auto Captions* to populate timed segments on the `CAPTIONS` track.
- [x] **Project Save, Auto-Save & Crash Recovery**: Click *Save* (`Ctrl+S`) to export a lightweight `.hveproject` JSON file referencing local media paths; verify 30s background auto-save and recovery prompt in *New / Projects*.
- [x] **FFmpeg Video Export**: Click *Export*, choose a preset (YouTube 1080p/4K, Shorts 9:16, TikTok, WebM VP9), and click *Export Final Video* to execute real FFmpeg rendering with live progress and download link.
