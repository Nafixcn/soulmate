#!/bin/bash
cd "$(dirname "$0")"

echo "====================================="
echo "   XiaoXi - AI Girlfriend  v2.0"
echo "====================================="
echo ""

echo "[1/3] Checking Node.js ..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found!"
    echo "Please install: brew install node"
    read -p "Press Enter to exit..."
    exit 1
fi
echo "OK"

export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

echo "[2/3] Checking dependencies ..."
if [ ! -d "node_modules/vite" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Install failed!"
        read -p "Press Enter to exit..."
        exit 1
    fi
fi
echo "OK"

echo "[3/3] Starting app..."
echo ""

npx vite &
sleep 2
VITE_DEV_SERVER_URL=http://localhost:5173 npx electron .

echo "App stopped."
