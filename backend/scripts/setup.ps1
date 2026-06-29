# NoCut.ng — Local database setup script
# Run from the backend/ directory: .\scripts\setup.ps1

$PG_BIN  = "C:\Program Files\PostgreSQL\18\bin"
$DB_NAME = "nocut_dev"
$DB_USER = "postgres"

# Read password from .env if it exists
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match "^DB_PASSWORD=(.+)") {
            $env:PGPASSWORD = $Matches[1]
        }
    }
}

if (-not $env:PGPASSWORD) {
    $env:PGPASSWORD = Read-Host "Enter PostgreSQL password for user '$DB_USER'"
}

Write-Host "`n=== NoCut.ng Local DB Setup ===" -ForegroundColor Cyan

# 1. Create database (ignore error if already exists)
Write-Host "`n[1/2] Creating database '$DB_NAME'..." -ForegroundColor Yellow
$result = & "$PG_BIN\createdb" -U $DB_USER $DB_NAME 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "      Created." -ForegroundColor Green
} else {
    Write-Host "      Already exists (or: $result)" -ForegroundColor Gray
}

# 2. Run migrations via ts-node
Write-Host "`n[2/2] Running SQL migrations..." -ForegroundColor Yellow
$backendDir = Join-Path $PSScriptRoot ".."
Set-Location $backendDir
npx ts-node scripts/migrate.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSetup complete! Start the server with: npm run dev" -ForegroundColor Green
} else {
    Write-Host "`nSetup failed. Check errors above." -ForegroundColor Red
    exit 1
}
