import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audioRoot = path.join(root, "client", "public", "assets", "audio", "v1");
const manifest = JSON.parse(fs.readFileSync(path.join(audioRoot, "manifest.json"), "utf8"));
const catalog = fs.readFileSync(path.join(root, "client", "src", "audio", "audioCatalog.ts"), "utf8");
const mapping = fs.readFileSync(path.join(root, "client", "src", "audio", "useGameAudio.ts"), "utf8");
const expectedSideFiles = new Set(["README.md", "manifest.json"]);
const declaredFiles = new Set(manifest.files.map((entry) => entry.file));
const actualAudioFiles = fs.readdirSync(audioRoot).filter((file) => file.toLowerCase().endsWith(".wav"));

assert(manifest.status === "approved-and-integrated", "manifest integration status is incorrect");
assert(manifest.files.length === 24, `expected 24 manifest files, found ${manifest.files.length}`);
assert(actualAudioFiles.length === 24, `expected 24 WAV files, found ${actualAudioFiles.length}`);
assert(new Set(actualAudioFiles).size === actualAudioFiles.length, "duplicate WAV filenames found");
assert(fs.readdirSync(audioRoot).every((file) => declaredFiles.has(file) || expectedSideFiles.has(file)), "unexpected formal audio file found");

for (const entry of manifest.files) {
  const formalPath = path.join(audioRoot, entry.file);
  const sourcePath = path.join(root, ...entry.sourceFile.split("/"));
  assert(fs.existsSync(formalPath), `missing ${entry.file}`);
  assert(fs.existsSync(sourcePath), `missing source ${entry.sourceFile}`);
  assert(entry.sourceIds.length > 0, `${entry.cueId} has no source IDs`);
  for (const sourceId of entry.sourceIds) {
    assert(manifest.sources[sourceId], `${entry.cueId} references unknown source ${sourceId}`);
  }
  inspectWave(formalPath, entry.file);
  assert(hash(formalPath) === hash(sourcePath), `${entry.file} differs from its approved source`);
  assert(catalog.includes(`/${entry.file}`), `${entry.file} is not referenced by the catalog`);
}

assert(!declaredFiles.has("ui-error.wav"), "ui-error must remain silent");
assert(!declaredFiles.has("final-round.wav"), "final-round must remain silent");
assert(mapping.includes('case "game_ended"'), "game_ended mapping is missing");
assert(mapping.includes('play("result-end", "game-ended")'), "game_ended does not play result-end");
assert(mapping.includes('case "final_round"'), "final_round silence is not explicit");
assert(catalog.includes('lobby: "amb-ready"'), "lobby must share the approved ready-room ambience");
assert(catalog.includes('ready: "amb-ready"'), "ready room ambience mapping is missing");
assert(catalog.includes('"amb-game"') && catalog.includes("loopEnd: 8.55"), "game ambience must skip its trailing silent section");
assert(manifest.runtimeLoops?.lobby?.cueId === "amb-ready" && manifest.runtimeLoops?.ready?.cueId === "amb-ready", "lobby and ready must share one ambience cue");
assert(manifest.runtimeLoops?.game?.loopEnd === 8.55 && manifest.runtimeLoops?.game?.crossfade === 1.1, "game seamless loop window is not documented");

console.log(`Audio integration verified: ${manifest.files.length} approved WAV files, exact source copies, catalog complete, silent cues preserved.`);

function inspectWave(file, label) {
  const data = fs.readFileSync(file);
  assert(data.length >= 44, `${label} is too small`);
  assert(data.toString("ascii", 0, 4) === "RIFF", `${label} has no RIFF header`);
  assert(data.toString("ascii", 8, 12) === "WAVE", `${label} has no WAVE header`);
  const fmtOffset = data.indexOf(Buffer.from("fmt "));
  const pcmOffset = data.indexOf(Buffer.from("data"));
  assert(fmtOffset >= 0 && pcmOffset >= 0, `${label} has invalid WAV chunks`);
  const channels = data.readUInt16LE(fmtOffset + 10);
  const sampleRate = data.readUInt32LE(fmtOffset + 12);
  const bitsPerSample = data.readUInt16LE(fmtOffset + 22);
  const dataLength = data.readUInt32LE(pcmOffset + 4);
  assert(channels === 1 || channels === 2, `${label} must be mono or stereo`);
  assert(sampleRate === 44100, `${label} must be 44100 Hz`);
  assert(bitsPerSample === 16, `${label} must be 16-bit PCM`);
  assert(dataLength > 0, `${label} has no audio samples`);
  let peak = 0;
  let activeSamples = 0;
  for (let offset = pcmOffset + 8; offset + 1 < Math.min(data.length, pcmOffset + 8 + dataLength); offset += 2) {
    const sample = Math.abs(data.readInt16LE(offset));
    peak = Math.max(peak, sample);
    if (sample > 4) activeSamples += 1;
  }
  assert(activeSamples > 100, `${label} is effectively silent`);
  assert(peak < 32767, `${label} contains full-scale clipping`);
}

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
