@echo off
echo ===========================================
echo   CREANDO LINK DE VISTA PREVIA (TEST)
echo ===========================================
echo.

cd frontend

echo [1/2] Generando paquete de previsualizacion...
call npm run build

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] La compilacion fallo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Subiendo a https://cajacxtest.web.app...
call npx firebase deploy --only hosting:test

echo.
echo ===========================================
echo   VERSION DE PRUEBA SUBIDA CON EXITO
echo ===========================================
echo.
echo URL: https://cajacxtest.web.app
echo.
pause
