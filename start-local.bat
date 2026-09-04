@echo off
setlocal
cd /d "%~dp0"

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
echo.
if not exist "node_modules" npm install
start "" "http://localhost:%PORT%"
npm run dev
