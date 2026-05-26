// Audit logger for all eval operations.
// Writes append-only NDJSON lines to a file (or stderr as fallback).
import { appendFileSync } from "node:fs";
import { Mode } from "./mode.js";

export type LogStatus = "ok" | "error" | "blocked" | "timeout";

export interface AuditEntry {
  ts: string;
  mode: Mode;
  code: string;
  status: LogStatus;
  result?: string;
  reason?: string;
}

export class AuditLogger {
  private readonly logPath: string | null;
  private readonly active: boolean;

  constructor(logPath: string | null, active = true) {
    this.logPath = logPath;
    this.active = active;
  }

  log(entry: AuditEntry): void {
    if (!this.active) return;
    const line = JSON.stringify(entry);
    if (this.logPath) {
      try {
        appendFileSync(this.logPath, line + "\n", "utf-8");
      } catch (err) {
        // Fallback to stderr if file write fails
        console.error(`[audit] write failed (${(err as Error).message}): ${line}`);
      }
    } else {
      // logPath not configured — write to stderr
      console.error(`[audit] ${line}`);
    }
  }

  logEval(
    mode: Mode,
    code: string,
    status: LogStatus,
    result?: string,
    reason?: string
  ): void {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      mode,
      code: code.length > 500 ? code.slice(0, 500) + "…" : code,
      status,
    };
    if (result !== undefined) entry.result = result.slice(0, 200);
    if (reason !== undefined) entry.reason = reason;
    this.log(entry);
  }
}

/** No-op logger used when logging is disabled. */
export const NO_LOGGER: AuditLogger = new AuditLogger(null, false);

export function makeLogger(
  mode: Mode,
  logAllEvals: boolean,
  logPath: string
): AuditLogger {
  // Always log in restricted mode; honour logAllEvals flag otherwise
  if (mode === Mode.Restricted || logAllEvals) {
    return new AuditLogger(logPath);
  }
  return NO_LOGGER;
}
