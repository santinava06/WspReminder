@echo off
set "ROOT=C:\Users\santi\Desktop\Escencial\WspReminder\whatsapp-reminders-backend"
cd /d "%ROOT%"
set BRIDGE_PORT=%1
set "BRIDGE_AUTH_DIR=%ROOT%\bridge-data\%2"
set LOG_LEVEL=info
"%ROOT%\node_modules\.bin\node" bridge-server.js >> "%ROOT%\logs\bridge-%2.log" 2>&1
