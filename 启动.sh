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
echo "OK - Node.js $(node --version)"

echo "[2/3] Checking dependencies ..."
if [ ! -d "node_modules/vite" ]; then
    echo "Installing dependencies. Please wait..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Install failed!"
        read -p "Press Enter to exit..."
        exit 1
    fi
fi
echo "OK - Dependencies ready"

echo "[3/3] Starting server..."
echo ""
echo "Opening http://localhost:5173"
echo "If browser does not open, visit the URL manually"
echo "Press Ctrl+C to stop the server"
echo "====================================="
echo ""

open http://localhost:5173 2>/dev/null &
npx vite
