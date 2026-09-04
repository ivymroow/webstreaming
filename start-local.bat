@echo off
setlocal
cd /d "%~dp0"
title webstreaming local server

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
  )
)

if not defined NODE_ENV set "NODE_ENV=development"
if not defined PORT set "PORT=3000"
if not defined PUBLIC_URL set "PUBLIC_URL=http://localhost:%PORT%"
if not defined CORS_ORIGINS set "CORS_ORIGINS=http://localhost:%PORT%,http://127.0.0.1:%PORT%"

echo Starting webstreaming locally on http://localhost:%PORT%
echo Press Ctrl+C to stop the server.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js, then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" "http://localhost:%PORT%"
call npm start

echo.
echo Server stopped or failed to start.
pause
