import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const roles = JSON.parse(readFileSync(resolve(root, "server/src/data/roles.json"), "utf8"));
const districts = JSON.parse(readFileSync(resolve(root, "server/src/data/districts.json"), "utf8"));
const expected = [
  ...roles.map((role) => `client/public/assets/visual/cards/roles/${role.id}.webp`),
  ...districts.map((district) => `client/public/assets/visual/cards/districts/${district.id}.webp`),
  "client/public/assets/visual/cards/backs/role.webp",
  "client/public/assets/visual/cards/backs/district.webp"
];
const missing = expected.filter((path) => !existsSync(resolve(root, path)));

console.log(`[art] expected=${expected.length} present=${expected.length - missing.length} missing=${missing.length}`);
if (missing.length > 0) {
  console.log(missing.map((path) => `- ${path}`).join("\n"));
}
if (strict && missing.length > 0) {
  process.exitCode = 1;
}
