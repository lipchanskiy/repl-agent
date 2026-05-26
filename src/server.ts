// MCP server: connects to nREPL, registers tools based on mode, starts stdio transport.
import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { version: PACKAGE_VERSION } = createRequire(import.meta.url)(
  "../package.json"
) as { version: string };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { Mode, type ServerConfig } from "./permissions/mode.js";
import { loadPolicy, DEFAULT_POLICY, type Policy } from "./permissions/policy.js";
import { makeLogger, NO_LOGGER, type AuditLogger } from "./permissions/logger.js";
import { NREPLBackend } from "./backends/nrepl/backend.js";
import type { REPLBackend } from "./backends/interface.js";

import { registerEvalTool } from "./tools/eval.js";
import {
  registerLoadNamespaceTool,
  registerListNamespacesTool,
  registerNsPublicsTool,
} from "./tools/namespace.js";
import {
  registerGetVarTool,
  registerGetSessionInfoTool,
  registerInterruptTool,
} from "./tools/inspection.js";
import { registerRunTestsTool } from "./tools/testing.js";

function buildPolicy(config: ServerConfig): Policy | null {
  if (config.mode === Mode.Restricted) {
    return config.configPath
      ? loadPolicy(config.configPath)
      : DEFAULT_POLICY;
  }
  return null;
}

function buildLogger(config: ServerConfig, policy: Policy | null): AuditLogger {
  if (config.mode === Mode.Restricted && policy) {
    return makeLogger(config.mode, policy.logAllEvals, policy.logPath);
  }
  return NO_LOGGER;
}

function registerTools(
  server: McpServer,
  backend: REPLBackend,
  config: ServerConfig,
  policy: Policy | null,
  logger: AuditLogger
): void {
  const { mode } = config;

  // eval — available in all modes, but guarded by permission layer
  registerEvalTool(server, backend, mode, policy, logger);

  // Read-only inspection tools — all modes
  registerListNamespacesTool(server, backend);
  registerNsPublicsTool(server, backend);
  registerGetVarTool(server, backend);
  registerGetSessionInfoTool(server, backend, mode);
  registerInterruptTool(server, backend);

  // Mutation tools — dev only
  if (mode === Mode.Dev) {
    registerLoadNamespaceTool(server, backend);
    registerRunTestsTool(server, backend);
  }
}

export async function startServer(
  config: ServerConfig,
  managedProcess?: ChildProcess
): Promise<void> {
  const policy = buildPolicy(config);
  const logger = buildLogger(config, policy);

  const cwdNote = config.launchCwd ? ` cwd=${config.launchCwd}` : "";
  console.error(
    `[repl-agent] mode=${config.mode} nrepl=${config.host}:${config.port}${cwdNote}`
  );

  // Connect to nREPL
  const backend = new NREPLBackend();
  try {
    await backend.connect({ host: config.host, port: config.port });
  } catch (err) {
    throw new Error(
      `Failed to connect to nREPL at ${config.host}:${config.port}: ${(err as Error).message}`
    );
  }

  // Build MCP server
  const server = new McpServer(
    { name: "repl-agent", version: PACKAGE_VERSION },
    { capabilities: { tools: {} } }
  );

  registerTools(server, backend, config, policy, logger);

  // Wire up stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[repl-agent] MCP server ready (stdio)");

  // Keep process alive; handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.error("[repl-agent] Shutting down…");
    await server.close();
    await backend.disconnect();
    if (managedProcess && !managedProcess.killed) {
      console.error("[repl-agent] Stopping managed nREPL process…");
      managedProcess.kill("SIGTERM");
      // Give it a moment, then force-kill
      await new Promise((r) => setTimeout(r, 2000));
      if (!managedProcess.killed) managedProcess.kill("SIGKILL");
    }
    process.exit(0);
  };

  // If managed process exits unexpectedly, shut down the MCP server too
  managedProcess?.on("exit", (code) => {
    console.error(`[repl-agent] nREPL process exited (code ${code ?? "?"}), shutting down`);
    void shutdown();
  });

  process.on("SIGINT",  () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
