@echo off
REM Creates/updates the default seller account from the OWNER_* settings in .env,
REM then (once) adds the default products from database\seeds\default_products.sql.
REM setup.bat and start.bat run this automatically.
cd /d "%~dp0"

if not exist ".env" (
    echo [skip] No .env file - run setup.bat first.
    exit /b 0
)

docker exec -i --env-file .env beautyhub-php php < scripts\seed-owner.php
if errorlevel 1 (
    echo [ERROR] Could not create the default seller. Check the OWNER_* settings in .env.
    exit /b 1
)

set "DB_USER=beautyhub"
set "DB_NAME=beautyhub"
set "OWNER_EMAIL="
set "OWNER_STORE_SLUG="
set "OWNER_SEED_PRODUCTS=true"
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="DB_USER" set "DB_USER=%%b"
    if /i "%%a"=="DB_NAME" set "DB_NAME=%%b"
    if /i "%%a"=="OWNER_EMAIL" set "OWNER_EMAIL=%%b"
    if /i "%%a"=="OWNER_STORE_SLUG" set "OWNER_STORE_SLUG=%%b"
    if /i "%%a"=="OWNER_SEED_PRODUCTS" set "OWNER_SEED_PRODUCTS=%%b"
)
if "%OWNER_EMAIL%"=="" exit /b 0
if /i not "%OWNER_SEED_PRODUCTS%"=="true" exit /b 0

REM Load the seeder function, then run it for the owner's store (does nothing after the first time).
docker exec -i -e PGOPTIONS=--client-min-messages=warning beautyhub-postgres psql -q -v ON_ERROR_STOP=1 -U %DB_USER% -d %DB_NAME% < database\seeds\default_products.sql
if errorlevel 1 (
    echo [ERROR] Could not load database\seeds\default_products.sql
    exit /b 1
)
for /f %%n in ('docker exec beautyhub-postgres psql -tA -U %DB_USER% -d %DB_NAME% -c "SELECT seed_default_products(id) FROM stores WHERE slug = '%OWNER_STORE_SLUG%'"') do (
    if not "%%n"=="0" echo [OK] Added %%n default products to your store.
)
exit /b 0
