// SwankBackend stub — planned for v2 (Common Lisp / SBCL via SLIME swank protocol).
// Not implemented in v1.
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

export class SwankBackend implements REPLBackend {
  readonly name = "swank";
  readonly capabilities: BackendCapabilities = {
    canReload: true,
    canRunTests: false,
    canInterrupt: true,
    supportsMetadata: true,
  };

  private notImplemented(): never {
    throw new Error("SwankBackend is not implemented in v1");
  }

  connect(_config: ConnectionConfig): Promise<void> { return this.notImplemented(); }
  disconnect(): Promise<void> { return this.notImplemented(); }
  eval(_code: string, _opts?: EvalOptions): Promise<EvalResult> { return this.notImplemented(); }
  loadNamespace(_ns: string, _reload?: boolean): Promise<LoadResult> { return this.notImplemented(); }
  listNamespaces(): Promise<string[]> { return this.notImplemented(); }
  nsPublics(_ns: string): Promise<VarInfo[]> { return this.notImplemented(); }
  getVar(_sym: string): Promise<VarDetail> { return this.notImplemented(); }
  interrupt(): Promise<void> { return this.notImplemented(); }
  getSessionInfo(_mode: string): Promise<SessionInfo> { return this.notImplemented(); }
  runTests(_ns?: string): Promise<TestResult> { return this.notImplemented(); }
}
