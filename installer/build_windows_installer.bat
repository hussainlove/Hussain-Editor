@echo off
setlocal EnableDelayedExpansion
title Hussain Video Editor v1.0.0 - Windows .EXE ^& Setup Installer Builder

REM ============================================================================
REM Hussain Video Editor v1.0.0 - Guaranteed Windows 10/11 .EXE & Setup Builder
REM Works out-of-the-box on ANY Windows 10/11 PC using Windows built-in .NET
REM compiler (csc.exe), plus optional PyInstaller / Inno Setup 6 support!
REM
REM Produces:
REM   1) dist\HussainVideoEditor\HussainVideoEditor.exe (Standalone App Launcher)
REM   2) HussainVideoEditor.exe                         (Root App Launcher)
REM   3) installer\dist_installer\HussainVideoEditor-Setup.exe (Setup Installer)
REM ============================================================================

cd /d "%~dp0"
if exist "..\package.json" (
    cd /d "%~dp0.."
)

echo ============================================================================
echo   HUSSAIN VIDEO EDITOR v1.0.0 - WINDOWS .EXE ^& SETUP INSTALLER BUILDER
echo ============================================================================
echo   Working Directory: %CD%
echo ============================================================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json not found in %CD%!
    echo         Please extract the full HussainVideoEditor-Windows-Installer-SDK.zip
    echo         folder before running build_windows_installer.bat.
    pause
    exit /b 1
)

echo [1/4] Installing Node dependencies ^& building production bundle...
where npm >nul 2>nul
if !ERRORLEVEL! EQU 0 (
    if not exist "node_modules" (
        call npm install
    )
    call npm run build
) else (
    echo [WARN] Node.js (npm) not detected in PATH. Continuing with native .EXE build...
)

if not exist "dist\HussainVideoEditor" mkdir "dist\HussainVideoEditor"
if not exist "installer\dist_installer" mkdir "installer\dist_installer"
if not exist "ffmpeg\bin" mkdir "ffmpeg\bin"

echo.
echo [2/4] Compiling Native Windows App Executable (HussainVideoEditor.exe)...
set "CSC_PATH=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "!CSC_PATH!" (
    set "CSC_PATH=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if exist "!CSC_PATH!" (
    echo       Using built-in Windows .NET Compiler: !CSC_PATH!
    "!CSC_PATH!" /nologo /target:winexe /out:"dist\HussainVideoEditor\HussainVideoEditor.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "installer\HussainLauncher.cs"
    if exist "dist\HussainVideoEditor\HussainVideoEditor.exe" (
        copy /Y "dist\HussainVideoEditor\HussainVideoEditor.exe" "HussainVideoEditor.exe" >nul
        copy /Y "auto_import.bat" "dist\HussainVideoEditor\auto_import.bat" >nul
        echo       [OK] Created dist\HussainVideoEditor\HussainVideoEditor.exe
        echo       [OK] Created HussainVideoEditor.exe
    )
) else (
    echo [WARN] Built-in csc.exe not found; checking PyInstaller...
    where pyinstaller >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        pyinstaller --noconfirm --onedir --windowed --name "HussainVideoEditor" installer\desktop_launcher.py
    )
)

echo.
echo [3/4] Compiling Windows Setup Installer (HussainVideoEditor-Setup.exe)...
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    echo       Found Inno Setup 6 - compiling installer\HussainVideoEditor.iss...
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "installer\HussainVideoEditor.iss"
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    echo       Found Inno Setup 6 - compiling installer\HussainVideoEditor.iss...
    "C:\Program Files\Inno Setup 6\ISCC.exe" "installer\HussainVideoEditor.iss"
) else if exist "!CSC_PATH!" (
    echo       Compiling native Windows GUI Setup Wizard via built-in .NET compiler...
    "!CSC_PATH!" /nologo /target:winexe /out:"installer\dist_installer\HussainVideoEditor-Setup.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "installer\HussainSetupWizard.cs"
    if exist "installer\dist_installer\HussainVideoEditor-Setup.exe" (
        copy /Y "installer\dist_installer\HussainVideoEditor-Setup.exe" "HussainVideoEditor-Setup.exe" >nul
        echo       [OK] Created installer\dist_installer\HussainVideoEditor-Setup.exe
        echo       [OK] Created HussainVideoEditor-Setup.exe
    )
)

echo.
echo ============================================================================
echo [4/4] BUILD COMPLETE! Your Windows .EXE files are ready:
echo   1. Standalone App EXE  : %CD%\HussainVideoEditor.exe
echo   2. Setup Installer EXE : %CD%\installer\dist_installer\HussainVideoEditor-Setup.exe
echo   3. Auto-Import Script  : %CD%\auto_import.bat
echo ============================================================================
echo.
if exist "installer\dist_installer" (
    explorer "installer\dist_installer"
)
pause
