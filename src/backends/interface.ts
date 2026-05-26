// REPLBackend abstraction — all backends implement this interface.
// v1: NREPLBackend (Clojure). v2 planned: SwankBackend (Common Lisp).

export interface ConnectionConfig {
  host: string;
  port: number;
}

export interface EvalOptions {
  ns?: string;
  timeoutMs?: number;
}

export interface EvalResult {
  value?: string;  // printed representation of the result
  stdout: string;
  stderr: string;
  error?: string;  // exception message + class when eval-error
  ns?: string;     // current ns after eval
}

export interface LoadResult {
  success: boolean;
  error?: string;
  warnings: string[];
}

export interface VarInfo {
  name: string;
  arglists?: string;
  doc?: string;
  line?: number;
  file?: string;
}

export interface VarDetail {
  value?: string;   // pr-str of the var's value
  meta?: string;    // pr-str of the var's metadata
  source?: string;  // source code if available
  error?: string;
}

export interface SessionInfo {
  ns: string;
  clojureVersion: string;
  jvmVersion: string;
  mode: string;
  sessionId?: string;
}

export interface TestCaseResult {
  ns: string;
  name: string;
  status: "pass" | "fail" | "error";
  message?: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  errors: number;
  results: TestCaseResult[];
}

export interface BackendCapabilities {
  canReload: boolean;
  canRunTests: boolean;
  canInterrupt: boolean;
  supportsMetadata: boolean;
}

export interface REPLBackend {
  readonly name: string;
  readonly capabilities: BackendCapabilities;

  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;

  eval(code: string, opts?: EvalOptions): Promise<EvalResult>;
  loadNamespace(ns: string, reload?: boolean): Promise<LoadResult>;
  listNamespaces(): Promise<string[]>;
  nsPublics(ns: string): Promise<VarInfo[]>;
  getVar(sym: string): Promise<VarDetail>;
  interrupt(): Promise<void>;
  getSessionInfo(mode: string): Promise<SessionInfo>;
  runTests(ns?: string): Promise<TestResult>;
}
