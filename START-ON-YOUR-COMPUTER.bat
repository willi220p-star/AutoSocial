@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 18 or newer from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
node scripts\run-on-this-computer.js
pause
