// REPL process launcher.
// Spawns a user-supplied command (e.g. "clj -M:dev:nrepl"), then detects the
// nREPL port either from the .nrepl-port file that lein/clj create automatically
// or by scanning the process stdout for the standard nREPL startup line.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface LaunchResult {
  port: number;
  process: ChildProcess;
}

// Patterns that nREPL prints on startup — both lein and clj flavours.
const PORT_PATTERNS = [
  /nrepl:\/\/[\w.]+:(\d+)/,               // nrepl://127.0.0.1:7888
  /nREPL server started on port\s+(\d+)/i, // nREPL server started on port 7888
  /Started nREPL server on port\s+(\d+)/i,
];

function extractPort(line: string): number | null {
  for (const re of PORT_PATTERNS) {
    const m = re.exec(line);
    if (m?.[1]) return parseInt(m[1], 10);
  }
  return null;
}

// Validate that the command string is not empty.
function validateCommand(cmd: string): void {
  if (!cmd.trim()) throw new Error("Launch command must not be empty");
}

// Poll the .nrepl-port file until it appears, then read it.
async function waitForPortFile(
  portFile: string,
  intervalMs: number,
  deadlineMs: number
): Promise<number | null> {
  while (Date.now() < deadlineMs) {
    if (existsSync(portFile)) {
      const raw = readFileSync(portFile, "utf-8").trim();
      const port = parseInt(raw, 10);
      if (!isNaN(port) && port > 0) return port;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function launchRepl(
  command: string,
  cwd: string,
  timeoutMs = 60_000
): Promise<LaunchResult> {
  console.error(`[launcher] cwd: ${cwd}`);
  console.error(`[launcher] command: ${command}`);

  validateCommand(command);
  const portFile = join(cwd, ".nrepl-port");
  const deadline = Date.now() + timeoutMs;

  // Pass the whole command string to the shell so it handles quoting/PATH.
  // shell:true is required on Windows where clj/lein are batch scripts.
  // Using spawn(cmd, options) — no args array — avoids the shell-injection
  // deprecation warning that fires when args are passed alongside shell:true.
  const proc = spawn(command, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  proc.on("error", (err) => {
    console.error(`[launcher] process error: ${err.message}`);
  });

  // Stream process output to our stderr and scan for port.
  let portFromStdout: number | null = null;

  const scanStream = (stream: NodeJS.ReadableStream, tag: string): void => {
    stream.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      process.stderr.write(`[repl${tag}] ${text}`);
      if (portFromStdout === null) {
        for (const line of text.split(/\r?\n/)) {
          const p = extractPort(line);
          if (p !== null) { portFromStdout = p; }
        }
      }
    });
  };

  if (proc.stdout) scanStream(proc.stdout, "");
  if (proc.stderr) scanStream(proc.stderr, "/err");

  // Race: .nrepl-port file vs stdout pattern vs timeout.
  const port = await Promise.race([
    waitForPortFile(portFile, 500, deadline),
    new Promise<number | null>((resolve) => {
      const interval = setInterval(() => {
        if (portFromStdout !== null) {
          clearInterval(interval);
          resolve(portFromStdout);
        }
        if (Date.now() >= deadline) {
          clearInterval(interval);
          resolve(null);
        }
      }, 200);
    }),
  ]);

  if (port === null) {
    proc.kill();
    throw new Error(
      `nREPL did not start within ${timeoutMs / 1000}s. ` +
        `Check that the command is correct and deps are available.`
    );
  }

  console.error(`[launcher] nREPL ready on port ${port}`);
  return { port, process: proc };
}
