@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Iniciando Aplicacion Caja de cirugía (Modo Local)
echo ==========================================

set PROJECT_DIR=%~dp0

:: Iniciar Backend
echo [1/2] Iniciando Servidor Flask (Backend)...
echo Intentando entrar a: "%PROJECT_DIR%backend"
cd /d "%PROJECT_DIR%backend"
if exist "venv\Scripts\activate.bat" (
    echo [INFO] Entorno virtual encontrado.
    start "Backend - Caja de cirugía" cmd /k "title Backend - Caja de cirugía && call venv\Scripts\activate.bat && python app.py"
) else (
    echo [ERROR] No se encontro: %CD%\venv\Scripts\activate.bat
    pause
)

:: Iniciar Frontend
echo.
echo [2/2] Iniciando Servidor Vite (Frontend)...
cd /d "%PROJECT_DIR%frontend"
if exist "package.json" (
    echo [INFO] Proyecto frontend encontrado.
    start "Frontend - Caja de cirugía" cmd /k "title Frontend - Caja de cirugía && npm run dev -- --host 127.0.0.1"
) else (
    echo [ERROR] No se encontro: %CD%\package.json
    pause
)

echo.
echo ==========================================
echo Servidores en proceso de inicio...
echo.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo ==========================================
timeout /t 5
echo Intentando abrir el navegador...
start http://localhost:5173
pause
