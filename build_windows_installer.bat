@echo off
REM Root wrapper for installer\build_windows_installer.bat
if exist "%~dp0installer\build_windows_installer.bat" (
    call "%~dp0installer\build_windows_installer.bat" %*
    exit /b %ERRORLEVEL%
)
echo installer\build_windows_installer.bat not found!
pause
