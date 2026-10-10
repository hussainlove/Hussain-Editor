#!/usr/bin/env python3
"""
Hussain Video Editor - Native Windows Desktop Launcher (PyWebView / Edge App Mode + Bundled FFmpeg)
Automatically starts the local Hussain Video Editor server on port 3000 if not already running,
then opens the native desktop window.
"""
import os
import sys
import time
import urllib.request
import subprocess
from pathlib import Path

APP_NAME = "Hussain Video Editor"
APP_VERSION = "1.0.0"
APP_URL = "http://localhost:3000"

def get_project_root() -> Path:
    curr = Path(__file__).resolve().parent
    for _ in range(4):
        if (curr / "package.json").exists() and (curr / "server.ts").exists():
            return curr
        if curr.parent == curr:
            break
        curr = curr.parent
    return Path.cwd()

def is_server_online() -> bool:
    try:
        with urllib.request.urlopen(f"{APP_URL}/api/system/info", timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False

def start_backend_server(root_dir: Path):
    ffmpeg_bin = root_dir / "ffmpeg" / "bin"
    if ffmpeg_bin.exists():
        os.environ["PATH"] = str(ffmpeg_bin) + os.pathsep + os.environ.get("PATH", "")

    if not is_server_online():
        creationflags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW on Windows
        subprocess.Popen(
            "npm run dev",
            cwd=str(root_dir),
            shell=True,
            creationflags=creationflags,
        )
        for _ in range(30):
            time.sleep(1)
            if is_server_online():
                break

def main():
    root_dir = get_project_root()
    start_backend_server(root_dir)

    try:
        import webview  # pywebview for native Windows 10/11 EdgeWebView2 window
        webview.create_window(
            title=f"{APP_NAME} v{APP_VERSION}",
            url=APP_URL,
            width=1440,
            height=900,
            min_size=(1280, 720),
            background_color="#090D16",
            text_select=False,
        )
        webview.start()
    except ImportError:
        import webbrowser
        webbrowser.open(APP_URL)

if __name__ == "__main__":
    main()
