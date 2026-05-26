# repl-agent

An MCP server that gives AI agents direct access to a live Clojure nREPL session.

Instead of the write → compile → read loop, the agent lives inside your running
system — evaluating expressions, inspecting state, and building code
incrementally. All `eval` calls share one persistent session: a `def` made in
one call is available in the next, just like typing into a REPL yourself.

---

## Table of contents

- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Clojure project setup](#clojure-project-setup)
- [Connecting to a REPL](#connecting-to-a-repl)
- [Configuring your AI tool](#configuring-your-ai-tool)
  - [Claude Code](#claude-code)
  - [GitHub Copilot (VS Code)](#github-copilot-vs-code)
  - [GitHub Copilot CLI](#github-copilot-cli)
  - [OpenCode](#opencode)
- [Access modes](#access-modes)
- [Tools reference](#tools-reference)
- [Restricted mode and policy files](#restricted-mode-and-policy-files)
- [Pair programming: agent + Emacs in the same REPL](#pair-programming-agent--emacs-in-the-same-repl)
- [Troubleshooting](#troubleshooting)

---

## How it works

```
AI agent (Claude / Copilot / OpenCode)
        │  MCP protocol (stdio)
        ▼
  repl-agent
        │  nREPL / bencode (TCP)
        ▼
  Your Clojure process
```

repl-agent is a thin adapter. It does not embed a JVM — it connects to an
nREPL server that is already running, or starts one for you.

---

## Prerequisites

- **Node.js** ≥ 18
- **Clojure CLI** (`clj`) or **Leiningen** (`lein`) — only needed with `--launch`

---

## Installation

```bash
npm install -g repl-agent
repl-agent --help
```

### Testing a local build without publishing

```bash
npm install
npm run build
npm link          # makes "repl-agent" available globally from this directory
repl-agent --help
```

After `npm link`, rebuilding (`npm run build`) picks up changes immediately —
no need to re-link.

To use a local build in an MCP config without `npm link`, point directly at the
built file:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/repl-agent/dist/index.js", "--mode", "dev", "--launch", "clj -M:dev"]
}
```

---

## Clojure project setup

Add nREPL as a dev dependency so repl-agent can connect to it.

> **JDK 21+**: always include `-Djdk.attach.allowAttachSelf` in `:jvm-opts`.
> Without it, any call to `interrupt` (from the agent or from CIDER) will crash
> the nREPL process with an error about JVMTI.

### deps.edn — minimal

```clojure
{:aliases
 {:dev {:extra-deps {nrepl/nrepl {:mvn/version "1.7.0"}}
        :jvm-opts   ["-Djdk.attach.allowAttachSelf"]
        :main-opts  ["-m" "nrepl.cmdline"]}}}
```

`nrepl.cmdline` starts the server, writes `.nrepl-port` for automatic port
detection, and accepts `--middleware` flags.

### deps.edn — with CIDER middleware

repl-agent works identically with or without CIDER middleware — it uses only
standard nREPL ops. Add `cider-nrepl` only if you also use Emacs / CIDER; the
middleware enables CIDER features like auto-complete and jump-to-definition.

```clojure
{:aliases
 {:dev {:extra-deps {nrepl/nrepl      {:mvn/version "1.7.0"}
                    cider/cider-nrepl {:mvn/version "0.59.0"}}
        :jvm-opts   ["-Djdk.attach.allowAttachSelf"]
        :main-opts  ["-m" "nrepl.cmdline"
                     "--middleware" "[cider.nrepl/cider-middleware]"]}}}
```

### Leiningen — project.clj

```clojure
(defproject myapp "0.1.0-SNAPSHOT"
  :profiles
  {:dev {:dependencies [[nrepl "1.7.0"]
                        [cider/cider-nrepl "0.59.0"]]
         :jvm-opts     ["-Djdk.attach.allowAttachSelf"]
         :repl-options {:nrepl-middleware [cider.nrepl/cider-middleware]}}})
```

---

## Connecting to a REPL

repl-agent supports three ways to find the nREPL port. You pick one and put it
in your AI tool's MCP config — repl-agent is always started by the tool, not
manually.

### `--launch` — repl-agent starts the REPL

repl-agent runs the given command in `--cwd`, waits for the nREPL to start,
then connects. Port is detected automatically from `.nrepl-port` or the
process output — you never specify it manually.

Use when no REPL is running yet.

### `--port-file` — connect to an existing REPL

repl-agent reads the port from the specified `.nrepl-port` file at startup.
`clj`, `lein`, and Emacs's `cider-jack-in` all write this file automatically.

Use when Emacs / CIDER already has the REPL running and you want the agent to
share the same JVM. The file is re-read on every repl-agent start, so the
config stays valid across REPL restarts.

### `--port` — fixed port

repl-agent connects to the given port directly. Use when the port is set
explicitly in your REPL startup config and never changes.

---

## Configuring your AI tool

Each AI tool reads an MCP server list from a config file and starts repl-agent
automatically as a subprocess — you never run repl-agent manually.

---

### Claude Code

Claude Code supports both **project-level** and **global** MCP config.

#### Project-level — `.claude/mcp.json` in your Clojure project root

The working directory is the project root, so relative paths work.

No Emacs, repl-agent starts the REPL:

```json
{
  "mcpServers": {
    "repl": {
      "command": "repl-agent",
      "args": ["--mode", "dev", "--launch", "clj -M:dev"]
    }
  }
}
```

Emacs/CIDER already running the REPL:

```json
{
  "mcpServers": {
    "repl": {
      "command": "repl-agent",
      "args": ["--mode", "dev", "--port-file", ".nrepl-port"]
    }
  }
}
```

#### Global — `~/.claude/settings.json`

Add under the `"mcpServers"` key. Use absolute paths — the working directory
is not the project root in global config.

```json
{
  "mcpServers": {
    "repl": {
      "command": "repl-agent",
      "args": ["--mode", "dev", "--port-file", "/absolute/path/to/project/.nrepl-port"]
    }
  }
}
```

#### Via CLI

```bash
claude mcp add repl -- repl-agent --mode dev --launch "clj -M:dev"
```

See [`examples/claude-mcp.json`](examples/claude-mcp.json) for a ready-to-copy
template.

---

### GitHub Copilot (VS Code)

GitHub Copilot in VS Code supports **project-level** MCP config via
`.vscode/mcp.json`. For global config, add servers through VS Code Settings UI
(`github.copilot.mcpServers`).

#### Project-level — `.vscode/mcp.json` in your Clojure project root

No Emacs, repl-agent starts the REPL:

```json
{
  "servers": {
    "repl": {
      "type": "stdio",
      "command": "repl-agent",
      "args": ["--mode", "dev", "--launch", "clj -M:dev"]
    }
  }
}
```

Emacs/CIDER already running the REPL (VS Code exposes `${workspaceFolder}`):

```json
{
  "servers": {
    "repl": {
      "type": "stdio",
      "command": "repl-agent",
      "args": ["--mode", "dev", "--port-file", "${workspaceFolder}/.nrepl-port"]
    }
  }
}
```

For a monorepo where the Clojure service is in a subdirectory:

```json
{
  "servers": {
    "repl": {
      "type": "stdio",
      "command": "repl-agent",
      "args": ["--mode", "dev", "--launch", "clj -M:dev",
               "--cwd", "${workspaceFolder}/backend"]
    }
  }
}
```

If `clj` or `lein` is not found, see
[PATH problems](#clj--lein-not-found-when-launched-from-the-ai-tool).

See [`examples/vscode-mcp.json`](examples/vscode-mcp.json) for a ready-to-copy
template.

---

### GitHub Copilot CLI

> **Global config only.** GitHub Copilot CLI does not support project-level MCP
> configuration. All servers are defined in `~/.copilot/mcp-config.json` and
> apply to every project you work in.

Because the config is global, always use `--port-file` or `--launch` with
`--cwd`, both with absolute paths.

Emacs/CIDER already running the REPL (recommended):

```json
{
  "mcpServers": {
    "repl": {
      "type": "local",
      "command": "repl-agent",
      "args": ["--mode", "dev",
               "--port-file", "/absolute/path/to/project/.nrepl-port"]
    }
  }
}
```

No Emacs, repl-agent starts the REPL:

```json
{
  "mcpServers": {
    "repl": {
      "type": "local",
      "command": "repl-agent",
      "args": ["--mode", "dev",
               "--launch", "clj -M:dev",
               "--cwd", "/absolute/path/to/project"]
    }
  }
}
```

Manage servers interactively inside Copilot CLI with `/mcp add` and `/mcp show`.

See [`examples/copilot-cli-mcp.json`](examples/copilot-cli-mcp.json) for a
ready-to-copy template.

---

### OpenCode

OpenCode supports both **project-level** and **global** MCP config.

#### Project-level — `opencode.json` in your Clojure project root

```json
{
  "mcp": {
    "repl": {
      "type": "local",
      "command": "repl-agent",
      "args": ["--mode", "dev", "--launch", "clj -M:dev"]
    }
  }
}
```

#### Global — `~/.config/opencode/opencode.json`

Use absolute paths — the working directory is not the project root in global
config.

```json
{
  "mcp": {
    "repl": {
      "type": "local",
      "command": "repl-agent",
      "args": ["--mode", "dev",
               "--port-file", "/absolute/path/to/project/.nrepl-port"]
    }
  }
}
```

See [`examples/opencode.json`](examples/opencode.json) for a ready-to-copy
template.

---

## Access modes

Select a mode with `--mode`. It controls which tools are available and how
strictly `eval` expressions are checked.

### `dev` — full access

No restrictions. All tools are available. Use this for local development.

### `readonly` — inspection only

`eval` is allowed for pure read expressions. Dangerous top-level forms — `def`,
`defn`, `ns`, `require`, `import`, and others — are blocked before reaching the
REPL. `load_namespace` and `run_tests` are not registered.

### `restricted` — production diagnostics

Designed for connecting to a live production REPL. `eval` accepts only
expressions whose leading form is in an explicit allowlist defined in a policy
file. Every eval attempt is written to an audit log.

```bash
repl-agent --mode restricted --host prod.internal --port 7889 \
  --config /etc/repl-agent/prod-policy.edn
```

`--config` is required in restricted mode. See
[Restricted mode and policy files](#restricted-mode-and-policy-files).

---

## Tools reference

| Tool | dev | readonly | restricted | Description |
|---|:---:|:---:|:---:|---|
| `eval` | ✓ | guarded | allowlist | Evaluate a Clojure expression |
| `load_namespace` | ✓ | — | — | Load or reload a namespace from source |
| `run_tests` | ✓ | — | — | Run `clojure.test` suites |
| `interrupt` | ✓ | ✓ | ✓ | Interrupt the current evaluation |
| `list_namespaces` | ✓ | ✓ | ✓ | List all loaded namespaces |
| `ns_publics` | ✓ | ✓ | ✓ | Public vars in a namespace with metadata |
| `get_var` | ✓ | ✓ | ✓ | Inspect a var: value, metadata, source |
| `get_session_info` | ✓ | ✓ | ✓ | Current ns, Clojure version, JVM, mode |

### `eval` input

| Parameter | Type | Description |
|---|---|---|
| `code` | string (required) | Clojure expression to evaluate |
| `ns` | string | Evaluate in this namespace (default: current) |
| `timeout_ms` | number | Abort after N ms (default: 10 000; capped in restricted mode) |

### `eval` output

```
=> <printed value>
stdout:
<anything printed to *out*>
error: <exception class>
ns: <current namespace after eval>
```

---

## Restricted mode and policy files

A policy file is an EDN map that controls what the agent may do. Pass its path
with `--config`.

```clojure
;; prod-policy.edn
{:allowed-forms   ["count" "keys" "vals" "class" "type" "meta"
                   "get" "get-in" "select-keys"
                   "clojure.core/deref" "clojure.core/realized?"
                   "clojure.repl/doc" "clojure.repl/source"]
 :max-timeout-ms  3000
 :log-all-evals   true
 :log-path        "/var/log/repl-agent/evals.log"}
```

See [`examples/prod-policy.edn`](examples/prod-policy.edn) for a full
annotated example.

**Always blocked** regardless of `allowed-forms`:
`def`, `defn`, `defmacro`, `ns`, `in-ns`, `require`, `use`, `import`, `eval`,
`load`, `load-file`, `System/exit`, `shutdown-agents`.

**Audit log format** — one JSON object per line:

```
{"ts":"2026-01-15T10:23:01Z","mode":"restricted","code":"(count items)","status":"ok","result":"42"}
{"ts":"2026-01-15T10:23:05Z","mode":"restricted","code":"(def x 1)","status":"blocked","reason":"Form \"def\" is not allowed"}
```

---

## Pair programming: agent + Emacs in the same REPL

Both approaches below give you one shared JVM — the agent and the developer see
the same state, the same `def`s, the same atoms. Each client gets an isolated
nREPL session (separate `*ns*`, separate interrupts).

```
Emacs/CIDER ── session A ──┐
                            ├── one nREPL server, one JVM
repl-agent  ── session B ──┘
```

### Emacs starts the REPL (recommended)

1. In Emacs: `M-x cider-jack-in`. CIDER starts the nREPL and writes `.nrepl-port`.
2. In your MCP config, use `--port-file` pointing at that file.
3. repl-agent connects to the same process on next tool start.

### repl-agent starts the REPL

1. Use `--launch` in your MCP config. repl-agent starts the nREPL.
2. In Emacs: `M-x cider-connect`, enter `localhost` and the port shown in the
   tool's MCP log.

---

## Troubleshooting

### nREPL crashes on `interrupt` with JDK 21+

```
ERROR: Cannot stop thread on JDK21+ without -Djdk.attach.allowAttachSelf enabled
*** Closed ***
```

JDK 21 restricts thread interruption via JVMTI. Add the flag inside the `:dev`
alias (not at the top level):

```clojure
;; deps.edn
{:aliases
 {:dev { ...
         :jvm-opts ["-Djdk.attach.allowAttachSelf"]}}}

;; project.clj
{:profiles
 {:dev { ...
         :jvm-opts ["-Djdk.attach.allowAttachSelf"]}}}
```

Then restart the REPL.

---

### "Connection refused"

The nREPL is not running or is on a different port.

```bash
# macOS / Linux
lsof -i :7888

# Windows
netstat -ano | findstr 7888
```

With `--port-file`, verify the file contains the correct port and that the
process is still running.

---

### `--launch` times out

repl-agent waited 60 seconds and gave up. Common causes:

- **Wrong command** — run it directly in a terminal first to confirm it works.
- **First-run download** — Clojure fetches nREPL from Maven on the first run,
  which can take over a minute. Run `clj -M:dev` once manually, then retry.
- **Wrong `--cwd`** — the directory must contain `deps.edn` or `project.clj`.

---

### `clj` / `lein` not found when launched from the AI tool

The MCP client may start repl-agent with a restricted PATH. Fix with an `env`
entry in the config.

**Claude Code** (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "repl": {
      "command": "repl-agent",
      "args": ["--mode", "dev", "--launch", "clj -M:dev"],
      "env": { "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "repl": {
      "type": "stdio",
      "command": "repl-agent",
      "args": ["--mode", "dev", "--launch", "clj -M:dev"],
      "env": { "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" }
    }
  }
}
```

**Copilot CLI** (`~/.copilot/mcp-config.json`) supports the same `env` field.

On macOS with Homebrew: `clj` is at `/opt/homebrew/bin/clj`.  
On Linux (official installer): `/usr/local/bin/clj`.

---

### `repl-agent: command not found`

The npm global bin directory is not in the MCP client's PATH. Use `node` with
an absolute path to the built file:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/repl-agent/dist/index.js",
           "--mode", "dev", "--launch", "clj -M:dev"]
}
```

Find the path on macOS/Linux:

```bash
which repl-agent
readlink $(which repl-agent)
```

On Windows:

```powershell
(Get-Command repl-agent).Source
```

---

### Verifying the server starts correctly

```bash
# macOS / Linux
repl-agent --mode dev --launch "clj -M:dev" 2>&1 | head -5

# Windows (PowerShell)
repl-agent --mode dev --launch "clj -M:dev" 2>&1 | Select-Object -First 5
```

Expected output:

```
[launcher] cwd: /your/project
[launcher] command: clj -M:dev
[launcher] nREPL ready on port 54321
[repl-agent] mode=dev nrepl=127.0.0.1:54321 cwd=/your/project
[repl-agent] MCP server ready (stdio)
```

---

## License

MIT
