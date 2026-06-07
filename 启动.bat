@echo off
cd /d "%~dp0"

set "NODE_PATH=C:\Program Files\nodejs"
set "PATH=%NODE_PATH%;%PATH%"

echo =====================================
echo    XiaoXi - AI Girlfriend  v2.0
echo =====================================
echo.

echo [1/3] Checking Node.js ...
"%NODE_PATH%\node.exe" --version >nul 2>&1
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
    call "%NODE_PATH%\npm.cmd" install
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

start "" /B "%NODE_PATH%\node.exe" node_modules\vite\bin\vite.js >nul 2>&1
ping -n 3 127.0.0.1 >nul
start "" "%NODE_PATH%\node.exe" node_modules\electron\dist\electron.exe .

echo.
echo App started! You can close this window.
pause
