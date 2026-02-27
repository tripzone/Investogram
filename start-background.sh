#!/bin/bash

# Start stock dashboard server in background (persistent)

cd "$(dirname "$0")"

# Check if already running
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Server already running on port 8000"
    echo "   Visit: http://localhost:8000"
    exit 0
fi

# Start server in background
nohup python3 server.py > server.log 2>&1 &
SERVER_PID=$!

# Wait a moment to check if it started successfully
sleep 2

if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "✅ Stock Dashboard server started in background!"
    echo "   PID: $SERVER_PID"
    echo "   URL: http://localhost:8000"
    echo "   Log: $(pwd)/server.log"
    echo ""
    echo "To stop: ./stop-server.sh"
    echo "         or: kill $SERVER_PID"
else
    echo "❌ Failed to start server. Check server.log for errors."
    exit 1
fi
