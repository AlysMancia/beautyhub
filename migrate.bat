@echo off
REM Applies every database\postgres\*.sql file (in name order) to the running database.
REM The files are written to be safe to run again, so this can run on every start.
cd /d "%~dp0"

set "DB_USER=beautyhub"
set "DB_NAME=beautyhub"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if /i "%%a"=="DB_USER" set "DB_USER=%%b"
        if /i "%%a"=="DB_NAME" set "DB_NAME=%%b"
    )
)

for %%f in (database\postgres\*.sql) do (
    echo Applying %%~nxf ...
    docker exec -i -e PGOPTIONS=--client-min-messages=warning beautyhub-postgres psql -q -v ON_ERROR_STOP=1 -U %DB_USER% -d %DB_NAME% < "%%f"
    if errorlevel 1 (
        echo [ERROR] %%~nxf failed.
        exit /b 1
    )
)
echo [OK] Database is up to date.
exit /b 0
