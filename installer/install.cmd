@echo off
rem Double-click to install or upgrade A.Y Scan with Windows PowerShell.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
