@echo off
title TikTok LIVE Virtual Gift Printer
cd /d "%~dp0"

echo ============================================================
echo   TikTok LIVE Virtual Gift Printer
echo ============================================================
echo.

set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

if not exist "%PY%" (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PY=python"
    ) else (
        echo [ERROR] Python not found in %LOCALAPPDATA%\Programs\Python\Python312
        echo Checking PATH...
        set "PY=python"
    )
)

echo Starting Virtual Printer Server...
echo   Web Interface : http://localhost:8000/
echo   WebSocket     : ws://localhost:8765
echo.
echo Opening browser...
start "" http://localhost:8000/

echo.
echo [INFO] Server is running! Keep this window OPEN while streaming.
echo [INFO] To stop the server, close this window or press Ctrl+C.
echo.

"%PY%" server.py %*

pause

