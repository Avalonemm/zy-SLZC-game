@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
if errorlevel 1 (
  echo.
  echo Startup failed. Keep this window open and review the error above.
  pause
)
