@echo off
cd /d "%~dp0"
echo ============================================
echo   WARNING: this DELETES all database data
echo   (users, products, pgAdmin settings) and
echo   recreates empty tables from database\postgres\*.sql.
echo ============================================
set /p confirm=Type YES to continue:
if /i not "%confirm%"=="YES" (
    echo Cancelled.
    pause
    exit /b 0
)

docker compose down -v
docker compose up -d --build
call "%~dp0migrate.bat"
call "%~dp0seed-owner.bat"
echo.
echo Database reset. Tables recreated from database\postgres\*.sql
pause
