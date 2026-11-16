@echo off
REM STC Testing System - one-click updater. Downloads the latest code from
REM GitHub and copies it over this folder. Your data folder is never touched.
REM Close the black server window first, then double-click this file.
title STC Testing System - Update
cd /d "%~dp0"
echo.
echo  STC Testing System - Update
echo  Downloading the latest version from GitHub...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE.ps1"
echo.
pause
