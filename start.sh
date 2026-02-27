#!/bin/bash

# Stock Dashboard Startup Script
# Starts a local web server with proxy and opens the dashboard

echo "🚀 Starting Stock Dashboard..."
echo ""
echo "Server will run at: http://localhost:8080"
echo "Press Ctrl+C to stop the server"
echo ""

# Start custom Python server with proxy and open browser
cd "$(dirname "$0")"
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/serviceAccountKey.json"
python3 server.py &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Open in default browser
open http://localhost:8080

# Keep script running and show instructions
echo "✅ Dashboard is now running!"
echo ""
echo "To stop the server, press Ctrl+C in this terminal"
echo ""

# Wait for Ctrl+C
trap "kill $SERVER_PID; echo ''; echo '👋 Server stopped'; exit 0" INT
wait $SERVER_PID
