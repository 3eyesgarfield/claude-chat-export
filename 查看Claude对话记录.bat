@echo off
chcp 65001 >nul
title Claude Conversation Viewer

:: Find node.exe
set NODE_EXE=
where node >nul 2>&1
if %errorlevel%==0 (
    set NODE_EXE=node
    goto :run
)

for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%APPDATA%\nvm\current\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
) do (
    if exist %%P (
        set NODE_EXE=%%P
        goto :run
    )
)

echo Node.js not found. Please install Node.js from https://nodejs.org
pause
exit /b 1

:run
set SCRIPT=%USERPROFILE%\.claude\scripts\view-transcript.js

if not exist "%SCRIPT%" (
    echo Script not found: %SCRIPT%
    pause
    exit /b 1
)

%NODE_EXE% "%SCRIPT%"

echo.
pause
