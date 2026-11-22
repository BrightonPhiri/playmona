@echo off
rem PlayMona Offline Event Mode: starts the local server and opens the MC panel.
rem No internet needed. Keep this window open during the event (closing it stops the games).
rem Always use this file (port 8970): the saved event belongs to this address.
cd /d "%~dp0.."
title PlayMona Offline Event - keep this window open
echo.
echo   PlayMona Offline Event
echo   MC panel:   http://localhost:8970/offline
echo   Projector:  http://localhost:8970/offline?screen
echo.
echo   Keep this window open. Press Ctrl+C to stop.
echo.
start "" "http://localhost:8970/offline"
node tools\serve.js 8970
pause
