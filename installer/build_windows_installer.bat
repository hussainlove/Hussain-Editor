@echo off
REM ============================================================================
REM Hussain Video Editor v1.0.0 - Automated Self-Contained Windows Build Script
REM Produces: dist_installer\HussainVideoEditor-Setup.exe
REM ============================================================================

echo [1/5] Building Frontend & Backend Bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Frontend build failed!
    exit /b 1
)

echo [2/5] Verifying Bundled FFmpeg & FFprobe Static Binaries...
if not exist "ffmpeg\bin\ffmpeg.exe" (
    echo Notice: Place static ffmpeg.exe and ffprobe.exe inside ffmpeg\bin\ prior to packaging.
)

echo [3/5] Packaging Standalone Executable via PyInstaller...
pyinstaller --noconfirm --onedir --windowed ^
    --name "HussainVideoEditor" ^
    --add-data "dist;dist" ^
    --add-data "ffmpeg;ffmpeg" ^
    installer\desktop_launcher.py

echo [4/5] Compiling Windows Setup Installer via Inno Setup (ISCC)...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\HussainVideoEditor.iss

echo [5/5] Build Complete!
echo Output Installer: installer\dist_installer\HussainVideoEditor-Setup.exe
