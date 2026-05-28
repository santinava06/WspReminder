#!/usr/bin/env bash
# Launch one bridge-server per WhatsApp account
# Each bridge runs on its own port with isolated auth directory.
# All run in background; tail their logs to see QR codes.
#
# Usage: ./start-bridges.sh
# To view QR for a session:  curl http://localhost:PORT/qr
# To stop:                    ./stop-bridges.sh

set -e

declare -A BRIDGE_PORTS
BRIDGE_PORTS[admin]=9001
BRIDGE_PORTS[erika]=9002
BRIDGE_PORTS[melina]=9003
BRIDGE_PORTS[academico-1]=9004
BRIDGE_PORTS[in]=9005
BRIDGE_PORTS[luciana]=9006
BRIDGE_PORTS[yanina]=9007
BRIDGE_PORTS[julieta]=9008

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT_DIR/logs"

echo "Starting bridge servers in background..."
echo "Logs are written to logs/bridge-<session>.log"
echo ""

for session in "${!BRIDGE_PORTS[@]}"; do
  port="${BRIDGE_PORTS[$session]}"
  auth_dir="$ROOT_DIR/bridge-data/$session"
  log_file="$ROOT_DIR/logs/bridge-$session.log"
  pid_file="$ROOT_DIR/logs/bridge-$session.pid"

  mkdir -p "$auth_dir"

  BRIDGE_PORT="$port" BRIDGE_AUTH_DIR="$auth_dir" \
    nohup node "$ROOT_DIR/bridge-server.js" > "$log_file" 2>&1 &
  pid=$!
  echo $pid > "$pid_file"

  echo "  [$session] -> bridge on port $port (PID $pid)"
done

echo ""
echo "All bridges started."
echo "View QR codes:  tail -f logs/bridge-<session>.log"
echo "Or via HTTP:    curl http://localhost:<port>/qr"
echo "Stop all:       ./stop-bridges.sh"
echo ""
echo "Add these to your backend .env:"
for session in "${!BRIDGE_PORTS[@]}"; do
  port="${BRIDGE_PORTS[$session]}"
  env_key="${session//-/_}"
  env_key="${env_key^^}"
  echo "  BRIDGE_URL_${env_key}=http://localhost:${port}"
done
