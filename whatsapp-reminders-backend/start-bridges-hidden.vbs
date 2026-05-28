Set WshShell = CreateObject("WScript.Shell")
rootDir = "C:\Users\santi\Desktop\Escencial\WspReminder\whatsapp-reminders-backend"
WshShell.CurrentDirectory = rootDir

' Admin - 9001
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9001 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\admin & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-admin.log 2>&1", 0, False
WScript.Sleep 3000

' Erika - 9002
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9002 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\erika & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-erika.log 2>&1", 0, False
WScript.Sleep 3000

' Melina - 9003
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9003 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\melina & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-melina.log 2>&1", 0, False
WScript.Sleep 3000

' Academico-1 - 9004
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9004 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\academico-1 & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-academico-1.log 2>&1", 0, False
WScript.Sleep 3000

' In - 9005
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9005 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\in & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-in.log 2>&1", 0, False
WScript.Sleep 3000

' Luciana - 9006
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9006 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\luciana & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-luciana.log 2>&1", 0, False
WScript.Sleep 3000

' Yanina - 9007
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9007 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\yanina & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-yanina.log 2>&1", 0, False
WScript.Sleep 3000

' Julieta - 9008
WshShell.Run "cmd /c set NODE_ENV=production & set BRIDGE_PORT=9008 & set BRIDGE_AUTH_DIR=" & rootDir & "\bridge-data\julieta & set LOG_LEVEL=info & node bridge-server.js > " & rootDir & "\logs\bridge-julieta.log 2>&1", 0, False

WScript.Sleep 5000
CreateObject("WScript.Shell").Run "cmd /c echo All 8 bridges started & pause", 1, False
