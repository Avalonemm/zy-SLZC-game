param(
  [string]$Ffmpeg = "C:\tmp\zy-audio-tools\node_modules\ffmpeg-static\ffmpeg.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Ffmpeg)) {
  throw "FFmpeg not found at $Ffmpeg. Install ffmpeg-static in C:\tmp\zy-audio-tools first."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$reviewRoot = Join-Path $projectRoot "output\audio-review"
$directRoot = Join-Path $reviewRoot "direct-source-review-01\source-packs"
$kenneyUi = Join-Path $directRoot "kenney_interface-sounds\Audio"
$kenneyRpg = Join-Path $directRoot "kenney_rpg-audio\Audio"
$oga = Join-Path $directRoot "opengameart"
$roundOne = Join-Path $reviewRoot "round-01\original"
$revision = Join-Path $reviewRoot "round-01-revision-01\original"
$outputRoot = Join-Path $reviewRoot "direct-final-review-01"
$audioRoot = Join-Path $outputRoot "audio"
$tempRoot = Join-Path $outputRoot ".render-temp"

New-Item -ItemType Directory -Force -Path $audioRoot, $tempRoot | Out-Null

function Run-Ffmpeg {
  param([string[]]$Arguments)
  & $Ffmpeg -hide_banner -loglevel error -y @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

function Render-Single {
  param(
    [string]$InputFile,
    [string]$OutputName,
    [double]$Duration,
    [string]$Filter,
    [double]$Integrated = -22,
    [double]$TruePeak = -8
  )

  $output = Join-Path $audioRoot $OutputName
  $fadeOut = [Math]::Max(0.01, $Duration - 0.04).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $loudnormPeak = [Math]::Max(-9, $TruePeak)
  $peakAdjustment = ($TruePeak - $loudnormPeak).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $preIntegrated = ($Integrated - [double]$peakAdjustment).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$Filter,loudnorm=I=$preIntegrated`:LRA=7`:TP=$loudnormPeak,volume=${peakAdjustment}dB,afade=t=in`:st=0`:d=0.008,afade=t=out`:st=$fadeOut`:d=0.04,apad=pad_dur=$durationText,atrim=duration=$durationText"
  Run-Ffmpeg @("-i", $InputFile, "-af", $fullFilter, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", $output)
}

function Render-Mix {
  param(
    [string[]]$Inputs,
    [string]$OutputName,
    [double]$Duration,
    [string]$FilterComplex,
    [double]$Integrated = -22,
    [double]$TruePeak = -8,
    [double]$Fade = 0.04
  )

  $arguments = @()
  foreach ($inputFile in $Inputs) {
    $arguments += @("-i", $inputFile)
  }
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $loudnormPeak = [Math]::Max(-9, $TruePeak)
  $peakAdjustment = ($TruePeak - $loudnormPeak).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $preIntegrated = ($Integrated - [double]$peakAdjustment).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$FilterComplex;[mix]loudnorm=I=$preIntegrated`:LRA=7`:TP=$loudnormPeak,volume=${peakAdjustment}dB,afade=t=in`:st=0`:d=$fadeText,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText[out]"
  $arguments += @("-filter_complex", $fullFilter, "-map", "[out]", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", (Join-Path $audioRoot $OutputName))
  Run-Ffmpeg $arguments
}

function Apply-PostGain {
  param(
    [string]$OutputName,
    [double]$GainDb
  )

  $source = Join-Path $audioRoot $OutputName
  $temporary = Join-Path $tempRoot ("post-" + $OutputName)
  $gainText = $GainDb.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  Run-Ffmpeg @("-i", $source, "-af", "volume=${gainText}dB,alimiter=limit=0.398`:level=false", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", $temporary)
  Move-Item -LiteralPath $temporary -Destination $source -Force
}

$confirmation = Join-Path $kenneyUi "confirmation_002.ogg"
$bong = Join-Path $kenneyUi "bong_001.ogg"
$bookFlip1 = Join-Path $kenneyRpg "bookFlip1.ogg"
$bookFlip2 = Join-Path $kenneyRpg "bookFlip2.ogg"
$bookPlace1 = Join-Path $kenneyRpg "bookPlace1.ogg"
$bookPlace2 = Join-Path $kenneyRpg "bookPlace2.ogg"
$metalClick = Join-Path $kenneyRpg "metalClick.ogg"
$cloth2 = Join-Path $kenneyRpg "cloth2.ogg"
$dropLeather = Join-Path $kenneyRpg "dropLeather.ogg"
$drawKnife2 = Join-Path $kenneyRpg "drawKnife2.ogg"
$doorClose3 = Join-Path $kenneyRpg "doorClose_3.ogg"
$coinDrop = Join-Path $oga "coin-drop.wav"
$rockBreak = Join-Path $oga "rock-break.ogg"
$fire = Join-Path $oga "fire.wav"
$bardsTale = Join-Path $oga "loop-the-bards-tale.wav"
$crowd = Join-Path $oga "crowd-shouting.ogg"

Render-Single $confirmation "ui-confirm.wav" 0.32 "silenceremove=start_periods=1`:start_threshold=-45dB`:start_silence=0,highpass=f=100,lowpass=f=3800,atrim=duration=0.30" -24 -10
Apply-PostGain "ui-confirm.wav" 3
Render-Single $bookPlace1 "card-place.wav" 0.38 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=70,lowpass=f=3600,atrim=duration=0.34" -22 -9
Render-Single $coinDrop "coin-single.wav" 0.50 "silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,highpass=f=120,lowpass=f=4200,atrim=duration=0.47" -23 -9

Render-Mix @($confirmation, $bong) "role-call.wav" 0.74 "[0:a]silenceremove=start_periods=1`:start_threshold=-45dB`:start_silence=0,asetrate=44100*0.82,aresample=44100,lowpass=f=3000,volume=0.72[a0];[1:a]lowpass=f=2200,volume=0.15,adelay=40|40[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -23 -9
Apply-PostGain "role-call.wav" 3
Render-Mix @($bookPlace2, $doorClose3) "build-place.wav" 0.72 "[0:a]highpass=f=65,lowpass=f=3600,volume=0.88[a0];[1:a]atrim=duration=0.62,highpass=f=55,lowpass=f=2600,volume=0.24,adelay=55|55[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -22 -8

Render-Mix @((Join-Path $roundOne "amb-lobby.wav"), $crowd) "amb-lobby.wav" 20 "[0:a]atrim=duration=20,highpass=f=50,lowpass=f=6500,volume=0.82[a0];[1:a]atrim=duration=20,highpass=f=150,lowpass=f=2300,volume=0.10[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=shortest[mix]" -30 -16 0.12

Render-Single $bookFlip2 "card-draw.wav" 0.52 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,asetrate=44100*0.90,aresample=44100,highpass=f=90,lowpass=f=3400,atrim=duration=0.49" -22 -9
Apply-PostGain "card-draw.wav" 6
Render-Mix @($coinDrop, $coinDrop, $coinDrop, $coinDrop) "coin-multi.wav" 0.80 "[0:a]silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=0.27,asetrate=44100*0.93,aresample=44100,lowpass=f=3800,volume=0.46[a0];[1:a]silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=0.25,asetrate=44100*0.88,aresample=44100,lowpass=f=3500,volume=0.38,adelay=150|150[a1];[2:a]silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=0.24,asetrate=44100*0.84,aresample=44100,lowpass=f=3300,volume=0.34,adelay=330|330[a2];[3:a]silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=0.22,asetrate=44100*0.80,aresample=44100,lowpass=f=3100,volume=0.30,adelay=520|520[a3];[a0][a1][a2][a3]amix=inputs=4`:normalize=0`:duration=longest[mix]" -24 -9
Render-Single $metalClick "crown-tick.wav" 0.23 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=110,lowpass=f=2800,atrim=duration=0.20" -23 -9
Render-Single $bookFlip1 "role-reveal.wav" 0.56 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=80,lowpass=f=3400,atrim=duration=0.53" -22 -9

Render-Mix @((Join-Path $revision "assassin-mark.wav"), $cloth2, $drawKnife2) "assassin-mark.wav" 0.82 "[0:a]atrim=duration=0.82,lowpass=f=3000,volume=0.68[a0];[1:a]areverse,atrim=duration=0.38,highpass=f=80,lowpass=f=2600,volume=0.26,adelay=70|70[a1];[2:a]atrim=duration=0.24,lowpass=f=2100,volume=0.07,adelay=470|470[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -23 -8
Render-Mix @((Join-Path $revision "assassin-skip.wav"), $cloth2, $dropLeather) "assassin-skip.wav" 1.00 "[0:a]atrim=duration=1.0,lowpass=f=3000,volume=0.62[a0];[1:a]areverse,atrim=duration=0.40,lowpass=f=2500,volume=0.28,adelay=90|90[a1];[2:a]atrim=duration=0.34,lowpass=f=2200,volume=0.18,adelay=560|560[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -24 -9
Render-Mix @((Join-Path $revision "warlord-destroy.wav"), $rockBreak, $doorClose3) "warlord-destroy.wav" 0.82 "[0:a]atrim=duration=0.82,lowpass=f=3200,volume=0.55[a0];[1:a]atrim=duration=0.54,highpass=f=55,lowpass=f=3000,volume=0.62,adelay=45|45[a1];[2:a]atrim=duration=0.50,highpass=f=45,lowpass=f=1900,volume=0.16,adelay=120|120[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -21 -7

Render-Mix @($bardsTale, $fire) "amb-game.wav" 24 "[0:a]atrim=start=0`:duration=24,highpass=f=60,lowpass=f=6500,volume=0.72[a0];[1:a]atrim=start=1`:duration=24,highpass=f=90,lowpass=f=4800,volume=0.08[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=shortest[mix]" -25 -12 0.12
Render-Single $fire "amb-ready.wav" 20 "atrim=start=1`:duration=20,highpass=f=70,lowpass=f=5600" -31 -17

Get-ChildItem -LiteralPath $audioRoot -Filter "*.wav" | Sort-Object Name | Select-Object Name, Length
