#!/usr/bin/env python3
"""
Hussain Video Editor - Native Windows Desktop Launcher (PyWebView + Bundled FFmpeg)
Bundles into a standalone Windows executable using PyInstaller without requiring Python, Node.js, or FFmpeg in PATH.
"""
import os
import sys
import time
import socket
import subprocess
import threading
from pathlib import Path

APP_NAME = "Hussain Video Editor"
APP_VERSION = "1.0.0"

def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore
    return Path(__file__).resolve().parent.parent

def get_user_data_dir() -> Path:
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    data_dir = Path(appdata) / APP_NAME
    for sub in ["projects", "projects/autosave", "cache/thumbnails", "cache/waveforms", "cache/proxies", "cache/exports", "logs"]:
        (data_dir / sub).mkdir(parents=True, exist_ok=True)
    return data_dir

def configure_bundled_ffmpeg(base_dir: Path):
    ffmpeg_bin = base_dir / "ffmpeg" / "bin"
    if ffmpeg_bin.exists():
        os.environ["PATH"] = str(ffmpeg_bin) + os.pathsep + os.environ.get("PATH", "")

def find_free_port(default_port: int = 3000) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", default_port)) != 0:
            return default_port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def main():
    base_dir = get_base_dir()
    user_data_dir = get_user_data_dir()
    configure_bundled_ffmpeg(base_dir)
    os.environ["HVE_USER_DATA_DIR"] = str(user_data_dir)

    port = find_free_port(3000)
    url = f"http://127.0.0.1:{port}"

    try:
        import webview  # pywebview for native Windows 10/11 EdgeWebView2 window
        window = webview.create_window(
            title=f"{APP_NAME} v{APP_VERSION}",
            url=url,
            width=1440,
            height=900,
            min_size=(1280, 720),
            background_color="#090D16",
            text_select=False,
        )
        webview.start()
    except ImportError:
        import webbrowser
        print(f"Launching {APP_NAME} at {url}")
        webbrowser.open(url)

if __name__ == "__main__":
    main()
