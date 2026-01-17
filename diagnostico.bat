@echo off
echo === Diagnostico Caja CX ===
echo.
echo [1] Verificando Versiones
python --version
node -v
npm -v
echo.
echo [2] Verificando Carpetas
if exist "backend\venv\Scripts\activate.bat" (echo [OK] Backend Venv existe) else (echo [ERR] Backend Venv NO existe)
if exist "frontend\node_modules" (echo [OK] Frontend node_modules existe) else (echo [ERR] Frontend node_modules NO existe)
echo.
echo [3] Verificando Archivo App
if exist "backend\app.py" (echo [OK] backend\app.py existe) else (echo [ERR] backend\app.py NO existe)
echo.
echo [4] Verificando Puertos Libres
netstat -ano | findstr :5173
netstat -ano | findstr :5000
echo.
echo === Fin del Diagnostico ===
pause
