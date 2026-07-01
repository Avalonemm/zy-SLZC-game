$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Running deployment readiness checks..." -ForegroundColor Cyan

npm test --workspace server
npm run typecheck
npm run build

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "render.yaml"))) {
  throw "Missing render.yaml"
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "vercel.json"))) {
  throw "Missing vercel.json"
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "client/.env.example"))) {
  throw "Missing client/.env.example"
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "server/.env.example"))) {
  throw "Missing server/.env.example"
}

Write-Host "Deployment readiness checks passed." -ForegroundColor Green
