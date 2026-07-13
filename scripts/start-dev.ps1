$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$processes = @()
$frontendUrl = "http://localhost:5173"
$backendHealthUrl = "http://localhost:3000/health"
$launcherMutexName = "Local\ZYBoardGameDevLauncher"

function Test-HttpEndpoint {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  }
  catch {
    return $false
  }
}

function Test-DevServersReady {
  return (Test-HttpEndpoint -Url $script:frontendUrl) -and
    (Test-HttpEndpoint -Url $script:backendHealthUrl)
}

function Wait-ForDevServers {
  param([int]$TimeoutSeconds = 45)

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-DevServersReady) {
      return $true
    }
    Start-Sleep -Milliseconds 300
  }

  return $false
}

function Open-GamePage {
  Start-Process -FilePath $script:frontendUrl
}

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

function Start-DevEnvironment {
  Write-Host ""
  Write-Host "Starting Web board game prototype..." -ForegroundColor Cyan
  Write-Host "Project: $projectRoot"
  Write-Host ""

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm was not found. Please install Node.js first: https://nodejs.org/" -ForegroundColor Red
    throw "npm was not found."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Write-Host "Dependencies are missing. Running npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE."
    }
  }

  Write-Host "Checking for stale project dev servers..." -ForegroundColor Yellow
  Stop-ExistingProjectDevServers

  Write-Host ""
  Write-Host "Frontend will open at: $frontendUrl" -ForegroundColor Green
  Write-Host "Backend will run at:   http://localhost:3000" -ForegroundColor Green
  Write-Host "Press Ctrl+C in this window to stop both services." -ForegroundColor Yellow
  Write-Host "Double-click the launcher again to reopen the game page." -ForegroundColor Yellow
  Write-Host ""

  try {
    $server = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:server") -WorkingDirectory $projectRoot -PassThru -NoNewWindow
    $client = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:client") -WorkingDirectory $projectRoot -PassThru -NoNewWindow
    $script:processes = @($server, $client)

    if (Wait-ForDevServers) {
      Open-GamePage
    }
    else {
      Write-Host "Services are still starting. Open $frontendUrl manually when ready." -ForegroundColor Yellow
    }

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
}

$launcherMutex = [System.Threading.Mutex]::new($false, $launcherMutexName)
$ownsLauncherMutex = $false

try {
  try {
    $ownsLauncherMutex = $launcherMutex.WaitOne(0, $false)
  }
  catch [System.Threading.AbandonedMutexException] {
    $ownsLauncherMutex = $true
  }

  if (-not $ownsLauncherMutex) {
    if (Test-DevServersReady) {
      Write-Host "The game is already running. Reopening $frontendUrl..." -ForegroundColor Green
      Open-GamePage
    }
    else {
      Write-Host "The game is already starting. Its page will open automatically when ready." -ForegroundColor Yellow
    }
    exit 0
  }

  Start-DevEnvironment
}
finally {
  if ($ownsLauncherMutex) {
    $launcherMutex.ReleaseMutex()
  }
  $launcherMutex.Dispose()
}
