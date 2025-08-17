@echo off
echo ================================
echo Payroll Calculator Setup Script
echo ================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js from https://nodejs.org/
    echo After installation, run this script again.
    pause
    exit /b 1
) else (
    echo Node.js is installed:
    node --version
)

echo.
echo Checking npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo npm is not available. Please ensure Node.js is properly installed.
    pause
    exit /b 1
) else (
    echo npm is available:
    npm --version
)

echo.
echo Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo Failed to install dependencies. Please check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo Copying environment configuration...
if not exist .env (
    copy .env.example .env
    echo Environment file created. Please edit .env with your Google API credentials.
) else (
    echo Environment file already exists.
)

echo.
echo ================================
echo Setup Complete!
echo ================================
echo.
echo Next steps:
echo 1. Edit .env file with your Google API credentials
echo 2. Create a Google Sheet and add its ID to .env
echo 3. Run 'npm start' to start the application
echo 4. Open http://localhost:3000 in your browser
echo.
echo For detailed setup instructions, see README.md
echo.
pause
