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
echo OK - Node.js found

echo [2/3] Checking dependencies ...
if not exist "node_modules\vite" (
    echo Installing dependencies. Please wait...
    call "%NODE_PATH%\npm.cmd" install
    if %errorlevel% neq 0 (
        echo [ERROR] Install failed!
        pause
        exit /b 1
    )
)
echo OK - Dependencies ready

echo [3/3] Starting server...
echo.
echo Opening http://localhost:5173
echo If browser does not open, visit the URL manually
echo Close this window to stop the server
echo =====================================
echo.

start "" http://localhost:5173

call "node_modules\.bin\vite.cmd"

pause
