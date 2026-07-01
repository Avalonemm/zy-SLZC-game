import type { DistrictCard, DistrictColor, RoleCard } from "@zy/shared";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(currentDir, "..", "data");

export function loadRoleCards(): RoleCard[] {
  const roles = readJsonFile<unknown[]>(join(dataDir, "roles.json"));
  return roles.map(parseRoleCard).sort((a, b) => a.order - b.order);
}

export function loadDistrictCards(): DistrictCard[] {
  const districts = readJsonFile<unknown[]>(join(dataDir, "districts.json"));
  return districts.map(parseDistrictCard);
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function parseRoleCard(value: unknown): RoleCard {
  const record = asRecord(value);
  return {
    id: readString(record, "id"),
    order: readNumber(record, "order"),
    name: readString(record, "name"),
    description: readString(record, "description"),
    effectType: readString(record, "effectType"),
    effectParams: asEffectParams(record.effectParams)
  };
}

function parseDistrictCard(value: unknown): DistrictCard {
  const record = asRecord(value);
  return {
    id: readString(record, "id"),
    name: readString(record, "name"),
    cost: readNumber(record, "cost"),
    color: readDistrictColor(record.color),
    score: readNumber(record, "score"),
    description: readString(record, "description"),
    effectType: readString(record, "effectType"),
    effectParams: asEffectParams(record.effectParams)
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Card config item must be an object.");
  }

  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Card config field ${key} must be a non-empty string.`);
  }

  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Card config field ${key} must be a number.`);
  }

  return value;
}

function readDistrictColor(value: unknown): DistrictColor {
  if (
    value === "yellow" ||
    value === "blue" ||
    value === "green" ||
    value === "red" ||
    value === "purple"
  ) {
    return value;
  }

  throw new Error("District color is invalid.");
}

function asEffectParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("effectParams must be an object.");
  }

  return value as Record<string, string | number | boolean | string[] | number[]>;
}
