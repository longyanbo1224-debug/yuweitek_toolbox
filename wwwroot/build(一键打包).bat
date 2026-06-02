@echo off
cd /d "%~dp0"
python build_all.py
if errorlevel 1 pause
