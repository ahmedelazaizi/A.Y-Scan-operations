@echo off
rem Double-click to run start.ps1 with Windows PowerShell.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
