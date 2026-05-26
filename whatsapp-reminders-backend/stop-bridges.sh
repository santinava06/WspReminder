#!/usr/bin/env bash
# Stop all bridge-server processes

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT_DIR/logs"

if ls "$PID_DIR"/bridge-*.pid 1>/dev/null 2>&1; then
  echo "Stopping bridge servers..."
  for pid_file in "$PID_DIR"/bridge-*.pid; do
    if [ -f "$pid_file" ]; then
      pid=$(cat "$pid_file")
      session=$(basename "$pid_file" .pid | sed 's/bridge-//')
      if kill -0 "$pid" 2>/dev/null; then
        echo "  Stopping [$session] (PID $pid)..."
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pid_file"
    fi
  done
  echo "Done."
else
  # Fallback: try pkill
  pkill -f "bridge-server.js" 2>/dev/null && echo "Stopped bridge processes." || echo "No bridge processes found."
fi
