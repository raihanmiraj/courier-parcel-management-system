@echo off
setlocal
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%server"

if not exist "node_modules" (
	echo Installing server dependencies...
	call npm install
)

echo Starting server (npm run dev)...
call npm run dev
