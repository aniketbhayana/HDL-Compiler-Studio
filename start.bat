@echo off
title HDL Compiler Studio - Server Launcher
color 0b

echo ============================================================
echo   HDL COMPILER STUDIO - COMPILER DESIGN LAB (REVIEW 1)
echo ============================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js was not found in PATH!
    echo Please install Node.js from https://nodejs.org or add it to PATH.
    pause
    exit /b 1
)

:: Check if hdl_lexer.exe exists; if not, try to compile from lex.yy.c
if not exist "%~dp0hdl_lexer.exe" (
    echo [*] hdl_lexer.exe not found. Compiling from lex.yy.c using gcc...
    where gcc >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        gcc "%~dp0lex.yy.c" -o "%~dp0hdl_lexer.exe"
        if exist "%~dp0hdl_lexer.exe" (
            echo [OK] Compiled hdl_lexer.exe successfully!
        ) else (
            echo [WARNING] Compilation failed. Continuing anyway...
        )
    ) else (
        echo [WARNING] gcc not found in PATH.
    )
) else (
    echo [OK] Found compiled C binary: hdl_lexer.exe
)

echo.
echo [*] Starting web server on http://localhost:3000 ...
echo [*] Opening browser...
start http://localhost:3000

node "%~dp0server.js"

pause
