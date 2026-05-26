// MCP tool: run_tests — execute clojure.test suites via the live REPL.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { REPLBackend, TestResult } from "../backends/interface.js";

function formatTestResult(r: TestResult): string {
  const summary =
    `Passed: ${r.passed}  Failed: ${r.failed}  Errors: ${r.errors}`;

  if (r.results.length === 0) return summary;

  const details = r.results
    .filter((c) => c.status !== "pass")
    .map((c) => `  [${c.status.toUpperCase()}] ${c.ns}/${c.name}${c.message ? `: ${c.message}` : ""}`)
    .join("\n");

  return details ? `${summary}\n\nFailures:\n${details}` : summary;
}

export function registerRunTestsTool(
  server: McpServer,
  backend: REPLBackend
): void {
  server.registerTool(
    "run_tests",
    {
      description:
        "Run clojure.test tests. Omit ns to run all loaded test namespaces.",
      inputSchema: {
        ns: z
          .string()
          .optional()
          .describe("Namespace to test (omit to run all)"),
      },
    },
    async (args) => {
      const { ns } = args;
      let result: TestResult;
      try {
        result = await backend.runTests(ns);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const isError = result.failed > 0 || result.errors > 0;
      return {
        content: [{ type: "text", text: formatTestResult(result) }],
        isError,
      };
    }
  );
}
