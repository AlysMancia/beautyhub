@echo off
cd /d "%~dp0"
echo Stopping BeautyHub containers (your data is kept)...
docker compose stop
echo Done.
pause
