@echo off
setlocal
set SCRIPT_DIR=%~dp0

:: Start server
cd /d "%SCRIPT_DIR%server"
if not exist "node_modules" (
    echo Installing server dependencies...
    call npm install
)
echo Starting server...
start cmd /k "npm run dev"

:: Start client
cd /d "%SCRIPT_DIR%client"
if not exist "node_modules" (
    echo Installing client dependencies...
    call npm install
)
echo Starting client...
start cmd /k "npm run dev"

endlocal
