@echo off
REM STC Testing System - Super Sys-Tech Computers Centre, Umerkot
REM Double-click to start the server on this Admin PC.
REM Laptops on the same Wi-Fi / LAN open: http://PC-IP:PORT
title STC Testing System - Super Sys-Tech Computers Centre
cd /d "%~dp0"
echo.
echo  Super Sys-Tech Computers Centre - Umerkot
echo  Examination, Quiz and Result Management System
echo  Empowering Skills Since 1997
echo.
where node >nul 2>nul
if errorlevel 1 goto :no_node
for /f "tokens=*" %%v in ('node --version') do set NODEVER=%%v
echo  Node.js found: %NODEVER%
echo.
set PORT=3000
netstat -aon | findstr "LISTENING" | findstr ":3000" >nul 2>nul
if not errorlevel 1 set PORT=3001
if "%PORT%"=="3001" echo  NOTE: Port 3000 is busy on this PC, using port 3001.
echo.
echo  This PC network addresses, laptops use the Wi-Fi / LAN IPv4:
ipconfig | findstr "IPv4"
echo.
echo  Students and teachers open in their browser:
echo    http://YOUR-PC-IP:%PORT%
echo    Example: http://192.168.1.10:%PORT%
echo  On THIS PC open:  http://localhost:%PORT%
echo.
echo  Keep this window open while tests are running.
echo  Admin runs Day Consolidation any time - evening or next morning.
echo  To stop the server, press Ctrl+C in this window.
echo.
node server.js
echo.
echo  Server stopped.
pause
exit /b 0
:no_node
echo.
echo  ERROR: Node.js is not installed on this PC.
echo  Install Node.js LTS once from https://nodejs.org
echo  then double-click START again.
echo.
pause
exit /b 1
