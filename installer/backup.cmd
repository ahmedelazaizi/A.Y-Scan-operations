@echo off
rem Double-click to run backup.ps1 with Windows PowerShell.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" %*
if errorlevel 1 pause
