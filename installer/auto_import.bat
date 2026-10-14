@echo off
REM Delegate to root auto_import.bat or run from current directory
if exist "%~dp0..\auto_import.bat" (
    call "%~dp0..\auto_import.bat" %*
    exit /b %ERRORLEVEL%
)
if exist "%~dp0auto_import.bat" (
    call "%~dp0auto_import.bat" %*
    exit /b %ERRORLEVEL%
)
echo Please run auto_import.bat from the Hussain Video Editor root directory.
pause
