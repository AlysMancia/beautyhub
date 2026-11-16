@echo off
cd /d "%~dp0"
title BeautyHub

if not exist "node_modules" (
    echo node_modules is missing - run setup.bat first.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo Docker is not running. Start Docker Desktop and try again.
    pause
    exit /b 1
)

echo Starting PostgreSQL, pgAdmin and the PHP backend...
REM --build only rebuilds when docker\php changed (otherwise it's instant).
docker compose up -d --build
if errorlevel 1 (
    pause
    exit /b 1
)

call "%~dp0migrate.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

call "%~dp0seed-owner.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo   Website      http://localhost:3000
echo   pgAdmin      http://localhost:5052
echo   WebSocket    ws://localhost:3001
echo.
echo Starting Next.js + WebSocket server (Ctrl+C to stop)...
echo.
call npm run dev:all
