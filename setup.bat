@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title BeautyHub setup

echo ============================================
echo   BeautyHub - first time setup
echo ============================================
echo.

REM --- 1. Check prerequisites -------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Get it from https://nodejs.org
    goto :fail
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed. Get Docker Desktop from https://www.docker.com/products/docker-desktop
    goto :fail
)
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is installed but not running. Start Docker Desktop and run setup.bat again.
    goto :fail
)
echo [OK] Docker is running
echo.

REM --- 2. Environment file ----------------------------------------------
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [OK] Created .env from .env.example
) else (
    echo [OK] .env already exists - keeping it
)
echo.

REM --- 3. Node packages -------------------------------------------------
echo Installing npm packages...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :fail
)
echo.

REM --- 4. Docker containers (PostgreSQL, pgAdmin, PHP) ------------------
echo Starting PostgreSQL, pgAdmin and the PHP backend...
docker compose up -d --build
if errorlevel 1 (
    echo [ERROR] docker compose failed. Check that ports 5432, 5052 and 8088 are free.
    goto :fail
)

echo Waiting for PostgreSQL to be ready...
set /a tries=0
:waitdb
set "health="
for /f "delims=" %%h in ('docker inspect -f "{{.State.Health.Status}}" beautyhub-postgres 2^>nul') do set "health=%%h"
if "!health!"=="healthy" goto :dbready
set /a tries+=1
if !tries! geq 30 (
    echo [ERROR] PostgreSQL did not become ready. Run: docker compose logs postgres
    goto :fail
)
timeout /t 2 /nobreak >nul
goto :waitdb

:dbready
echo [OK] PostgreSQL is ready
call "%~dp0migrate.bat"
if errorlevel 1 goto :fail
call "%~dp0seed-owner.bat"
if errorlevel 1 goto :fail
echo.

echo ============================================
echo   Setup complete!
echo ============================================
echo   Run start.bat to launch the website.
echo.
echo   Website      http://localhost:3000
echo   pgAdmin      http://localhost:5052
echo   PHP API      http://localhost:8088/php/main.php
echo   WebSocket    ws://localhost:3001
echo.
echo   pgAdmin login: see PGADMIN_EMAIL / PGADMIN_PASSWORD in .env
echo   DB password (asked once in pgAdmin): see DB_PASSWORD in .env
echo.
pause
exit /b 0

:fail
echo.
echo Setup did not finish.
pause
exit /b 1
