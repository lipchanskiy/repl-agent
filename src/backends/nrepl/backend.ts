// NREPLBackend: implements REPLBackend over a live Clojure nREPL server.
import { NReplClient } from "./client.js";
import { NReplSession } from "./session.js";
import {
  parseEDN,
  ednToStringArray,
  parseVarInfoList,
  parseVarDetail,
  parseSessionInfoEDN,
  parseTestResult,
} from "../../format.js";
import type {
  REPLBackend,
  BackendCapabilities,
  ConnectionConfig,
  EvalOptions,
  EvalResult,
  LoadResult,
  VarInfo,
  VarDetail,
  SessionInfo,
  TestResult,
} from "../interface.js";

// Allowlist pattern for Clojure namespace/symbol names.
// Rejects parentheses, quotes, and other characters that could break
// the S-expressions we interpolate these values into.
const SAFE_SYMBOL_RE = /^[a-zA-Z!?_*+<>=][a-zA-Z0-9!?_*+<>=.\-]*(?:\/[a-zA-Z!?_*+<>=][a-zA-Z0-9!?_*+<>=.\-]*)?$/;

function assertSafeSymbol(value: string, label: string): void {
  if (!SAFE_SYMBOL_RE.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

export class NREPLBackend implements REPLBackend {
  readonly name = "nrepl";
  readonly capabilities: BackendCapabilities = {
    canReload: true,
    canRunTests: true,
    canInterrupt: true,
    supportsMetadata: true,
  };

  private client: NReplClient | null = null;
  private session: NReplSession | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const client = new NReplClient();
    await client.connect(config.host, config.port);
    const session = await NReplSession.create(client);
    this.client = client;
    this.session = session;
    console.error(
      `[nrepl] Connected to ${config.host}:${config.port}, session ${session.getSessionId()}`
    );
  }

  async disconnect(): Promise<void> {
    await this.session?.close();
    await this.client?.disconnect();
    this.session = null;
    this.client = null;
  }

  async eval(code: string, opts?: EvalOptions): Promise<EvalResult> {
    const r = await this.requireSession().eval(code, opts);
    const result: EvalResult = { stdout: r.out, stderr: r.err };
    if (r.value !== undefined) result.value = r.value;
    if (r.error !== undefined) result.error = r.error;
    if (r.ns    !== undefined) result.ns    = r.ns;
    return result;
  }

  async loadNamespace(ns: string, reload = false): Promise<LoadResult> {
    assertSafeSymbol(ns, "namespace");
    const qualifier = reload ? " :reload" : "";
    const code = `(require '${ns}${qualifier})`;
    const r = await this.requireSession().eval(code, { timeoutMs: 30_000 });
    const result: LoadResult = { success: !r.error, warnings: [] };
    if (r.error !== undefined) result.error = r.error;
    return result;
  }

  async listNamespaces(): Promise<string[]> {
    const code = `(vec (sort (map str (all-ns))))`;
    const r = await this.requireSession().eval(code);
    if (r.error || r.value === undefined) {
      throw new Error(`nREPL listNamespaces failed: ${r.error}`);
    }
    return ednToStringArray(parseEDN(r.value));
  }

  async nsPublics(ns: string): Promise<VarInfo[]> {
    assertSafeSymbol(ns, "namespace");
    const code =
      `(mapv (fn [[k v]] {:name (str k)` +
      ` :arglists (str (:arglists (meta v)))` +
      ` :doc (or (:doc (meta v)) "")` +
      ` :line (:line (meta v))` +
      ` :file (or (:file (meta v)) "")})` +
      ` (ns-publics '${ns}))`;
    const r = await this.requireSession().eval(code);
    if (r.error || r.value === undefined) {
      throw new Error(`nREPL nsPublics failed: ${r.error}`);
    }
    return parseVarInfoList(r.value);
  }

  async getVar(sym: string): Promise<VarDetail> {
    assertSafeSymbol(sym, "symbol");
    const code =
      `(let [s '${sym} v (resolve s)]` +
      ` (if v` +
      `   {:value (pr-str @v)` +
      `    :meta  (pr-str (meta v))` +
      `    :source (try (clojure.repl/source-fn s) (catch Throwable _ nil))}` +
      `   {:error "Var not found"}))`;
    const r = await this.requireSession().eval(code);
    if (r.error || r.value === undefined) {
      throw new Error(`nREPL getVar failed: ${r.error}`);
    }
    return parseVarDetail(r.value);
  }

  async interrupt(): Promise<void> {
    await this.requireSession().interrupt();
  }

  async getSessionInfo(mode: string): Promise<SessionInfo> {
    const code =
      `{:ns (str *ns*)` +
      ` :clojure-version (clojure-version)` +
      ` :jvm-version (System/getProperty "java.version")}`;
    const r = await this.requireSession().eval(code);
    if (r.error || r.value === undefined) {
      throw new Error(`nREPL getSessionInfo failed: ${r.error}`);
    }
    return parseSessionInfoEDN(r.value, mode, this.session?.getSessionId());
  }

  async runTests(ns?: string): Promise<TestResult> {
    if (ns !== undefined) assertSafeSymbol(ns, "namespace");
    const target = ns ? `'${ns}` : `(all-ns)`;
    const code = ns
      ? `(do (require 'clojure.test) (clojure.test/run-tests '${ns}))`
      : `(do (require 'clojure.test) (apply clojure.test/run-tests (all-ns)))`;
    const r = await this.requireSession().eval(code, { timeoutMs: 120_000 });
    if (r.error || r.value === undefined) {
      throw new Error(`nREPL runTests failed: ${r.error} (target: ${target})`);
    }
    return parseTestResult(r.value);
  }

  private requireSession(): NReplSession {
    if (!this.session) throw new Error("nREPL backend is not connected");
    return this.session;
  }
}
