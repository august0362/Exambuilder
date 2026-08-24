@echo off
setlocal
cd /d "%~dp0"
title ExamBuilder - Dong cua so nay de TAT ung dung

if not exist node_modules (
    echo [ExamBuilder] Dang cai dat goi phu thuoc lan dau, vui long doi...
    call npm install
    if errorlevel 1 (
        echo [ExamBuilder] Cai dat that bai. Kiem tra ket noi mang roi thu lai.
        pause
        exit /b 1
    )
)

set "EB_PORT=3000"
set "PORT=%EB_PORT%"

echo [ExamBuilder] Dang khoi dong may chu tren cong %EB_PORT%...
start /b "" node backend\server.js

echo [ExamBuilder] Dang cho may chu khoi dong...
timeout /t 2 /nobreak >nul

echo [ExamBuilder] Dang mo trinh duyet...
start "" "http://localhost:%EB_PORT%"

echo.
echo ==================================================
echo  ExamBuilder dang chay tai http://localhost:%EB_PORT%
echo  DONG CUA SO NAY (nut X) de TAT toan bo ung dung.
echo ==================================================
echo.

:keepalive
timeout /t 5 /nobreak >nul
goto keepalive
