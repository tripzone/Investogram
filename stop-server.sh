#!/bin/bash

# Stop stock dashboard server

echo "Stopping stock dashboard server..."

if lsof -ti:8000 >/dev/null 2>&1; then
    lsof -ti:8000 | xargs kill -9
    echo "✅ Server stopped"
else
    echo "⚠️  No server running on port 8000"
fi
