param(
  [string]$Ffmpeg = "C:\tmp\zy-audio-tools\node_modules\ffmpeg-static\ffmpeg.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Ffmpeg)) {
  throw "FFmpeg not found at $Ffmpeg. Install ffmpeg-static in C:\tmp\zy-audio-tools first."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$reviewRoot = Join-Path $projectRoot "output\audio-review"
$sourceRoot = Join-Path $reviewRoot "direct-source-review-01\source-packs"
$oga = Join-Path $sourceRoot "opengameart"
$roleSources = Join-Path $oga "role-signatures"
$kenneyUi = Join-Path $sourceRoot "kenney_interface-sounds\Audio"
$kenneyRpg = Join-Path $sourceRoot "kenney_rpg-audio\Audio"
$woodMetal = Join-Path $oga "100-cc0-wood-metal-sfx"
$paperPack = Join-Path $oga "various-paper-sounds\WAV"
$coinPack = Join-Path $oga "coin-sounds-enci23\CoinSounds"
$uiPack = Join-Path $roleSources "ui-sound-effects-wav\ui_wav"
$outputRoot = Join-Path $reviewRoot "role-signature-review-01"
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
    [double]$Integrated = -24,
    [double]$TruePeak = -9,
    [double]$Fade = 0.04
  )

  $output = Join-Path $audioRoot $OutputName
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$Filter,loudnorm=I=$Integrated`:LRA=7`:TP=$TruePeak,afade=t=in`:st=0`:d=0.008,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText"
  Run-Ffmpeg @("-i", $InputFile, "-af", $fullFilter, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", $output)
}

function Render-Mix {
  param(
    [string[]]$Inputs,
    [string]$OutputName,
    [double]$Duration,
    [string]$FilterComplex,
    [double]$Integrated = -24,
    [double]$TruePeak = -9,
    [double]$Fade = 0.04
  )

  $arguments = @()
  foreach ($inputFile in $Inputs) {
    $arguments += @("-i", $inputFile)
  }
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$FilterComplex;[mix]loudnorm=I=$Integrated`:LRA=7`:TP=$TruePeak,afade=t=in`:st=0`:d=0.008,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText[out]"
  $arguments += @("-filter_complex", $fullFilter, "-map", "[out]", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", (Join-Path $audioRoot $OutputName))
  Run-Ffmpeg $arguments
}

function Render-CandidateBlend {
  param(
    [string]$RoleId,
    [double]$Duration
  )

  $a = Join-Path $audioRoot "$RoleId-a.wav"
  $b = Join-Path $audioRoot "$RoleId-b.wav"
  Render-Mix @($a, $b) "$RoleId-c.wav" $Duration "[0:a]volume=0.58[a0];[1:a]volume=0.42,adelay=55|55[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -25 -9
}

$coinSyncopika = Join-Path $oga "coin-sounds-syncopika.wav"
$cathedral = Join-Path $roleSources "cathedral.wav"
$healthRestore = Join-Path $roleSources "health-restore.wav"
$meadowThoughts = Join-Path $roleSources "meadow-thoughts.ogg"
$warHorns = Join-Path $roleSources "war-horns.wav"
$heavenlyLoop = Join-Path $oga "heavenly-loop.ogg"

# Thief: A is a handled pouch with loose coins; B is a dropped leather pouch with a longer real coin scrape.
Render-Mix @((Join-Path $kenneyRpg "handleSmallLeather.ogg"), (Join-Path $kenneyRpg "handleCoins2.ogg")) "thief-a.wav" 0.92 "[0:a]atrim=duration=0.52,asetrate=44100*0.84,aresample=44100,lowpass=f=3200,volume=0.70[a0];[1:a]atrim=duration=0.64,asetrate=44100*0.78,aresample=44100,lowpass=f=3900,volume=0.40,adelay=180|180[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -24 -9
Render-Mix @((Join-Path $kenneyRpg "dropLeather.ogg"), $coinSyncopika) "thief-b.wav" 0.92 "[0:a]atrim=duration=0.50,asetrate=44100*0.76,aresample=44100,lowpass=f=2600,volume=0.66[a0];[1:a]atrim=start=9.52`:duration=0.70,asetpts=PTS-STARTPTS,asetrate=44100*0.78,aresample=44100,lowpass=f=3600,volume=0.30,adelay=190|190[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -24 -9
Render-CandidateBlend "thief" 0.98

# Magician: A reverses a map-like paper movement with muted glass; B reverses a book page and adds a broad air/chime tail.
Render-Mix @((Join-Path $paperPack "Paper Sound - 4.wav"), (Join-Path $kenneyUi "glass_004.ogg")) "magician-a.wav" 1.04 "[0:a]atrim=duration=0.62,areverse,highpass=f=90,lowpass=f=3600,volume=0.70[a0];[1:a]atrim=duration=0.68,asetrate=44100*0.62,aresample=44100,highpass=f=180,lowpass=f=3000,volume=0.16,adelay=270|270[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -25 -9
Render-Mix @((Join-Path $kenneyRpg "bookFlip3.ogg"), (Join-Path $uiPack "chimes.wav")) "magician-b.wav" 1.04 "[0:a]atrim=duration=0.58,areverse,asetrate=44100*0.88,aresample=44100,highpass=f=80,lowpass=f=3200,volume=0.72[a0];[1:a]atrim=start=0.18`:duration=0.74,asetrate=44100*0.72,aresample=44100,highpass=f=160,lowpass=f=2800,volume=0.13,adelay=240|240[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -25 -9
Render-CandidateBlend "magician" 1.10

# King: A uses the first recorded war-horn entrance and an old-copper closure; B is a much shorter rounded brass cue with a wooden crown touch.
Render-Mix @($warHorns, (Join-Path $woodMetal "metal_close_01.ogg")) "king-a.wav" 1.18 "[0:a]silenceremove=start_periods=1`:start_threshold=-42dB`:start_silence=0,atrim=duration=1.12,highpass=f=90,lowpass=f=3200,volume=0.58[a0];[1:a]atrim=duration=0.54,asetrate=44100*0.68,aresample=44100,lowpass=f=2400,volume=0.28,adelay=40|40[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -24 -8
Render-Mix @((Join-Path $uiPack "dum.wav"), (Join-Path $woodMetal "wood_hammer_02.ogg"), (Join-Path $woodMetal "metal_hit_04.ogg")) "king-b.wav" 0.94 "[0:a]atrim=duration=0.36,asetrate=44100*0.72,aresample=44100,lowpass=f=2600,volume=0.92[a0];[1:a]atrim=duration=0.24,asetrate=44100*0.78,aresample=44100,lowpass=f=2300,volume=0.48,adelay=30|30[a1];[2:a]atrim=duration=0.42,asetrate=44100*0.66,aresample=44100,lowpass=f=2100,volume=0.18,adelay=220|220[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -24 -8
Render-CandidateBlend "king" 1.18

# Bishop: A is a real cathedral chord with a metal shield closure; B is a softer sacred pad with a leather-and-latch closure.
Render-Mix @($cathedral, (Join-Path $woodMetal "metal_close_01.ogg")) "bishop-a.wav" 1.20 "[0:a]silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=1.16,asetrate=44100*0.74,aresample=44100,highpass=f=70,lowpass=f=2400,volume=0.56[a0];[1:a]atrim=duration=0.48,asetrate=44100*0.60,aresample=44100,lowpass=f=1800,volume=0.30,adelay=520|520[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -26 -9
Render-Mix @($heavenlyLoop, (Join-Path $kenneyRpg "clothBelt.ogg"), (Join-Path $kenneyRpg "metalLatch.ogg")) "bishop-b.wav" 1.20 "[0:a]atrim=start=0.8`:duration=1.16,asetpts=PTS-STARTPTS,asetrate=44100*0.72,aresample=44100,highpass=f=70,lowpass=f=2200,volume=0.48[a0];[1:a]atrim=duration=0.42,asetrate=44100*0.74,aresample=44100,lowpass=f=2000,volume=0.30,adelay=440|440[a1];[2:a]atrim=duration=0.36,asetrate=44100*0.68,aresample=44100,lowpass=f=1800,volume=0.18,adelay=620|620[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -26 -9
Render-CandidateBlend "bishop" 1.24

# Merchant: A uses handled coins and three measured wooden abacus taps; B uses independent coin recordings and a looser four-bead run.
Render-Mix @((Join-Path $kenneyRpg "handleCoins.ogg"), (Join-Path $woodMetal "wood_hit_02.ogg"), (Join-Path $woodMetal "wood_hit_05.ogg"), (Join-Path $woodMetal "wood_hit_08.ogg")) "merchant-a.wav" 1.02 "[0:a]atrim=duration=0.76,asetrate=44100*0.82,aresample=44100,lowpass=f=3900,volume=0.48[a0];[1:a]atrim=duration=0.18,asetrate=44100*1.10,aresample=44100,lowpass=f=3300,volume=0.38,adelay=40|40[a1];[2:a]atrim=duration=0.18,asetrate=44100*0.98,aresample=44100,lowpass=f=3100,volume=0.34,adelay=210|210[a2];[3:a]atrim=duration=0.18,asetrate=44100*0.90,aresample=44100,lowpass=f=2900,volume=0.30,adelay=390|390[a3];[a0][a1][a2][a3]amix=inputs=4`:normalize=0`:duration=longest[mix]" -24 -9
Render-Mix @((Join-Path $coinPack "Coin3.mp3"), (Join-Path $coinPack "Coin8.mp3"), (Join-Path $woodMetal "wood_misc_03.ogg"), (Join-Path $woodMetal "wood_misc_06.ogg")) "merchant-b.wav" 1.02 "[0:a]atrim=duration=0.34,asetrate=44100*0.78,aresample=44100,lowpass=f=3800,volume=0.46[a0];[1:a]atrim=duration=0.34,asetrate=44100*0.72,aresample=44100,lowpass=f=3500,volume=0.38,adelay=260|260[a1];[2:a]atrim=duration=0.18,asetrate=44100*1.04,aresample=44100,lowpass=f=3200,volume=0.34,adelay=80|80[a2];[3:a]atrim=duration=0.18,asetrate=44100*0.88,aresample=44100,lowpass=f=2900,volume=0.30,adelay=470|470[a3];[a0][a1][a2][a3]amix=inputs=4`:normalize=0`:duration=longest[mix]" -24 -9
Render-CandidateBlend "merchant" 1.08

# Architect: A unfolds a real paper map before a clean block placement; B opens a heavier book/plan and closes with two wooden construction taps.
Render-Mix @((Join-Path $paperPack "Paper Sound - 3.wav"), (Join-Path $woodMetal "wood_hit_08.ogg")) "architect-a.wav" 0.98 "[0:a]atrim=duration=0.68,highpass=f=80,lowpass=f=3600,volume=0.66[a0];[1:a]atrim=duration=0.28,asetrate=44100*0.74,aresample=44100,lowpass=f=2400,volume=0.52,adelay=470|470[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -24 -9
Render-Mix @((Join-Path $kenneyRpg "bookOpen.ogg"), (Join-Path $woodMetal "wood_hammer_01.ogg"), (Join-Path $woodMetal "wood_close_02.ogg")) "architect-b.wav" 0.98 "[0:a]atrim=duration=0.66,asetrate=44100*0.88,aresample=44100,highpass=f=70,lowpass=f=3300,volume=0.62[a0];[1:a]atrim=duration=0.22,asetrate=44100*0.82,aresample=44100,lowpass=f=2300,volume=0.40,adelay=390|390[a1];[2:a]atrim=duration=0.28,asetrate=44100*0.76,aresample=44100,lowpass=f=2100,volume=0.34,adelay=590|590[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -24 -9
Render-CandidateBlend "architect" 1.04

# Queen: A takes a restrained dyad from a solo-harp CC0 recording; B is a separate harp-like healing recording with the bright chime tail removed.
Render-Single $meadowThoughts "queen-a.wav" 1.22 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,atrim=duration=1.18,asetrate=44100*0.84,aresample=44100,highpass=f=100,lowpass=f=3800" -26 -9
Render-Single $healthRestore "queen-b.wav" 1.22 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,atrim=duration=1.18,asetrate=48000*0.84,aresample=44100,highpass=f=110,lowpass=f=3400" -26 -9
Render-CandidateBlend "queen" 1.26

Get-ChildItem -LiteralPath $audioRoot -Filter "*.wav" | Sort-Object Name | Select-Object Name, Length
