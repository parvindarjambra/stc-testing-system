#!/bin/sh
# ============================================================
#  STC Testing System — Super Sys-Tech Computers Centre, Umerkot
#  Start script for macOS / Linux. On Windows use START.bat.
#  Laptops on the same Wi-Fi / LAN open: http://<PC-IP>:3000
# ============================================================
cd "$(dirname "$0")" || exit 1

echo ""
echo "============================================================"
echo " Super Sys-Tech Computers Centre - Umerkot"
echo " Examination, Quiz & Result Management System"
echo " \"Empowering Skills Since 1997\""
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed on this PC."
  echo "Please install Node.js LTS from https://nodejs.org and try again."
  exit 1
fi

echo "Node.js found: $(node --version)"
echo ""
echo "This machine's IP addresses (laptops use the LAN IPv4):"
if command -v hostname >/dev/null 2>&1; then hostname -I 2>/dev/null || hostname -i 2>/dev/null; fi
if command -v ip >/dev/null 2>&1; then ip -4 addr show | grep -o 'inet [0-9.]*' | awk '{print $2}'; fi
if command -v ifconfig >/dev/null 2>&1; then ifconfig | grep -o 'inet [0-9.]*' | awk '{print $2}' | grep -v '127.0.0.1'; fi
echo ""
echo "Students / teachers open:  http://<PC-IP>:3000"
echo "On this PC you can also open:  http://localhost:3000"
echo ""
echo "Keep this running all day (7:00 AM - 7:30 PM)."
echo "At 7:30 PM the system auto-consolidates the day's results."
echo "To stop the server, press Ctrl+C."
echo "============================================================"
echo ""

PORT="${PORT:-3000}" exec node server.js
