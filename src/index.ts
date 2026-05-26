#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { startServer } from "./server.js";
import { launchRepl } from "./launcher.js";
import { Mode, type ServerConfig } from "./permissions/mode.js";

function printUsage(): void {
  console.error(`
Usage: repl-agent [options]

Options:
  --mode <mode>        Access mode: dev | readonly | restricted  (default: dev)
  --host <host>        nREPL host                                (default: 127.0.0.1)
  --port <port>        nREPL port number
  --port-file <path>   Read nREPL port from file (e.g. .nrepl-port)
  --launch <cmd>       Command to start the nREPL (e.g. "clj -M:dev")
  --cwd <dir>          Working directory for --launch            (default: .)
  --config <path>      EDN policy file (required for restricted mode)
  --help               Show this help

Connection modes:
  Port number (default: 7888 if nothing else specified):
    repl-agent --mode dev --port 7888

  Port file (re-read on every start — works with Emacs/CIDER):
    repl-agent --mode dev --port-file /path/to/project/.nrepl-port

  Managed REPL (repl-agent starts the process):
    repl-agent --mode dev --launch "clj -M:dev" --cwd /path/to/project
    repl-agent --mode dev --launch "lein repl :start" --cwd ./backend

  Production:
    repl-agent --mode restricted --port 7889 --config ./prod-policy.edn
`);
}

function parseMode(raw: string): Mode {
  switch (raw) {
    case "dev":        return Mode.Dev;
    case "readonly":   return Mode.Readonly;
    case "restricted": return Mode.Restricted;
    default:
      throw new Error(`Unknown mode "${raw}". Valid modes: dev, readonly, restricted`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode:        { type: "string",  default: "dev" },
      host:        { type: "string",  default: "127.0.0.1" },
      port:        { type: "string" },
      "port-file": { type: "string" },
      launch:      { type: "string" },
      cwd:         { type: "string",  default: "." },
      config:      { type: "string" },
      help:        { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const mode = parseMode(values.mode!);

  if (mode === Mode.Restricted && !values.config) {
    console.error("--config <path> is required when --mode restricted");
    process.exit(1);
  }

  const portFile = values["port-file"];
  const connectionFlags = [values.launch, values.port, portFile].filter(Boolean).length;

  if (connectionFlags > 1) {
    console.error("Use only one of: --launch, --port, --port-file");
    process.exit(1);
  }

  // --port-file: read the port number from file (e.g. .nrepl-port written by clj/lein)
  if (portFile) {
    let raw: string;
    try {
      raw = readFileSync(resolve(portFile), "utf-8").trim();
    } catch {
      console.error(`Cannot read port file: ${portFile}`);
      process.exit(1);
    }
    values.port = raw;
  }

  if (!values.launch && !values.port) {
    // Default: connect to port 7888
    values.port = "7888";
  }

  const host = values.host!;

  // ── Managed REPL mode ──────────────────────────────────────────────────
  if (values.launch) {
    const cwd = resolve(values.cwd!);
    let launchResult;
    try {
      launchResult = await launchRepl(values.launch, cwd);
    } catch (err) {
      console.error(`Fatal: ${(err as Error).message}`);
      process.exit(1);
    }

    const config: ServerConfig = { mode, host, port: launchResult.port, launchCwd: cwd };
    if (values.config) config.configPath = values.config;

    await startServer(config, launchResult.process);
    return;
  }

  // ── External REPL mode ─────────────────────────────────────────────────
  const port = parseInt(values.port!, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${values.port}`);
    process.exit(1);
  }

  const config: ServerConfig = { mode, host, port };
  if (values.config) config.configPath = values.config;

  await startServer(config);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
