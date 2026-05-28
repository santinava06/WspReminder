@echo off
setlocal
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9001 & set BRIDGE_AUTH_DIR=bridge-data\admin & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-admin.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9002 & set BRIDGE_AUTH_DIR=bridge-data\erika & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-erika.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9003 & set BRIDGE_AUTH_DIR=bridge-data\melina & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-melina.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9004 & set BRIDGE_AUTH_DIR=bridge-data\academico-1 & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-academico-1.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9005 & set BRIDGE_AUTH_DIR=bridge-data\in & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-in.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9006 & set BRIDGE_AUTH_DIR=bridge-data\luciana & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-luciana.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9007 & set BRIDGE_AUTH_DIR=bridge-data\yanina & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-yanina.log 2>&1"
timeout /t 2 /nobreak >nul
start /B "" cmd /c "set NODE_ENV=production & set BRIDGE_PORT=9008 & set BRIDGE_AUTH_DIR=bridge-data\julieta & set LOG_LEVEL=info & node bridge-server.js > logs\bridge-julieta.log 2>&1"
echo All 8 bridges started in background.
