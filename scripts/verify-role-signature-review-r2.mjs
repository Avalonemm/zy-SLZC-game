import fs from "node:fs";
import path from "node:path";

const root = path.resolve("output/audio-review/role-signature-review-02/audio");
const reviewRoot = path.dirname(root);
const roles = ["king", "bishop", "architect", "queen"];
const expected = roles.flatMap((role) => ["a", "b", "c"].map((variant) => `${role}-${variant}.wav`));

function rmsDb(samples) {
  if (!samples.length) return -Infinity;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length) / 32768;
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

const results = [];
for (const name of expected) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) throw new Error(`Missing candidate: ${name}`);
  const data = fs.readFileSync(file);
  if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Invalid WAV header: ${name}`);
  }
  const channels = data.readUInt16LE(22);
  const sampleRate = data.readUInt32LE(24);
  const bits = data.readUInt16LE(34);
  const dataOffset = data.indexOf(Buffer.from("data"));
  if (dataOffset < 0) throw new Error(`Missing data chunk: ${name}`);
  const dataSize = data.readUInt32LE(dataOffset + 4);
  const pcm = data.subarray(dataOffset + 8, dataOffset + 8 + dataSize);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const peakDbfs = peak ? 20 * Math.log10(peak / 32768) : -Infinity;
  const duration = samples.length / channels / sampleRate;
  const tail20Count = Math.min(samples.length, Math.round(sampleRate * channels * 0.02));
  const tail20 = samples.subarray(samples.length - tail20Count);
  const tail20Dbfs = rmsDb(tail20);
  const lastSample = Math.abs(samples.at(-1) ?? 0) / 32768;

  if (channels !== 2 || sampleRate !== 44100 || bits !== 16) throw new Error(`Unexpected format: ${name}`);
  if (!Number.isFinite(peakDbfs) || peakDbfs < -42) throw new Error(`Silent or too quiet: ${name}`);
  if (peakDbfs > -7.8) throw new Error(`Peak exceeds review ceiling: ${name} ${peakDbfs.toFixed(2)} dBFS`);
  if (tail20Dbfs > -34) throw new Error(`Tail does not decay enough: ${name} ${tail20Dbfs.toFixed(2)} dBFS`);
  if (lastSample > 0.002) throw new Error(`Last sample is not near zero: ${name}`);

  results.push({ name, duration: Number(duration.toFixed(3)), peakDbfs: Number(peakDbfs.toFixed(2)), tail20Dbfs: Number(tail20Dbfs.toFixed(2)) });
}

console.table(results);
console.log(`Validated ${results.length} R2 role-signature candidates.`);

const manifest = JSON.parse(fs.readFileSync(path.join(reviewRoot, "manifest.json"), "utf8"));
if (manifest.revisionRoles.length !== 4 || manifest.frozenRoles.length !== 3) {
  throw new Error("Unexpected revision/frozen role count in manifest.");
}
const localReferences = [
  ...manifest.styleReferences.map((item) => item.file),
  ...manifest.frozenRoles.map((item) => item.file),
  ...manifest.sources.map((item) => item.local),
  ...manifest.revisionRoles.flatMap((role) => [
    role.previous.file,
    role.commonAction,
    ...role.candidates.flatMap((candidate) => [candidate.file, ...candidate.originals]),
  ]),
  ...manifest.fullPreview.events.map((event) => event.file),
].filter((value) => value && !/^https?:/i.test(value) && value !== "manifest.json");

const missing = [...new Set(localReferences)].filter((reference) => !fs.existsSync(path.resolve(reviewRoot, reference)));
if (missing.length) throw new Error(`Missing review references:\n${missing.join("\n")}`);
console.log(`Validated ${new Set(localReferences).size} local review references.`);
