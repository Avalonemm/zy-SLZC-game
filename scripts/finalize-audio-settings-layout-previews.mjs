import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runDir = resolve(process.argv[2] || "output/ui-layout/audio-settings-preview-01");
const blueprintPath = resolve(runDir, "ui-blueprint.json");
const initialPath = resolve(runDir, "ui-blueprint.initial.json");
const blueprint = JSON.parse(readFileSync(blueprintPath, "utf8"));
const items = [];

for (const concept of ["A", "B", "C"]) {
  blueprint.concepts[concept].previews = {
    wireframe: {},
    effect: {},
    disclaimer: "Effect previews are disposable direction-selection references, not final art or implementation assets."
  };
  for (const viewport of ["wide", "compact"]) {
    for (const mode of ["wireframe", "effect"]) {
      const fileName = `${concept}-${viewport}-${mode}.png`;
      const fullPath = resolve(runDir, "previews", fileName);
      if (!existsSync(fullPath)) throw new Error(`Missing preview: ${fullPath}`);
      const relativePath = `previews/${fileName}`;
      blueprint.concepts[concept].previews[mode][viewport] = relativePath;
      items.push({ concept, viewport, mode, theme: mode === "wireframe" ? "neutral" : "warm-tabletop", path: relativePath });
    }
  }
}

blueprint.metadata.previewStatus = "ready";
blueprint.metadata.previewGeneratedAt = new Date().toISOString();
const manifest = {
  schemaVersion: 1,
  generatedAt: blueprint.metadata.previewGeneratedAt,
  disclaimer: "Effect previews are disposable selection references. Blueprint geometry remains authoritative.",
  rendererNote: "Bundled renderer validated the run but local Chrome failed; the same layout-lab URLs were exported one-by-one with local Edge because its temporary profile cleanup is more stable on this machine.",
  items
};

writeFileSync(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`, "utf8");
writeFileSync(initialPath, `${JSON.stringify(blueprint, null, 2)}\n`, "utf8");
writeFileSync(resolve(runDir, "preview-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
