# Math Learning Platform Backend - Start Script
Write-Host "Starting Math Learning Platform Backend..." -ForegroundColor Green
Write-Host ""

Set-Location $PSScriptRoot

if (-not (Test-Path "venv")) {
    Write-Host "Error: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Please create it first with: python -m venv venv" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Activating virtual environment..." -ForegroundColor Cyan
& ".\venv\Scripts\Activate.ps1"

Write-Host "Starting FastAPI server..." -ForegroundColor Cyan
Write-Host "Backend will be available at: http://localhost:8000" -ForegroundColor Yellow
Write-Host "API documentation at: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
