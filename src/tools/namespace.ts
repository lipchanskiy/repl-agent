// MCP tools: load_namespace, list_namespaces, ns_publics.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { REPLBackend, VarInfo } from "../backends/interface.js";

function formatVarInfo(v: VarInfo): string {
  const lines: string[] = [`  ${v.name}`];
  if (v.arglists) lines.push(`    arglists: ${v.arglists}`);
  if (v.doc)      lines.push(`    doc: ${v.doc}`);
  if (v.file)     lines.push(`    file: ${v.file}:${v.line ?? "?"}`);
  return lines.join("\n");
}

export function registerLoadNamespaceTool(
  server: McpServer,
  backend: REPLBackend
): void {
  server.registerTool(
    "load_namespace",
    {
      description:
        "Load or reload a Clojure namespace from source files. " +
        "Use reload:true to force re-evaluation of already loaded code.",
      inputSchema: {
        ns: z.string().describe("Fully qualified namespace name, e.g. myapp.core"),
        reload: z.boolean().optional().describe("Force reload (default: false)"),
      },
    },
    async (args) => {
      const { ns, reload } = args;
      let result;
      try {
        result = await backend.loadNamespace(ns, reload ?? false);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      if (!result.success) {
        return {
          content: [{ type: "text", text: `Failed to load ${ns}: ${result.error}` }],
          isError: true,
        };
      }

      const warnings = result.warnings.length
        ? `\nWarnings:\n${result.warnings.join("\n")}`
        : "";
      return {
        content: [{ type: "text", text: `Loaded ${ns} successfully.${warnings}` }],
      };
    }
  );
}

export function registerListNamespacesTool(
  server: McpServer,
  backend: REPLBackend
): void {
  server.registerTool(
    "list_namespaces",
    {
      description: "List all currently loaded Clojure namespaces.",
      inputSchema: {},
    },
    async () => {
      let namespaces: string[];
      try {
        namespaces = await backend.listNamespaces();
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `${namespaces.length} namespaces loaded:\n${namespaces.join("\n")}`,
          },
        ],
      };
    }
  );
}

export function registerNsPublicsTool(
  server: McpServer,
  backend: REPLBackend
): void {
  server.registerTool(
    "ns_publics",
    {
      description: "List all public vars in a namespace with their metadata.",
      inputSchema: {
        ns: z.string().describe("Fully qualified namespace name"),
      },
    },
    async (args) => {
      const { ns } = args;
      let vars: VarInfo[];
      try {
        vars = await backend.nsPublics(ns);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      if (vars.length === 0) {
        return { content: [{ type: "text", text: `No public vars in ${ns}.` }] };
      }

      const body = vars.map(formatVarInfo).join("\n");
      return {
        content: [{ type: "text", text: `Public vars in ${ns}:\n${body}` }],
      };
    }
  );
}
