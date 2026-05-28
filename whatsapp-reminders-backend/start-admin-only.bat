@echo off
set "ROOT=C:\Users\santi\Desktop\Escencial\WspReminder\whatsapp-reminders-backend"
cd /d "%ROOT%"
set BRIDGE_PORT=9001
set "BRIDGE_AUTH_DIR=%ROOT%\bridge-data\admin"
set LOG_LEVEL=info
"C:\nvm4w\nodejs\node.exe" bridge-server.js >> "%ROOT%\logs\bridge-admin.log" 2>&1
