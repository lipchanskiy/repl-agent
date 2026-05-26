// MCP tool: eval — evaluate a Clojure expression in the live REPL.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { REPLBackend } from "../backends/interface.js";
import { checkEval } from "../permissions/eval-guard.js";
import type { AuditLogger } from "../permissions/logger.js";
import { Mode } from "../permissions/mode.js";
import type { Policy } from "../permissions/policy.js";
import { formatEvalResult } from "../format.js";

const EvalSchema = {
  code: z.string().describe("Clojure expression to evaluate"),
  ns: z.string().optional().describe("Namespace to evaluate in (default: current)"),
  timeout_ms: z.number().optional().describe("Timeout in milliseconds (default: 10000)"),
};

export function registerEvalTool(
  server: McpServer,
  backend: REPLBackend,
  mode: Mode,
  policy: Policy | null,
  logger: AuditLogger
): void {
  server.registerTool(
    "eval",
    {
      description:
        "Evaluate a Clojure expression in the live nREPL session. " +
        "State is persistent — defs from one call are visible in subsequent calls.",
      inputSchema: EvalSchema,
    },
    async (args) => {
      const { code, ns, timeout_ms } = args;

      // Permission check
      const guard = checkEval(code, mode, policy);
      if (!guard.allowed) {
        logger.logEval(mode, code, "blocked", undefined, guard.reason);
        return {
          content: [{ type: "text", text: `Blocked: ${guard.reason}` }],
          isError: true,
        };
      }

      // Apply policy timeout in restricted mode
      const maxTimeout =
        mode === Mode.Restricted && policy
          ? policy.maxTimeoutMs
          : undefined;
      const timeoutMs = maxTimeout
        ? Math.min(timeout_ms ?? 10_000, maxTimeout)
        : (timeout_ms ?? 10_000);

      let result;
      try {
        const evalOpts: import("../backends/interface.js").EvalOptions = { timeoutMs };
        if (ns !== undefined) evalOpts.ns = ns;
        result = await backend.eval(code, evalOpts);
      } catch (err) {
        const msg = (err as Error).message;
        logger.logEval(mode, code, "error", undefined, msg);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }

      const status = result.error ? "error" : "ok";
      logger.logEval(mode, code, status, result.value);

      return {
        content: [{ type: "text", text: formatEvalResult(result) }],
        isError: !!result.error,
      };
    }
  );
}
