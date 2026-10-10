@echo off
setlocal EnableDelayedExpansion
title Hussain Video Editor v1.0.0 - Auto-Import ^& Images + Voiceover Timeline Sync

REM ============================================================================
REM Hussain Video Editor v1.0.0 - Auto-Import & Voiceover + Images Auto-Sync
REM
REM How it works:
REM   1. Double-click auto_import.bat (or drag a folder onto it).
REM   2. CMD opens and asks for the Folder Path containing your Images + Voiceover
REM      (or press ENTER to open the Windows Folder Browser dialog).
REM   3. Automatically imports all Images + Voiceover into Hussain Video Editor
REM      and syncs all Images across the exact duration of the Voiceover on the
REM      Timeline (Video Track 1 + Audio Track 1).
REM ============================================================================

cd /d "%~dp0"
if exist "..\package.json" (
    cd /d "%~dp0.."
)

set "APP_URL=http://localhost:3000"
set "WATCH_DIR=%CD%\auto_import"
set "IMPORTED_DIR=%CD%\auto_import\imported"

if not exist "%WATCH_DIR%" mkdir "%WATCH_DIR%"
if not exist "%IMPORTED_DIR%" mkdir "%IMPORTED_DIR%"

echo ============================================================================
echo   Hussain Video Editor v1.0.0 - Images + Voiceover Auto-Sync Engine (.BAT)
echo ============================================================================
echo   Editor URL : %APP_URL%
echo ============================================================================
echo.

REM ----------------------------------------------------------------------------
REM Step 1: Ensure Hussain Video Editor Server / Desktop App is Running
REM ----------------------------------------------------------------------------
curl.exe -s -f "%APP_URL%/api/system/info" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/3] Hussain Video Editor is not running yet. Launching automatically...
    if exist "dist\HussainVideoEditor\HussainVideoEditor.exe" (
        start "" "dist\HussainVideoEditor\HussainVideoEditor.exe"
    ) else if exist "HussainVideoEditor.exe" (
        start "" "HussainVideoEditor.exe"
    ) else (
        start "HussainVideoEditorServer" cmd /c "npm run dev"
        start "" "%APP_URL%"
    )

    echo       Waiting for Hussain Video Editor on %APP_URL% ...
    set /a WAIT_COUNT=0
    :wait_server
    timeout /t 2 /nobreak >nul
    curl.exe -s -f "%APP_URL%/api/system/info" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        set /a WAIT_COUNT+=1
        if !WAIT_COUNT! LSS 20 goto :wait_server
        echo [ERROR] Could not connect to %APP_URL% after 40 seconds.
        echo         Please make sure Node.js is installed and run "npm install" first.
        pause
        exit /b 1
    )
    echo [OK] Hussain Video Editor is online!
) else (
    echo [1/3] Hussain Video Editor is online at %APP_URL%
)

REM ----------------------------------------------------------------------------
REM Step 2: Check if a folder was dragged onto auto_import.bat, else ask user
REM ----------------------------------------------------------------------------
if not "%~1"=="" (
    if exist "%~1\" (
        set "TARGET_FOLDER=%~f1"
        goto :process_sync_folder
    )
)

:ask_folder_prompt
echo.
echo ----------------------------------------------------------------------------
echo   FOLDER SELECTION (IMAGES + VOICEOVER AUTO-SYNC)
echo ----------------------------------------------------------------------------
echo   Is folder mein aapki Images (.jpg, .png, .webp) aur Voiceover (.mp3, .wav)
echo   rakhi hain, uska path paste karein (ya folder ko is CMD mein drag karein).
echo   TIP: Khali ENTER dabayein agar aap Windows Browse Folder window kholna chahte hain!
echo ----------------------------------------------------------------------------
set "TARGET_FOLDER="
set /p TARGET_FOLDER="Folder Path (or press ENTER to Browse): "

REM Strip surrounding quotes if user dragged folder into CMD or pasted with quotes
if defined TARGET_FOLDER (
    set "TARGET_FOLDER=!TARGET_FOLDER:"=!"
)

REM If user pressed ENTER on empty prompt, open Windows Folder Browser Dialog via PowerShell
if "!TARGET_FOLDER!"=="" (
    echo   Opening Windows Folder Browser dialog...
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $dlg = New-Object System.Windows.Forms.FolderBrowserDialog; $dlg.Description = 'Select Folder containing Images and Voiceover Audio for Timeline Auto-Sync'; $dlg.ShowNewFolderButton = $false; if ($dlg.ShowDialog() -eq 'OK') { Write-Output $dlg.SelectedPath }"` ) do (
        set "TARGET_FOLDER=%%I"
    )
)

if "!TARGET_FOLDER!"=="" (
    echo   [WARN] No folder selected. Please enter or select a folder path.
    goto :ask_folder_prompt
)

if not exist "!TARGET_FOLDER!\" (
    echo   [ERROR] Folder does not exist: "!TARGET_FOLDER!"
    goto :ask_folder_prompt
)

:process_sync_folder
echo.
echo [2/3] Scanning Folder: "!TARGET_FOLDER!"
set /a IMG_COUNT=0
set /a AUDIO_COUNT=0
set /a VIDEO_COUNT=0

for %%F in ("!TARGET_FOLDER!\*.png" "!TARGET_FOLDER!\*.jpg" "!TARGET_FOLDER!\*.jpeg" "!TARGET_FOLDER!\*.webp" "!TARGET_FOLDER!\*.gif" "!TARGET_FOLDER!\*.bmp") do (
    if exist "%%~fF" set /a IMG_COUNT+=1
)
for %%F in ("!TARGET_FOLDER!\*.mp3" "!TARGET_FOLDER!\*.wav" "!TARGET_FOLDER!\*.m4a" "!TARGET_FOLDER!\*.aac" "!TARGET_FOLDER!\*.flac" "!TARGET_FOLDER!\*.ogg") do (
    if exist "%%~fF" set /a AUDIO_COUNT+=1
)
for %%F in ("!TARGET_FOLDER!\*.mp4" "!TARGET_FOLDER!\*.mov" "!TARGET_FOLDER!\*.mkv" "!TARGET_FOLDER!\*.avi" "!TARGET_FOLDER!\*.webm") do (
    if exist "%%~fF" set /a VIDEO_COUNT+=1
)

echo       - Images found    : !IMG_COUNT!
echo       - Voiceover Audio : !AUDIO_COUNT!
if !VIDEO_COUNT! GTR 0 (
    echo       - Video Clips     : !VIDEO_COUNT!
)

set /a TOTAL_FOUND=!IMG_COUNT!+!AUDIO_COUNT!+!VIDEO_COUNT!
if !TOTAL_FOUND! EQU 0 (
    echo.
    echo [ERROR] Is folder mein koi Images (.jpg/.png/.webp) ya Voiceover (.mp3/.wav) nahi mili!
    echo         Folder: "!TARGET_FOLDER!"
    goto :ask_folder_prompt
)

echo.
echo [3/3] Importing ^& Auto-Syncing Images with Voiceover on Timeline...

REM First try direct local server folder sync via PowerShell Invoke-RestMethod
powershell -NoProfile -Command "$body = @{ folderPath = '!TARGET_FOLDER!'; autoSyncVoiceover = $true; clearTimeline = $true } | ConvertTo-Json; try { $res = Invoke-RestMethod -Uri '%APP_URL%/api/automation/auto-sync-folder' -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop; Write-Host ('      [SUCCESS] Synced ' + $res.imageCount + ' image(s) (' + $res.perImageDuration + 's each) across Voiceover (' + $res.totalVoiceoverDuration + 's) on Timeline!') -ForegroundColor Green; exit 0 } catch { exit 1 }"

if !ERRORLEVEL! NEQ 0 (
    echo       Uploading files via HTTP multipart for Auto-Sync...
    set "BATCH_ID=sync_%RANDOM%_%RANDOM%"
    for %%F in ("!TARGET_FOLDER!\*.mp3" "!TARGET_FOLDER!\*.wav" "!TARGET_FOLDER!\*.m4a" "!TARGET_FOLDER!\*.aac" "!TARGET_FOLDER!\*.flac" "!TARGET_FOLDER!\*.ogg" "!TARGET_FOLDER!\*.png" "!TARGET_FOLDER!\*.jpg" "!TARGET_FOLDER!\*.jpeg" "!TARGET_FOLDER!\*.webp" "!TARGET_FOLDER!\*.gif" "!TARGET_FOLDER!\*.bmp" "!TARGET_FOLDER!\*.mp4" "!TARGET_FOLDER!\*.mov" "!TARGET_FOLDER!\*.mkv" "!TARGET_FOLDER!\*.avi" "!TARGET_FOLDER!\*.webm") do (
        if exist "%%~fF" (
            echo         Uploading: "%%~nxF" ...
            curl.exe -s -X POST "%APP_URL%/api/media/import?syncBatchId=!BATCH_ID!" -F "files=@%%~fF" >nul
        )
    )
    curl.exe -s -X POST "%APP_URL%/api/automation/auto-sync-finalize" -H "Content-Type: application/json" -d "{\"syncBatchId\":\"!BATCH_ID!\",\"clearTimeline\":true}" >nul
    echo       [SUCCESS] Uploaded ^& Auto-Synced !IMG_COUNT! Image(s) + !AUDIO_COUNT! Voiceover on Timeline!
)

echo.
echo ============================================================================
echo   DONE! Check Hussain Video Editor Timeline (V1: Images, A1: Voiceover).
echo ============================================================================
echo.
set "AGAIN_CHOICE="
set /p AGAIN_CHOICE="Sync another folder? Press ENTER to sync another folder, or type Q to exit: "
if /I "!AGAIN_CHOICE!"=="Q" exit /b 0
goto :ask_folder_prompt
