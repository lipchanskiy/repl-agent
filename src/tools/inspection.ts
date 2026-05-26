// MCP tools: get_var, get_session_info, interrupt.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { REPLBackend } from "../backends/interface.js";
import type { Mode } from "../permissions/mode.js";

export function registerGetVarTool(
  server: McpServer,
  backend: REPLBackend
): void {
  server.registerTool(
    "get_var",
    {
      description:
        "Inspect a Clojure var: its current value, metadata, and source if available.",
      inputSchema: {
        sym: z
          .string()
          .describe("Fully qualified symbol, e.g. myapp.core/process"),
      },
    },
    async (args) => {
      const { sym } = args;
      let detail;
      try {
        detail = await backend.getVar(sym);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      if (detail.error) {
        return {
          content: [{ type: "text", text: `Error: ${detail.error}` }],
          isError: true,
        };
      }

      const parts: string[] = [`Var: ${sym}`];
      if (detail.value !== undefined) parts.push(`Value: ${detail.value}`);
      if (detail.meta)   parts.push(`Meta:  ${detail.meta}`);
      if (detail.source) parts.push(`\nSource:\n${detail.source}`);

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }
  );
}

export function registerGetSessionInfoTool(
  server: McpServer,
  backend: REPLBackend,
  mode: Mode
): void {
  server.registerTool(
    "get_session_info",
    {
      description:
        "Get current REPL session state: active namespace, Clojure version, JVM version, mode.",
      inputSchema: {},
    },
    async () => {
      let info;
      try {
        info = await backend.getSessionInfo(mode);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const lines = [
        `Namespace:       ${info.ns}`,
        `Clojure version: ${info.clojureVersion}`,
        `JVM version:     ${info.jvmVersion}`,
        `Mode:            ${info.mode}`,
      ];
      if (info.sessionId) lines.push(`Session ID:      ${info.sessionId}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

export function registerInterruptTool(
  server: McpServer,
  backend: REPLBackend
): void {
  server.registerTool(
    "interrupt",
    {
      description: "Interrupt the currently running evaluation.",
      inputSchema: {},
    },
    async () => {
      try {
        await backend.interrupt();
        return { content: [{ type: "text", text: "Interrupt signal sent." }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
