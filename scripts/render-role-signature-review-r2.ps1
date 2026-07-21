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
$roleR1 = Join-Path $oga "role-signatures"
$roleR2 = Join-Path $oga "role-signatures-r2"
$kenneyRpg = Join-Path $sourceRoot "kenney_rpg-audio\Audio"
$woodMetal = Join-Path $oga "100-cc0-wood-metal-sfx"
$paperPack = Join-Path $oga "various-paper-sounds\WAV"
$pencilPack = Join-Path $roleR2 "pencil-sounds\flac"
$outputRoot = Join-Path $reviewRoot "role-signature-review-02"
$audioRoot = Join-Path $outputRoot "audio"

New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null

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
    [double]$Integrated = -26,
    [double]$TruePeak = -9,
    [double]$Fade = 0.24
  )

  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$Filter,loudnorm=I=$Integrated`:LRA=7`:TP=$TruePeak,afade=t=in`:st=0`:d=0.012,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText"
  Run-Ffmpeg @("-i", $InputFile, "-af", $fullFilter, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", (Join-Path $audioRoot $OutputName))
}

function Render-Mix {
  param(
    [string[]]$Inputs,
    [string]$OutputName,
    [double]$Duration,
    [string]$FilterComplex,
    [double]$Integrated = -26,
    [double]$TruePeak = -9,
    [double]$Fade = 0.22
  )

  $arguments = @()
  foreach ($inputFile in $Inputs) {
    $arguments += @("-i", $inputFile)
  }
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$FilterComplex;[mix]loudnorm=I=$Integrated`:LRA=7`:TP=$TruePeak,afade=t=in`:st=0`:d=0.012,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText[out]"
  $arguments += @("-filter_complex", $fullFilter, "-map", "[out]", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", (Join-Path $audioRoot $OutputName))
  Run-Ffmpeg $arguments
}

function Render-Blend {
  param(
    [string]$RoleId,
    [double]$Duration,
    [double]$Fade,
    [double]$Integrated = -27
  )
  Render-Mix @((Join-Path $audioRoot "$RoleId-a.wav"), (Join-Path $audioRoot "$RoleId-b.wav")) "$RoleId-c.wav" $Duration "[0:a]volume=0.62[a0];[1:a]volume=0.38,adelay=80|80[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" $Integrated -9 $Fade
}

$warHorns = Join-Path $roleR1 "war-horns.wav"
$castleFanfare = Join-Path $roleR2 "castlefanfare.ogg"
$cathedral = Join-Path $roleR1 "cathedral.wav"
$heavenlyLoop = Join-Path $oga "heavenly-loop.ogg"
$shieldPack = Join-Path $roleR2 "impact-shield-blocks"
$pencilWrite = Join-Path $pencilPack "pencil_write.flac"
$meadowThoughts = Join-Path $roleR1 "meadow-thoughts.ogg"
$styleOfHarp = Join-Path $roleR2 "style-of-harp.wav"

# King A keeps the approved war-horn direction but preserves a complete, slow decay.
Render-Single $warHorns "king-a.wav" 2.38 "atrim=start=0.241`:duration=2.36,asetpts=PTS-STARTPTS,highpass=f=80,lowpass=f=3600" -23 -9 0.48
# King B uses the full two-second castle fanfare, including its original half-second silence tail.
Render-Single $castleFanfare "king-b.wav" 2.42 "atrim=duration=2.42,highpass=f=90,lowpass=f=4100" -23 -9 0.28
# King C adds a restrained wooden crown and old-copper landing to the complete fanfare.
Render-Mix @($castleFanfare, (Join-Path $woodMetal "wood_hammer_02.ogg"), (Join-Path $woodMetal "metal_close_01.ogg")) "king-c.wav" 2.45 "[0:a]atrim=duration=2.42,highpass=f=90,lowpass=f=3900,volume=0.78[a0];[1:a]atrim=duration=0.30,asetrate=44100*0.78,aresample=44100,lowpass=f=2500,volume=0.34,adelay=1540|1540[a1];[2:a]atrim=duration=0.48,asetrate=44100*0.72,aresample=44100,lowpass=f=2100,volume=0.13,adelay=1660|1660[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -23 -9 0.30

# Bishop A makes the recorded shield block dominant and keeps the cathedral only as a distant floor.
Render-Mix @($cathedral, (Join-Path $shieldPack "impact.4.ogg")) "bishop-a.wav" 1.66 "[0:a]silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=1.62,asetrate=44100*0.82,aresample=44100,highpass=f=70,lowpass=f=1900,volume=0.13[a0];[1:a]atrim=duration=1.29,asetrate=44100*0.92,aresample=44100,highpass=f=80,lowpass=f=3400,volume=0.92,adelay=150|150[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -25 -9 0.18
# Bishop B is a different physical action: leather arm strap, broad metal body, then a low latch.
Render-Mix @((Join-Path $kenneyRpg "clothBelt2.ogg"), (Join-Path $woodMetal "metal_sheet_02.ogg"), (Join-Path $woodMetal "metal_slam_01.ogg")) "bishop-b.wav" 1.50 "[0:a]atrim=duration=0.52,asetrate=44100*0.78,aresample=44100,lowpass=f=2300,volume=0.50[a0];[1:a]atrim=duration=0.72,asetrate=44100*0.72,aresample=44100,lowpass=f=2800,volume=0.40,adelay=210|210[a1];[2:a]atrim=duration=0.64,asetrate=44100*0.68,aresample=44100,lowpass=f=2200,volume=0.54,adelay=410|410[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -25 -9 0.18
# Bishop C combines a second real shield block with a low choir and a muted closure.
Render-Mix @($heavenlyLoop, (Join-Path $shieldPack "impact.5.ogg"), (Join-Path $woodMetal "metal_close_01.ogg")) "bishop-c.wav" 1.72 "[0:a]atrim=start=0.8`:duration=1.66,asetpts=PTS-STARTPTS,asetrate=44100*0.76,aresample=44100,highpass=f=70,lowpass=f=1800,volume=0.12[a0];[1:a]atrim=duration=1.18,asetrate=44100*0.92,aresample=44100,highpass=f=80,lowpass=f=3200,volume=0.82,adelay=170|170[a1];[2:a]atrim=duration=0.48,asetrate=44100*0.64,aresample=44100,lowpass=f=1800,volume=0.18,adelay=640|640[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -26 -9 0.20

# Architect A: thin blueprint, a readable pencil stroke, then one clean wooden block placement.
Render-Mix @((Join-Path $paperPack "Paper Sound - 3.wav"), $pencilWrite, (Join-Path $woodMetal "wood_hit_08.ogg")) "architect-a.wav" 1.68 "[0:a]atrim=duration=0.76,highpass=f=80,lowpass=f=3500,volume=0.62[a0];[1:a]atrim=start=0.10`:duration=0.72,asetpts=PTS-STARTPTS,highpass=f=180,lowpass=f=4200,volume=0.42,adelay=430|430[a1];[2:a]atrim=duration=0.30,asetrate=44100*0.74,aresample=44100,lowpass=f=2400,volume=0.58,adelay=1190|1190[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -25 -9 0.17
# Architect B: heavier plan book, shorter drafting pass, and two distinct construction placements.
Render-Mix @((Join-Path $kenneyRpg "bookOpen.ogg"), $pencilWrite, (Join-Path $woodMetal "wood_hammer_01.ogg"), (Join-Path $woodMetal "wood_close_02.ogg")) "architect-b.wav" 1.72 "[0:a]atrim=duration=0.68,asetrate=44100*0.90,aresample=44100,highpass=f=70,lowpass=f=3300,volume=0.62[a0];[1:a]atrim=start=0.32`:duration=0.54,asetpts=PTS-STARTPTS,highpass=f=200,lowpass=f=3900,volume=0.35,adelay=460|460[a1];[2:a]atrim=duration=0.24,asetrate=44100*0.82,aresample=44100,lowpass=f=2300,volume=0.40,adelay=1020|1020[a2];[3:a]atrim=duration=0.30,asetrate=44100*0.74,aresample=44100,lowpass=f=2100,volume=0.38,adelay=1300|1300[a3];[a0][a1][a2][a3]amix=inputs=4`:normalize=0`:duration=longest[mix]" -25 -9 0.18
Render-Blend "architect" 1.80 0.20

# Queen A keeps the selected solo-harp source but includes a complete phrase and long natural tail.
Render-Single $meadowThoughts "queen-a.wav" 2.68 "atrim=duration=2.64,highpass=f=90,lowpass=f=4200" -24 -9 0.52
# Queen B uses a different direct-download harp recording and skips its original leading silence.
Render-Single $styleOfHarp "queen-b.wav" 2.68 "atrim=start=0.324`:duration=2.64,asetpts=PTS-STARTPTS,highpass=f=90,lowpass=f=4000" -24 -9 0.52
Render-Blend "queen" 2.82 0.54 -24

Get-ChildItem -LiteralPath $audioRoot -Filter "*.wav" | Sort-Object Name | Select-Object Name, Length
