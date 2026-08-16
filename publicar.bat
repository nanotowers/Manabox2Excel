@echo off
chcp 65001 >nul
REM ============================================================
REM  Publica la coleccion en GitHub Pages
REM  Colocar este archivo DENTRO de la carpeta ColeccionWeb
REM ============================================================
cd /d "%~dp0"

echo.
echo === Subiendo cambios a GitHub ===
echo.

git add .
git diff --cached --quiet
if %errorlevel%==0 (
    echo No hay cambios que publicar.
    goto fin
)

git commit -m "Actualizar coleccion %date% %time:~0,5%"
git push

if %errorlevel%==0 (
    echo.
    echo LISTO. En 1-2 minutos estara en:
    echo    https://nanotowers.github.io/Manabox2Excel/
) else (
    echo.
    echo ERROR al subir. Revisa el mensaje de arriba.
)

:fin
echo.
pause
