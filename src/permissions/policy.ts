// Load and validate EDN access-control policies for restricted mode.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseEDNString,
  type EDNVal,
  type EDNKeyword,
  type EDNMap,
} from "edn-data";

export interface Policy {
  allowedForms: string[];
  maxTimeoutMs: number;
  logAllEvals: boolean;
  logPath: string;
}

export const DEFAULT_POLICY: Policy = {
  allowedForms: [
    "count", "keys", "vals", "class", "type", "meta",
    "clojure.repl/doc", "clojure.repl/source",
  ],
  maxTimeoutMs: 3_000,
  logAllEvals: true,
  logPath: join(tmpdir(), "repl-agent-evals.log"),
};

function ednMapGet(map: EDNMap, keyName: string): EDNVal | undefined {
  for (const [k, v] of map.map) {
    if (
      typeof k === "object" &&
      k !== null &&
      "key" in k &&
      (k as EDNKeyword).key === keyName
    ) {
      return v;
    }
  }
  return undefined;
}

function toStringArray(val: EDNVal | undefined): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}

function toBoolean(val: EDNVal | undefined, fallback: boolean): boolean {
  if (typeof val === "boolean") return val;
  return fallback;
}

function toNumber(val: EDNVal | undefined, fallback: number): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  return fallback;
}

function toString(val: EDNVal | undefined, fallback: string): string {
  if (typeof val === "string") return val;
  return fallback;
}

export function loadPolicy(configPath: string): Policy {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read policy file "${configPath}": ${(err as Error).message}`
    );
  }

  let parsed: EDNVal;
  try {
    parsed = parseEDNString(raw) as EDNVal;
  } catch (err) {
    throw new Error(
      `Failed to parse EDN policy "${configPath}": ${(err as Error).message}`
    );
  }

  const m = parsed as EDNMap;
  if (!m || !Array.isArray(m.map)) {
    throw new Error(`Policy file "${configPath}" must be an EDN map`);
  }

  return {
    allowedForms: toStringArray(ednMapGet(m, "allowed-forms")),
    maxTimeoutMs: toNumber(ednMapGet(m, "max-timeout-ms"), DEFAULT_POLICY.maxTimeoutMs),
    logAllEvals:  toBoolean(ednMapGet(m, "log-all-evals"), DEFAULT_POLICY.logAllEvals),
    logPath:      toString(ednMapGet(m, "log-path"), DEFAULT_POLICY.logPath),
  };
}
