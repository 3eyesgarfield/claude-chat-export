@echo off
chcp 65001 >nul
title Export Claude Conversations to Markdown

set SCRIPT=%USERPROFILE%\.claude\scripts\export-to-md.js
set OUTDIR=%~dp0Claude-Conversations

if not exist "%SCRIPT%" (
    echo Script not found: %SCRIPT%
    pause & exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found. Please install from https://nodejs.org
    pause & exit /b 1
)

echo Exporting conversations to:
echo %OUTDIR%
echo.

node "%SCRIPT%" "%OUTDIR%"

echo.
echo Opening output folder...
explorer "%OUTDIR%"
pause
