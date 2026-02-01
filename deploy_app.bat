@echo off
echo ===========================================
echo   DESPLEGANDO CAJA DE CIRUGIA A PRODUCCION
echo ===========================================
echo.

cd frontend

echo [1/2] Generando paquete de produccion...
call npm run build

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] La compilacion fallo. No se subira nada.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Subiendo a https://cajacx.web.app...
call npx firebase deploy --only hosting:live

echo.
echo ===========================================
echo   PROCESO TERMINADO CON EXITO (OFICIAL)
echo ===========================================
echo.
echo URL: https://cajacx.web.app
echo.
pause
