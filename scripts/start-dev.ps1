$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$processes = @()

function Stop-ChildProcessTree {
  param([int]$ProcessId)

  if ($ProcessId -le 0) {
    return
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }

  Write-Host "Stopping process tree PID $ProcessId..." -ForegroundColor Yellow
  & taskkill.exe /PID $ProcessId /T /F | Out-Null
}

function Stop-DevServers {
  foreach ($process in $script:processes) {
    Stop-ChildProcessTree -ProcessId $process.Id
  }
}

function Stop-ExistingProjectDevServers {
  $currentProcessId = $PID
  $ports = @(3000, 4000, 5173, 5174, 5175, 5176, 5177, 5178, 5179)

  $portProcessIds = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($portProcessId in $portProcessIds) {
    if ($portProcessId -and $portProcessId -ne $currentProcessId) {
      $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $portProcessId" -ErrorAction SilentlyContinue
      if ($processInfo -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($projectRoot)) {
        Stop-ChildProcessTree -ProcessId $portProcessId
      }
    }
  }

  $devProcessIds = Get-CimInstance Win32_Process |
    Where-Object {
      $_.ProcessId -ne $currentProcessId -and
      $_.CommandLine -and
      $_.CommandLine.Contains($projectRoot) -and
      (
        $_.CommandLine -like "*vite*" -or
        $_.CommandLine -like "*tsx*" -or
        $_.CommandLine -like "*concurrently*" -or
        $_.CommandLine -like "*src/index.ts*"
      )
    } |
    Select-Object -ExpandProperty ProcessId -Unique

  foreach ($devProcessId in $devProcessIds) {
    Stop-ChildProcessTree -ProcessId $devProcessId
  }
}

[Console]::add_CancelKeyPress({
  param($sender, $eventArgs)
  $eventArgs.Cancel = $true
  Write-Host ""
  Write-Host "Shutdown requested. Closing frontend and backend..." -ForegroundColor Yellow
  Stop-DevServers
  exit 0
})

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
  foreach ($process in $script:processes) {
    if ($process -and -not $process.HasExited) {
      & taskkill.exe /PID $process.Id /T /F | Out-Null
    }
  }
} | Out-Null

Write-Host ""
Write-Host "Starting Web board game prototype..." -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host ""

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm was not found. Please install Node.js first: https://nodejs.org/" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
  Write-Host "Dependencies are missing. Running npm install..." -ForegroundColor Yellow
  npm install
}

Write-Host "Checking for stale project dev servers..." -ForegroundColor Yellow
Stop-ExistingProjectDevServers

Write-Host ""
Write-Host "Frontend will open at: http://localhost:5173" -ForegroundColor Green
Write-Host "Backend will run at:   http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C in this window to stop both services." -ForegroundColor Yellow
Write-Host ""

try {
  $server = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:server") -WorkingDirectory $projectRoot -PassThru -NoNewWindow
  $client = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:client") -WorkingDirectory $projectRoot -PassThru -NoNewWindow
  $script:processes = @($server, $client)

  Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-Command",
    "Start-Sleep -Seconds 5; Start-Process 'http://localhost:5173'"
  )

  while ($true) {
    Start-Sleep -Seconds 1
    foreach ($process in $script:processes) {
      if ($process.HasExited) {
        Write-Host "A dev server exited. Shutting down the rest..." -ForegroundColor Yellow
        return
      }
    }
  }
}
finally {
  Stop-DevServers
}
