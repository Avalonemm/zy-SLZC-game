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
$oga = Join-Path $directRoot "opengameart"
$kenneyUi = Join-Path $directRoot "kenney_interface-sounds\Audio"
$kenneyRpg = Join-Path $directRoot "kenney_rpg-audio\Audio"
$woodMetal = Join-Path $oga "100-cc0-wood-metal-sfx"
$paperPack = Join-Path $oga "various-paper-sounds\WAV"
$coinPack = Join-Path $oga "coin-sounds-enci23\CoinSounds"
$bellPack = Join-Path $oga "bell-dings"
$oldSources = Join-Path $reviewRoot "round-01-revision-01\sources"
$oldOriginal = Join-Path $reviewRoot "round-01-revision-01\original"
$roundOneOriginal = Join-Path $reviewRoot "round-01\original"
$d2Audio = Join-Path $reviewRoot "direct-final-review-01\audio"
$outputRoot = Join-Path $reviewRoot "direct-multi-review-01"
$audioRoot = Join-Path $outputRoot "audio"
$referenceRoot = Join-Path $outputRoot "reference"

New-Item -ItemType Directory -Force -Path $audioRoot, $referenceRoot | Out-Null

function Run-Ffmpeg {
  param([string[]]$Arguments)
  & $Ffmpeg -hide_banner -loglevel error -y @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

function Resolve-OutputPath {
  param([string]$RelativePath)
  $path = Join-Path $outputRoot $RelativePath
  $parent = Split-Path -Parent $path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  return $path
}

function Render-Single {
  param(
    [string]$InputFile,
    [string]$RelativeOutput,
    [double]$Duration,
    [string]$Filter,
    [double]$Integrated = -23,
    [double]$TruePeak = -9,
    [double]$Fade = 0.04
  )

  $output = Resolve-OutputPath $RelativeOutput
  $durationText = $Duration.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeText = $Fade.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fadeOut = [Math]::Max(0.01, $Duration - $Fade).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $loudnormPeak = [Math]::Max(-9, $TruePeak)
  $peakAdjustment = ($TruePeak - $loudnormPeak).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $preIntegrated = ($Integrated - [double]$peakAdjustment).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$Filter,loudnorm=I=$preIntegrated`:LRA=7`:TP=$loudnormPeak,volume=${peakAdjustment}dB,afade=t=in`:st=0`:d=0.008,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText"
  Run-Ffmpeg @("-i", $InputFile, "-af", $fullFilter, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", $output)
}

function Render-Mix {
  param(
    [string[]]$Inputs,
    [string]$RelativeOutput,
    [double]$Duration,
    [string]$FilterComplex,
    [double]$Integrated = -23,
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
  $loudnormPeak = [Math]::Max(-9, $TruePeak)
  $peakAdjustment = ($TruePeak - $loudnormPeak).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $preIntegrated = ($Integrated - [double]$peakAdjustment).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $fullFilter = "$FilterComplex;[mix]loudnorm=I=$preIntegrated`:LRA=7`:TP=$loudnormPeak,volume=${peakAdjustment}dB,afade=t=in`:st=0`:d=$fadeText,afade=t=out`:st=$fadeOut`:d=$fadeText,apad=pad_dur=$durationText,atrim=duration=$durationText[out]"
  $arguments += @("-filter_complex", $fullFilter, "-map", "[out]", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", (Resolve-OutputPath $RelativeOutput))
  Run-Ffmpeg $arguments
}

function Apply-PostGain {
  param(
    [string]$RelativeOutput,
    [double]$GainDb,
    [double]$Limit = 0.35
  )

  $source = Join-Path $outputRoot $RelativeOutput
  $temporary = "$source.post.wav"
  $gainText = $GainDb.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  $limitText = $Limit.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  Run-Ffmpeg @("-i", $source, "-af", "volume=${gainText}dB,alimiter=limit=$limitText`:level=false", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", $temporary)
  Move-Item -LiteralPath $temporary -Destination $source -Force
}

$oldWood = Join-Path $oldSources "wood-click.mp3"
$oldPaper = Join-Path $oldSources "paper-rustle.mp3"
$oldCoin = Join-Path $oldSources "coin-single.mp3"
$oldBell = Join-Path $oldSources "metal-bell.mp3"
$oldRocks = Join-Path $oldSources "rocks.mp3"
$oldCity = Join-Path $oldSources "city-bells.mp3"
$oldFire = Join-Path $oldSources "fireplace-jmehlferber.mp3"
$oldLute = Join-Path $oldSources "medieval-lute-chords.mp3"
$oldSword = Join-Path $oldSources "sword-slash.mp3"

# Historical references recreate the character of the previously approved R1 choices.
# They are comparison-only and are never formal-source candidates.
Render-Single $oldWood "reference/ui-confirm-reference.wav" 0.30 "atrim=start=0`:duration=0.18,asetrate=44100*0.86,aresample=44100,lowpass=f=5200" -22 -9
Render-Mix @($oldPaper, $oldWood) "reference/card-place-reference.wav" 0.62 "[0:a]atrim=start=0.08`:duration=0.46,asetrate=44100*1.10,aresample=44100,highpass=f=240,volume=0.62[a0];[1:a]atrim=duration=0.16,asetrate=44100*0.72,aresample=44100,lowpass=f=2800,volume=0.42,adelay=220|220[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -22 -9
Render-Single $oldCoin "reference/coin-single-reference.wav" 0.82 "atrim=duration=0.82,asetrate=44100*0.96,aresample=44100,highpass=f=300" -22 -9
Render-Mix @($oldWood, $oldBell) "reference/role-call-reference.wav" 0.78 "[0:a]atrim=duration=0.18,asetrate=44100*0.66,aresample=44100,lowpass=f=3200,volume=0.80[a0];[1:a]atrim=duration=0.55,asetrate=44100*1.34,aresample=44100,highpass=f=520,volume=0.26,adelay=120|120[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -22 -9
Render-Mix @($oldRocks, $oldWood) "reference/build-place-reference.wav" 0.82 "[0:a]atrim=duration=0.78,asetrate=44100*1.42,aresample=44100,lowpass=f=3800,volume=0.34[a0];[1:a]atrim=duration=0.20,asetrate=44100*0.58,aresample=44100,lowpass=f=2400,volume=0.55,adelay=80|80[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -22 -8
Render-Single $oldCity "reference/amb-lobby-reference.wav" 20 "atrim=start=2.5`:duration=20,asetrate=44100*0.96,aresample=44100,highpass=f=90,lowpass=f=6500" -29 -15 0.12
Render-Single $oldPaper "reference/card-draw-reference.wav" 0.52 "atrim=start=0.12`:duration=0.48,asetrate=44100*0.82,aresample=44100,highpass=f=90,lowpass=f=3400" -23 -9
Render-Mix @($oldCoin, $oldCoin, $oldCoin, $oldCoin) "reference/coin-multi-reference.wav" 0.82 "[0:a]atrim=duration=0.50,asetrate=44100*0.78,aresample=44100,lowpass=f=4200,volume=0.32[a0];[1:a]atrim=duration=0.46,asetrate=44100*0.84,aresample=44100,lowpass=f=4200,volume=0.28,adelay=130|130[a1];[2:a]atrim=duration=0.42,asetrate=44100*0.72,aresample=44100,lowpass=f=3900,volume=0.24,adelay=290|290[a2];[3:a]atrim=duration=0.36,asetrate=44100*0.88,aresample=44100,lowpass=f=4000,volume=0.20,adelay=440|440[a3];[a0][a1][a2][a3]amix=inputs=4`:normalize=0`:duration=longest[mix]" -23 -9
Render-Single $oldWood "reference/crown-tick-reference.wav" 0.23 "atrim=start=0.02`:duration=0.18,asetrate=44100*0.72,aresample=44100,lowpass=f=2600" -23 -9
Render-Single $oldPaper "reference/role-reveal-reference.wav" 0.56 "atrim=start=0.10`:duration=0.50,asetrate=44100*0.90,aresample=44100,highpass=f=100,lowpass=f=3400" -23 -9
Render-Mix @((Join-Path $oldOriginal "assassin-mark.wav"), $oldSword) "reference/assassin-mark-reference.wav" 0.82 "[0:a]atrim=duration=0.82,volume=0.72[a0];[1:a]atrim=duration=0.62,asetrate=44100*0.52,aresample=44100,lowpass=f=1700,volume=0.16[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -23 -8
Render-Single $oldSword "reference/assassin-skip-reference.wav" 0.90 "atrim=duration=0.75,asetrate=44100*0.48,aresample=44100,lowpass=f=1600" -24 -9
Render-Mix @((Join-Path $oldOriginal "warlord-destroy.wav"), $oldRocks) "reference/warlord-destroy-reference.wav" 0.86 "[0:a]atrim=duration=0.82,volume=0.72[a0];[1:a]atrim=duration=0.78,asetrate=44100*0.88,aresample=44100,highpass=f=60,lowpass=f=3200,volume=0.42[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -21 -7
Render-Mix @($oldFire, $oldLute) "reference/amb-game-reference.wav" 24 "[0:a]atrim=start=12`:duration=24,asetrate=44100*0.78,aresample=44100,highpass=f=70,lowpass=f=1700,volume=0.14[a0];[1:a]atrim=duration=14.4,asetrate=44100*0.56,aresample=44100,highpass=f=80,lowpass=f=3800,volume=0.22[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -27 -13 0.12
Render-Single $oldFire "reference/amb-ready-reference.wav" 20 "atrim=start=4`:duration=20,asetrate=44100*0.92,aresample=44100,highpass=f=100,lowpass=f=5200" -31 -17 0.12

$paper1 = Join-Path $paperPack "Paper Sound - 1.wav"
$paper2 = Join-Path $paperPack "Paper Sound - 2.wav"
$paper3 = Join-Path $paperPack "Paper Sound - 3.wav"
$paper4 = Join-Path $paperPack "Paper Sound - 4.wav"
$coinSyncopika = Join-Path $oga "coin-sounds-syncopika.wav"
$rockBreak = Join-Path $oga "rock-break.ogg"
$fire = Join-Path $oga "fire.wav"
$smallFire = Join-Path $oga "a-small-fire-will-do.wav"
$crowd = Join-Path $oga "crowd-shouting.ogg"
$bardsTale = Join-Path $oga "loop-the-bards-tale.wav"
$oldTower = Join-Path $oga "loop-old-tower-inn.wav"

# A and B deliberately use different source recordings or material families.
Render-Single (Join-Path $woodMetal "wood_hammer_02.ogg") "audio/ui-confirm-a.wav" 0.30 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,lowpass=f=3400,atrim=duration=0.27" -23 -9
Render-Single (Join-Path $kenneyUi "confirmation_004.ogg") "audio/ui-confirm-b.wav" 0.34 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=120,lowpass=f=4300,atrim=duration=0.31" -24 -9

Render-Single $paper2 "audio/card-place-a.wav" 0.52 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=100,lowpass=f=4200,atrim=duration=0.48" -24 -9
Render-Single (Join-Path $kenneyRpg "bookPlace3.ogg") "audio/card-place-b.wav" 0.42 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=70,lowpass=f=3600,atrim=duration=0.38" -23 -9

Render-Single (Join-Path $coinPack "Coin5.mp3") "audio/coin-single-a.wav" 0.42 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=180,lowpass=f=5200,atrim=duration=0.38" -24 -9
Apply-PostGain "audio/coin-single-a.wav" 8
Render-Single $coinSyncopika "audio/coin-single-b.wav" 0.58 "atrim=start=9.56`:duration=0.56,asetpts=PTS-STARTPTS,highpass=f=160,lowpass=f=4700" -24 -9

Render-Mix @((Join-Path $woodMetal "wood_hammer_01.ogg"), (Join-Path $bellPack "bell-ding-2.wav")) "audio/role-call-a.wav" 0.82 "[0:a]silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,asetrate=44100*0.82,aresample=44100,lowpass=f=3000,volume=0.82[a0];[1:a]atrim=duration=0.62,asetrate=44100*0.92,aresample=44100,highpass=f=380,lowpass=f=4200,volume=0.18,adelay=120|120[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -23 -9
Apply-PostGain "audio/role-call-a.wav" 4
Render-Mix @((Join-Path $woodMetal "wood_hit_04.ogg"), (Join-Path $woodMetal "metal_hit_02.ogg")) "audio/role-call-b.wav" 0.66 "[0:a]asetrate=44100*0.78,aresample=44100,lowpass=f=2600,volume=0.72[a0];[1:a]asetrate=44100*0.74,aresample=44100,lowpass=f=2200,volume=0.28,adelay=70|70[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -23 -9
Apply-PostGain "audio/role-call-b.wav" 2.5

Render-Mix @($paper3, (Join-Path $woodMetal "wood_hit_08.ogg")) "audio/build-place-a.wav" 0.74 "[0:a]atrim=duration=0.62,highpass=f=80,lowpass=f=3600,volume=0.55[a0];[1:a]asetrate=44100*0.74,aresample=44100,lowpass=f=2400,volume=0.52,adelay=100|100[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -22 -8
Render-Mix @($rockBreak, (Join-Path $woodMetal "wood_hammer_01.ogg")) "audio/build-place-b.wav" 0.78 "[0:a]atrim=duration=0.54,highpass=f=60,lowpass=f=3200,volume=0.42[a0];[1:a]asetrate=44100*0.78,aresample=44100,lowpass=f=2200,volume=0.58,adelay=90|90[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -22 -8

Render-Single (Join-Path $d2Audio "amb-lobby.wav") "audio/amb-lobby-a.wav" 20 "atrim=duration=20,highpass=f=55,lowpass=f=6500" -31 -17 0.12
Render-Mix @((Join-Path $roundOneOriginal "amb-lobby.wav"), $crowd, $oldTower) "audio/amb-lobby-b.wav" 20 "[0:a]atrim=duration=20,highpass=f=50,lowpass=f=6200,volume=0.68[a0];[1:a]atrim=duration=20,highpass=f=160,lowpass=f=2200,volume=0.14[a1];[2:a]atrim=duration=20,highpass=f=90,lowpass=f=4200,volume=0.10[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=shortest[mix]" -30 -16 0.12

Render-Single $paper4 "audio/card-draw-a.wav" 0.54 "silenceremove=start_periods=1`:start_threshold=-46dB`:start_silence=0,atrim=duration=0.50,highpass=f=100,lowpass=f=3600" -24 -9
Render-Single (Join-Path $kenneyRpg "bookFlip3.ogg") "audio/card-draw-b.wav" 0.48 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,asetrate=44100*0.92,aresample=44100,highpass=f=90,lowpass=f=3400,atrim=duration=0.44" -23 -9

Render-Mix @((Join-Path $coinPack "Coin0.mp3"), (Join-Path $coinPack "Coin2.mp3"), (Join-Path $coinPack "Coin4.mp3"), (Join-Path $coinPack "Coin7.mp3")) "audio/coin-multi-a.wav" 0.88 "[0:a]atrim=duration=0.32,lowpass=f=4400,volume=0.46[a0];[1:a]atrim=duration=0.30,asetrate=44100*0.92,aresample=44100,lowpass=f=4100,volume=0.40,adelay=160|160[a1];[2:a]atrim=duration=0.28,asetrate=44100*0.86,aresample=44100,lowpass=f=3800,volume=0.34,adelay=340|340[a2];[3:a]atrim=duration=0.26,asetrate=44100*0.82,aresample=44100,lowpass=f=3600,volume=0.30,adelay=560|560[a3];[a0][a1][a2][a3]amix=inputs=4`:normalize=0`:duration=longest[mix]" -24 -9
Render-Single $coinSyncopika "audio/coin-multi-b.wav" 0.88 "atrim=start=10.88`:duration=0.84,asetpts=PTS-STARTPTS,highpass=f=140,lowpass=f=4300" -25 -9

Render-Single (Join-Path $woodMetal "wood_hammer_02.ogg") "audio/crown-tick-a.wav" 0.24 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,asetrate=44100*0.84,aresample=44100,lowpass=f=2800,atrim=duration=0.21" -24 -9
Render-Single (Join-Path $woodMetal "metal_hit_05.ogg") "audio/crown-tick-b.wav" 0.24 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,asetrate=44100*0.76,aresample=44100,highpass=f=100,lowpass=f=2400,atrim=duration=0.21" -24 -9
Apply-PostGain "audio/crown-tick-b.wav" 6

Render-Single $paper1 "audio/role-reveal-a.wav" 0.52 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=90,lowpass=f=3600,atrim=duration=0.48" -24 -9
Render-Single (Join-Path $kenneyRpg "bookOpen.ogg") "audio/role-reveal-b.wav" 0.58 "silenceremove=start_periods=1`:start_threshold=-48dB`:start_silence=0,highpass=f=80,lowpass=f=3300,atrim=duration=0.54" -24 -9

Render-Mix @((Join-Path $oldOriginal "assassin-mark.wav"), (Join-Path $kenneyRpg "clothBelt2.ogg")) "audio/assassin-mark-a.wav" 0.84 "[0:a]atrim=duration=0.82,lowpass=f=2900,volume=0.74[a0];[1:a]areverse,atrim=duration=0.46,lowpass=f=2400,volume=0.30,adelay=50|50[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -23 -8
Render-Mix @((Join-Path $kenneyRpg "dropLeather.ogg"), (Join-Path $kenneyRpg "knifeSlice2.ogg"), (Join-Path $oldOriginal "assassin-mark.wav")) "audio/assassin-mark-b.wav" 0.78 "[0:a]atrim=duration=0.34,asetrate=44100*0.74,aresample=44100,lowpass=f=2100,volume=0.46[a0];[1:a]atrim=duration=0.26,asetrate=44100*0.58,aresample=44100,lowpass=f=1800,volume=0.08,adelay=360|360[a1];[2:a]atrim=duration=0.78,lowpass=f=2600,volume=0.42[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -23 -8

Render-Mix @((Join-Path $oldOriginal "assassin-skip.wav"), (Join-Path $kenneyRpg "cloth3.ogg")) "audio/assassin-skip-a.wav" 0.98 "[0:a]atrim=duration=0.98,lowpass=f=2900,volume=0.72[a0];[1:a]areverse,atrim=duration=0.42,lowpass=f=2400,volume=0.28,adelay=70|70[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -24 -9
Render-Mix @((Join-Path $kenneyRpg "dropLeather.ogg"), (Join-Path $woodMetal "wood_hit_09.ogg"), (Join-Path $oldOriginal "assassin-skip.wav")) "audio/assassin-skip-b.wav" 0.90 "[0:a]atrim=duration=0.38,asetrate=44100*0.72,aresample=44100,lowpass=f=2000,volume=0.45,adelay=360|360[a0];[1:a]asetrate=44100*0.66,aresample=44100,lowpass=f=1600,volume=0.18,adelay=540|540[a1];[2:a]atrim=duration=0.90,lowpass=f=2500,volume=0.45[a2];[a0][a1][a2]amix=inputs=3`:normalize=0`:duration=longest[mix]" -24 -9

Render-Mix @($rockBreak, (Join-Path $woodMetal "wood_hit_06.ogg")) "audio/warlord-destroy-a.wav" 0.82 "[0:a]atrim=duration=0.58,highpass=f=55,lowpass=f=3000,volume=0.70[a0];[1:a]asetrate=44100*0.68,aresample=44100,lowpass=f=1800,volume=0.34,adelay=90|90[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -21 -7
Render-Mix @((Join-Path $woodMetal "wood_breaking_02.ogg"), (Join-Path $kenneyRpg "doorClose_3.ogg")) "audio/warlord-destroy-b.wav" 0.82 "[0:a]atrim=duration=0.57,asetrate=44100*0.82,aresample=44100,lowpass=f=3000,volume=0.72[a0];[1:a]atrim=duration=0.52,asetrate=44100*0.72,aresample=44100,lowpass=f=1900,volume=0.28,adelay=110|110[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=longest[mix]" -21 -7

Render-Mix @($bardsTale, $fire) "audio/amb-game-a.wav" 24 "[0:a]atrim=duration=24,highpass=f=60,lowpass=f=6500,volume=0.70[a0];[1:a]atrim=start=1`:duration=24,highpass=f=90,lowpass=f=4800,volume=0.07[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=shortest[mix]" -26 -12 0.12
Render-Mix @($oldTower, $fire) "audio/amb-game-b.wav" 24 "[0:a]atrim=duration=24,highpass=f=60,lowpass=f=6200,volume=0.66[a0];[1:a]atrim=start=1`:duration=24,highpass=f=90,lowpass=f=4500,volume=0.06[a1];[a0][a1]amix=inputs=2`:normalize=0`:duration=shortest[mix]" -26 -12 0.12

Render-Single $fire "audio/amb-ready-a.wav" 20 "atrim=start=1`:duration=20,highpass=f=70,lowpass=f=5600" -32 -17 0.12
Render-Single $smallFire "audio/amb-ready-b.wav" 20 "atrim=start=0`:duration=20,highpass=f=80,lowpass=f=5200" -32 -17 0.12

Get-ChildItem -LiteralPath $audioRoot, $referenceRoot -Filter "*.wav" | Sort-Object DirectoryName, Name | Select-Object DirectoryName, Name, Length
