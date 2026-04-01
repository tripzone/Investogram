#!/bin/bash

# Stock Dashboard Startup Script
# Starts a local web server with proxy and opens the dashboard

cd "$(dirname "$0")"

# To use a virtual environment instead of the global Python, uncomment the following:
# if [ ! -d ".venv" ]; then
#     echo "🔧 Creating virtual environment..."
#     python3.11 -m venv .venv
# fi
# echo "📦 Checking dependencies..."
# .venv/bin/pip install -r requirements.txt -q
# PYTHON=".venv/bin/python"
PYTHON="python3.11"

echo "🚀 Starting Stock Dashboard..."
echo ""
echo "Server will run at: http://localhost:8080"
echo "Press Ctrl+C to stop the server"
echo ""

export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/serviceAccountKey.json"
$PYTHON server.py &
SERVER_PID=$!

sleep 2

open http://localhost:8080

echo "✅ Dashboard is now running!"
echo ""
echo "To stop the server, press Ctrl+C in this terminal"
echo ""

trap "kill $SERVER_PID; echo ''; echo 'Server stopped'; exit 0" INT
wait $SERVER_PID
