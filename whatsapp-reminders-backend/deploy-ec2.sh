#!/bin/bash
# Script para desplegar todos los bridges en EC2
# Ejecutar: bash deploy-ec2.sh

set -e

REPO_DIR="/home/ec2-user/WspReminder"
BRIDGE_DIR="$REPO_DIR/whatsapp-reminders-backend"
BASE_PORT=3178
SESSION_NAME="bridges"

echo "=== Deteniendo bridges existientes ==="
# Matar proceso bridge previo (si existe)
pkill -f "bridge-server" 2>/dev/null || true
# Matar screen previo
screen -S "$SESSION_NAME" -X quit 2>/dev/null || true
sleep 1

echo "=== Actualizando repositorio ==="
cd "$REPO_DIR"
git pull origin master

echo "=== Instalando dependencias ==="
cd "$BRIDGE_DIR"
npm install

echo "=== Iniciando todos los bridges en screen ==="
# Limpiar logs viejos
mkdir -p logs
rm -f logs/*.log

# Iniciar en screen (detached)
screen -dmS "$SESSION_NAME" bash -c "
  cd '$BRIDGE_DIR'
  node launcher.js
"

echo "=== Bridges iniciados en screen '$SESSION_NAME' ==="
echo ""
echo "Para ver logs: screen -r $SESSION_NAME"
echo "Para desconectar de screen: Ctrl+A, luego D"
echo ""
echo "=== Puertos y URLs para Render ==="
echo ""
for i in {0..7}; do
  SESSION_NAMES=("admin" "erika" "melina" "yanina" "julieta" "academico-1" "in" "luciana")
  PORT=$((BASE_PORT + i))
  echo "BRIDGE_URL_${SESSION_NAMES[$i]}=http://3.138.107.22:$PORT"
done
echo ""
echo "=== Estado del bridge admin (puerto 3178) ==="
sleep 2
curl -s http://localhost:3178/status | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3178/status
