#!/bin/bash

# Start stock dashboard server in background (persistent)

cd "$(dirname "$0")"

# Check if already running
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Server already running on port 8080"
    echo "   Visit: http://localhost:8080"
    exit 0
fi

# To use a virtual environment instead of the global Python, uncomment the following:
# if [ ! -d ".venv" ]; then
#     echo "🔧 Creating virtual environment..."
#     python3.11 -m venv .venv
# fi
# echo "📦 Checking dependencies..."
# .venv/bin/pip install -r requirements.txt -q
# PYTHON=".venv/bin/python"
PYTHON="python3.11"

export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/serviceAccountKey.json"
nohup $PYTHON server.py > server.log 2>&1 &
SERVER_PID=$!

sleep 2

if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "✅ Stock Dashboard server started in background!"
    echo "   PID: $SERVER_PID"
    echo "   URL: http://localhost:8080"
    echo "   Log: $(pwd)/server.log"
    echo ""
    echo "To stop: ./stop-server.sh"
    echo "         or: kill $SERVER_PID"
else
    echo "❌ Failed to start server. Check server.log for errors."
    exit 1
fi
