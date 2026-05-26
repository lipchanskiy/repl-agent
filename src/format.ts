// Utilities for formatting MCP tool responses and parsing Clojure EDN output.
import {
  parseEDNString,
  type EDNVal,
  type EDNKeyword,
  type EDNMap,
} from "edn-data";
import type { EvalResult, VarInfo, VarDetail, SessionInfo, TestResult } from "./backends/interface.js";

// ─── EDN helpers ────────────────────────────────────────────────────────────

export function parseEDN(s: string): EDNVal {
  return parseEDNString(s) as EDNVal;
}

/** Extract a JS Record from an EDN map whose keys are keywords. */
export function ednMapToRecord(val: EDNVal): Record<string, EDNVal> {
  const m = val as EDNMap;
  if (!m || !Array.isArray(m.map)) return {};
  const out: Record<string, EDNVal> = {};
  for (const [k, v] of m.map) {
    if (typeof k === "object" && k !== null && "key" in k) {
      out[(k as EDNKeyword).key] = v;
    }
  }
  return out;
}

/** Extract a string[] from an EDN list or vector of strings. */
export function ednToStringArray(val: EDNVal): string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === "string");
  }
  if (typeof val === "object" && val !== null && "list" in val) {
    const l = (val as { list: EDNVal[] }).list;
    return l.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export function ednToString(val: EDNVal): string {
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "bigint") return String(val);
  if (val === null) return "";
  if (typeof val === "boolean") return String(val);
  return String(val);
}

export function ednToNumber(val: EDNVal): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  return 0;
}

// ─── Clojure result parsers ──────────────────────────────────────────────────

export function parseVarInfoList(value: string): VarInfo[] {
  try {
    const parsed = parseEDN(value);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((item) => {
      const m = ednMapToRecord(item);
      const info: VarInfo = { name: ednToString(m["name"] ?? "") };
      if (m["arglists"] !== undefined) info.arglists = ednToString(m["arglists"]);
      if (m["doc"]      !== undefined) info.doc      = ednToString(m["doc"]);
      if (m["line"]     !== undefined) info.line     = ednToNumber(m["line"]);
      if (m["file"]     !== undefined) info.file     = ednToString(m["file"]);
      return info;
    });
  } catch {
    return [];
  }
}

export function parseVarDetail(value: string): VarDetail {
  try {
    const m = ednMapToRecord(parseEDN(value));
    const detail: VarDetail = {};
    if (m["value"]  !== undefined) detail.value  = ednToString(m["value"]);
    if (m["meta"]   !== undefined) detail.meta   = ednToString(m["meta"]);
    if (m["source"] !== undefined) detail.source = ednToString(m["source"]);
    if (m["error"]  !== undefined) detail.error  = ednToString(m["error"]);
    return detail;
  } catch {
    return { error: `Failed to parse var detail: ${value}` };
  }
}

export function parseSessionInfoEDN(
  value: string,
  mode: string,
  sessionId?: string
): SessionInfo {
  try {
    const m = ednMapToRecord(parseEDN(value));
    const info: SessionInfo = {
      ns: ednToString(m["ns"] ?? "user"),
      clojureVersion: ednToString(m["clojure-version"] ?? ""),
      jvmVersion: ednToString(m["jvm-version"] ?? ""),
      mode,
    };
    if (sessionId !== undefined) info.sessionId = sessionId;
    return info;
  } catch {
    return { ns: "user", clojureVersion: "unknown", jvmVersion: "unknown", mode };
  }
}

export function parseTestResult(value: string): TestResult {
  try {
    const m = ednMapToRecord(parseEDN(value));
    return {
      passed: ednToNumber(m["pass"] ?? 0),
      failed: ednToNumber(m["fail"] ?? 0),
      errors: ednToNumber(m["error"] ?? 0),
      results: [],
    };
  } catch {
    return { passed: 0, failed: 0, errors: 0, results: [] };
  }
}

// ─── MCP response formatting ─────────────────────────────────────────────────

export function formatEvalResult(r: EvalResult): string {
  const parts: string[] = [];
  if (r.value !== undefined) parts.push(`=> ${r.value}`);
  if (r.stdout) parts.push(`stdout:\n${r.stdout}`);
  if (r.stderr) parts.push(`stderr:\n${r.stderr}`);
  if (r.error) parts.push(`error: ${r.error}`);
  if (r.ns) parts.push(`ns: ${r.ns}`);
  return parts.join("\n") || "(no output)";
}
