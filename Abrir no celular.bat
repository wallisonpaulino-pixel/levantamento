@echo off
rem Gera a versao final e abre o servidor para testar no celular (mesmo Wi-Fi).
cd /d "%~dp0"
call npm run build
if errorlevel 1 pause & exit /b
echo.
echo No iPhone, abra no Chrome ou Safari o endereco "Network" mostrado abaixo.
echo Deixe esta janela aberta enquanto usa. Feche a janela para encerrar.
echo.
call npm run preview
pause
