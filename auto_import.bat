@echo off
setlocal EnableDelayedExpansion
title Hussain Video Editor v1.0.0 - Voiceover ^& Images Auto-Sync Engine

REM ============================================================================
REM Hussain Video Editor v1.0.0 - Voiceover & Images Auto-Sync Engine (.BAT)
REM
REM How it works:
REM   1. Double-click auto_import.bat (or drag a folder onto it).
REM   2. Enter/paste the folder path containing your Voiceover audio and Images
REM      (or press ENTER to open the Windows Folder Browser dialog).
REM   3. The engine automatically inspects the Voiceover file(s), calculates
REM      the exact Voiceover duration, and divides that duration equally across
REM      all provided Images (Image Duration = Voice Duration / Image Count).
REM   4. Voiceover is placed on Audio Track 1 (A1) and Images are placed
REM      sequentially on Video Track 1 (V1), completely synced with zero gaps!
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
echo   Hussain Video Editor v1.0.0 - Voiceover ^& Images Auto-Sync Engine (.BAT)
echo ============================================================================
echo   Editor URL : %APP_URL%
echo ============================================================================
echo.

REM ----------------------------------------------------------------------------
REM Step 1: Ensure Hussain Video Editor Server is Running
REM ----------------------------------------------------------------------------
curl.exe -s -f "%APP_URL%/api/system/info" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/3] Hussain Video Editor is starting up...
    if exist "dist\HussainVideoEditor\HussainVideoEditor.exe" (
        start "" "dist\HussainVideoEditor\HussainVideoEditor.exe"
    ) else if exist "HussainVideoEditor.exe" (
        start "" "HussainVideoEditor.exe"
    ) else (
        start "HussainVideoEditorServer" cmd /c "npm run dev"
        start "" "%APP_URL%"
    )

    echo       Waiting for Editor on %APP_URL% ...
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
echo   FOLDER SELECTION (VOICEOVER + IMAGES)
echo ----------------------------------------------------------------------------
echo   Is folder mein aapki Voiceover (.mp3, .wav) aur Images (.jpg, .png, .webp)
echo   rakhi hain, uska path paste karein (ya folder ko is CMD mein drag karein).
echo   TIP: Khali ENTER dabayein Windows Browse Folder window kholne ke liye!
echo ----------------------------------------------------------------------------
set "TARGET_FOLDER="
set /p TARGET_FOLDER="Folder Path (ya ENTER dabayein): "

REM Strip surrounding quotes if user dragged folder into CMD or pasted with quotes
if defined TARGET_FOLDER (
    set "TARGET_FOLDER=!TARGET_FOLDER:"=!"
)

REM If user pressed ENTER on empty prompt, open Windows Folder Browser Dialog via PowerShell
if "!TARGET_FOLDER!"=="" (
    echo   Opening Windows Folder Browser dialog...
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $dlg = New-Object System.Windows.Forms.FolderBrowserDialog; $dlg.Description = 'Select Folder containing Voiceover Audio and Images for Timeline Auto-Sync'; $dlg.ShowNewFolderButton = $false; if ($dlg.ShowDialog() -eq 'OK') { Write-Output $dlg.SelectedPath }"` ) do (
        set "TARGET_FOLDER=%%I"
    )
)

if "!TARGET_FOLDER!"=="" (
    echo   [WARN] Koi folder select nahi kiya gaya. Please folder path enter karein.
    goto :ask_folder_prompt
)

if not exist "!TARGET_FOLDER!\" (
    echo   [ERROR] Folder exist nahi karta: "!TARGET_FOLDER!"
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

echo       - Voiceover Audio : !AUDIO_COUNT! file(s)
echo       - Images found    : !IMG_COUNT! file(s)
if !VIDEO_COUNT! GTR 0 (
    echo       - Video Clips     : !VIDEO_COUNT! file(s)
)

set /a TOTAL_FOUND=!IMG_COUNT!+!AUDIO_COUNT!+!VIDEO_COUNT!
if !TOTAL_FOUND! EQU 0 (
    echo.
    echo [ERROR] Is folder mein koi Images (.jpg/.png/.webp) ya Voiceover (.mp3/.wav) nahi mili!
    echo         Folder: "!TARGET_FOLDER!"
    goto :ask_folder_prompt
)

echo.
echo [3/3] Voiceover ke hisab sy Images ki duration calculate aur auto-sync ho rahi hai...

REM Replace backslashes with forward slashes for clean JSON payload
set "SAFE_FOLDER=!TARGET_FOLDER:\=/!"

REM Call server auto-sync API via PowerShell Invoke-RestMethod for exact duration feedback
powershell -NoProfile -Command "$body = @{ folderPath = $env:TARGET_FOLDER; autoSyncVoiceover = $true; clearTimeline = $true } | ConvertTo-Json; try { $res = Invoke-RestMethod -Uri '%APP_URL%/api/automation/auto-sync-folder' -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop; Write-Host ''; Write-Host '============================================================================' -ForegroundColor Green; Write-Host '  VOICEOVER + IMAGES AUTO-SYNC RESULTS:' -ForegroundColor Green; Write-Host '============================================================================' -ForegroundColor Green; Write-Host ('  [+] Voiceover File(s)   : ' + $res.voiceoverCount + ' audio file(s)') -ForegroundColor Cyan; Write-Host ('  [+] Total Voice Length  : ' + $res.totalVoiceoverDuration + ' seconds') -ForegroundColor Cyan; Write-Host ('  [+] Total Images Found  : ' + $res.imageCount + ' image(s)') -ForegroundColor Cyan; Write-Host ('  [+] IMAGE DURATION SET  : ' + $res.perImageDuration + ' SECONDS PER IMAGE (Voice Length / Images)') -ForegroundColor Yellow; Write-Host '  [+] Timeline Tracks     : Video Track 1 (V1: Images) + Audio Track 1 (A1: Voiceover)' -ForegroundColor Cyan; Write-Host '  [+] Status              : 100% Synced & Ready in Editor Timeline!' -ForegroundColor Green; Write-Host '============================================================================' -ForegroundColor Green; exit 0 } catch { exit 1 }"

if !ERRORLEVEL! NEQ 0 (
    echo       [INFO] Trying fallback upload method...
    set "BATCH_ID=sync_%RANDOM%_%RANDOM%"
    for %%F in ("!TARGET_FOLDER!\*.mp3" "!TARGET_FOLDER!\*.wav" "!TARGET_FOLDER!\*.m4a" "!TARGET_FOLDER!\*.aac" "!TARGET_FOLDER!\*.flac" "!TARGET_FOLDER!\*.ogg" "!TARGET_FOLDER!\*.png" "!TARGET_FOLDER!\*.jpg" "!TARGET_FOLDER!\*.jpeg" "!TARGET_FOLDER!\*.webp" "!TARGET_FOLDER!\*.gif" "!TARGET_FOLDER!\*.bmp" "!TARGET_FOLDER!\*.mp4" "!TARGET_FOLDER!\*.mov" "!TARGET_FOLDER!\*.mkv" "!TARGET_FOLDER!\*.avi" "!TARGET_FOLDER!\*.webm") do (
        if exist "%%~fF" (
            echo         Uploading: "%%~nxF" ...
            curl.exe -s -X POST "%APP_URL%/api/media/import?syncBatchId=!BATCH_ID!" -F "files=@%%~fF" >nul
        )
    )
    powershell -NoProfile -Command "$body = @{ syncBatchId = '!BATCH_ID!'; clearTimeline = $true } | ConvertTo-Json; try { $res = Invoke-RestMethod -Uri '%APP_URL%/api/automation/auto-sync-finalize' -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop; Write-Host ''; Write-Host '============================================================================' -ForegroundColor Green; Write-Host '  VOICEOVER + IMAGES AUTO-SYNC RESULTS:' -ForegroundColor Green; Write-Host '============================================================================' -ForegroundColor Green; Write-Host ('  [+] Voice Length : ' + $res.totalVoiceoverDuration + ' seconds') -ForegroundColor Cyan; Write-Host ('  [+] Images Count : ' + $res.imageCount + ' image(s)') -ForegroundColor Cyan; Write-Host ('  [+] IMAGE DURATION SET : ' + $res.perImageDuration + ' SECONDS PER IMAGE') -ForegroundColor Yellow; Write-Host '============================================================================' -ForegroundColor Green; exit 0 } catch { exit 1 }"
)

echo.
echo Check Hussain Video Editor Timeline - Voiceover is on A1, Images are on V1,
echo and each image is timed to the voice length!
echo.
set "AGAIN_CHOICE="
set /p AGAIN_CHOICE="Sync another folder? Press ENTER to sync another folder, or type Q to exit: "
if /I "!AGAIN_CHOICE!"=="Q" exit /b 0
goto :ask_folder_prompt
