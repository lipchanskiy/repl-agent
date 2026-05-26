// Pre-flight check for expressions in restricted mode.
// Uses a lightweight hand-rolled S-expression parser to extract the leading
// form name, then checks it against the policy allowlist.
// This is NOT a full Clojure parser — it's a surface-level guard.

import { Mode } from "./mode.js";
import type { Policy } from "./policy.js";

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// Extract the first token of an S-expression.
// "(count xs)" → "count", "(clojure.repl/doc f)" → "clojure.repl/doc"
// Returns null for non-list expressions (literals, bare symbols, etc.)
function extractLeadingForm(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith("(")) return null;

  let i = 1;
  // Skip whitespace after opening paren
  while (i < trimmed.length && /\s/.test(trimmed[i] ?? "")) i++;

  // Read the form name: everything up to whitespace or closing paren
  let name = "";
  while (i < trimmed.length) {
    const ch = trimmed[i] ?? "";
    if (/[\s)]/.test(ch)) break;
    name += ch;
    i++;
  }
  return name.length > 0 ? name : null;
}

// Always-blocked patterns regardless of mode.
const DANGEROUS_TOP_LEVEL = new Set([
  "def", "defn", "defmacro", "defmulti", "defmethod",
  "ns", "in-ns", "require", "use", "import",
  "load", "load-file", "load-string",
  "eval", "intern",
  "System/exit", "System/halt", "Runtime/exec",
  "shutdown-agents",
]);

function checkDangerous(form: string): GuardResult {
  // Exact match or namespace-qualified dangerous call
  const shortName = form.includes("/") ? (form.split("/")[1] ?? form) : form;
  if (DANGEROUS_TOP_LEVEL.has(form) || DANGEROUS_TOP_LEVEL.has(shortName)) {
    return { allowed: false, reason: `Form "${form}" is not allowed in restricted mode` };
  }
  return { allowed: true };
}

export function checkEval(
  code: string,
  mode: Mode,
  policy: Policy | null
): GuardResult {
  if (mode === Mode.Dev) return { allowed: true };

  if (mode === Mode.Readonly) {
    // Readonly: only pure inspection is allowed — no side-effecting top-level forms
    const form = extractLeadingForm(code);
    if (form !== null) {
      const danger = checkDangerous(form);
      if (!danger.allowed) return danger;
    }
    return { allowed: true };
  }

  // Restricted mode
  if (!policy) {
    return { allowed: false, reason: "No policy loaded for restricted mode" };
  }

  const form = extractLeadingForm(code);

  // Non-list expressions (strings, numbers, keywords) are allowed
  if (form === null) return { allowed: true };

  const danger = checkDangerous(form);
  if (!danger.allowed) return danger;

  const allowed = policy.allowedForms.some(
    (f) => f === form || form.endsWith(`/${f.split("/").pop()}`)
  );

  if (!allowed) {
    return {
      allowed: false,
      reason:
        `Form "${form}" is not in the allowed-forms list. ` +
        `Allowed: ${policy.allowedForms.join(", ")}`,
    };
  }

  return { allowed: true };
}
