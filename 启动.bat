@echo off
cd /d "%~dp0"

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

echo =====================================
echo    XiaoXi - AI Girlfriend  v2.0
echo =====================================
echo.

echo [1/3] Checking Node.js ...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install from https://nodejs.org
    pause
    exit /b 1
)
echo OK

echo [2/3] Checking dependencies ...
if not exist "node_modules\vite" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Install failed!
        pause
        exit /b 1
    )
)
echo OK

echo [3/3] Starting app...
echo.
echo Close this window to stop the app
echo =====================================

start "" /B node node_modules\vite\bin\vite.js >nul 2>&1
ping -n 3 127.0.0.1 >nul
set VITE_DEV_SERVER_URL=http://localhost:5173
start "" node node_modules\electron\dist\electron.exe .

echo.
echo App started! You can close this window.
pause
