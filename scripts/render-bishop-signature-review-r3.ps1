param(
  [string]$Ffmpeg = "C:\tmp\zy-audio-tools\node_modules\ffmpeg-static\ffmpeg.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Ffmpeg)) {
  throw "FFmpeg not found at $Ffmpeg."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$reviewRoot = Join-Path $projectRoot "output\audio-review"
$sourceRoot = Join-Path $reviewRoot "direct-source-review-01\source-packs"
$oga = Join-Path $sourceRoot "opengameart"
$roleR3 = Join-Path $oga "role-signatures-r3"
$roleR2 = Join-Path $oga "role-signatures-r2"
$roleR1 = Join-Path $oga "role-signatures"
$woodMetal = Join-Path $oga "100-cc0-wood-metal-sfx"
$kenneyRpg = Join-Path $sourceRoot "kenney_rpg-audio\Audio"
$outputRoot = Join-Path $reviewRoot "role-signature-review-03"
$audioRoot = Join-Path $outputRoot "audio"

New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null

function Run-Ffmpeg {
  param([string[]]$Arguments)
  & $Ffmpeg -hide_banner -loglevel error -y @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

function Render-Mix {
  param(
    [string[]]$Inputs,
    [string]$OutputName,
    [double]$Duration,
    [string]$FilterComplex,
    [double]$Integrated = -25,
    [double]$TruePeak = -9,
    [double]$Fade = 0.30
  )

  $arguments = @()
  foreach ($inputFile in $Inputs) {
    if (-not (Test-Path -LiteralPath $inputFile)) { throw "Missing source: $inputFile" }
    $arguments += @("-i", $inputFile)
  }
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$FilterComplex;[mix]loudnorm=I=$Integrated`:LRA=7`:TP=$TruePeak,afade=t=in`:st=0`:d=0.015,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText[out]"
  $arguments += @("-filter_complex", $fullFilter, "-map", "[out]", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", (Join-Path $audioRoot $OutputName))
  Run-Ffmpeg $arguments
}

$organFanfare = Join-Path $roleR3 "fanfare1.wav"
$prayerVoice = Join-Path $roleR3 "magic_words.wav"
$darkShrine = Join-Path $roleR3 "dark-shrine-loop.ogg"
$cathedral = Join-Path $roleR1 "cathedral.wav"
$shieldBlock = Join-Path $roleR2 "impact-shield-blocks\impact.5.ogg"
$woodDoor = Join-Path $kenneyRpg "doorClose_3.ogg"
$robe = Join-Path $kenneyRpg "cloth2.ogg"
$metalLatch = Join-Path $kenneyRpg "metalLatch.ogg"
$woodSeal = Join-Path $woodMetal "wood_close_01.ogg"

# A: a complete church-organ cadence first; a softened heavy church door becomes the protective close.
# The whole source phrase is time-compressed rather than cut in half, addressing the earlier "abrupt" feedback.
Render-Mix @($organFanfare, $woodDoor, $woodSeal) "bishop-a.wav" 4.18 "[0:a]atrim=duration=5.12,atempo=1.34,highpass=f=65,lowpass=f=3600,volume=0.82[a0];[1:a]atrim=duration=0.72,asetrate=44100*0.78,aresample=44100,lowpass=f=2300,volume=0.25,adelay=3350|3350[a1];[2:a]atrim=duration=0.42,asetrate=44100*0.76,aresample=44100,lowpass=f=1900,volume=0.20,adelay=3550|3550[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -24 -9 0.34

# B: a complete spoken blessing gives unmistakable clerical identity; robe and a muted shield block read as protection.
Render-Mix @($prayerVoice, $robe, $shieldBlock) "bishop-b.wav" 2.86 "[0:a]atrim=duration=2.16,highpass=f=100,lowpass=f=3900,volume=0.88[a0];[1:a]atrim=duration=0.52,asetrate=44100*0.86,aresample=44100,lowpass=f=2600,volume=0.26,adelay=120|120[a1];[2:a]atrim=duration=0.78,asetrate=44100*0.76,aresample=44100,highpass=f=80,lowpass=f=2300,volume=0.20,adelay=1900|1900[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -25 -9 0.30

# C: choral cathedral foreground with a darker sanctuary bed, ending in a quiet ceremonial latch instead of combat metal.
Render-Mix @($cathedral, $darkShrine, $metalLatch) "bishop-c.wav" 3.34 "[0:a]atrim=duration=3.18,highpass=f=65,lowpass=f=3300,volume=0.62[a0];[1:a]atrim=start=1.4`:duration=3.12,asetpts=PTS-STARTPTS,highpass=f=55,lowpass=f=1700,volume=0.34[a1];[2:a]atrim=duration=0.58,asetrate=44100*0.70,aresample=44100,lowpass=f=2100,volume=0.18,adelay=2570|2570[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -25 -9 0.38

Get-ChildItem -LiteralPath $audioRoot -Filter "bishop-*.wav" |
  Sort-Object Name |
  Select-Object Name, Length
