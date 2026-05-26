// nREPL session: clone, eval, interrupt, close.
// One session per MCP server instance — state persists across evals.
import { randomUUID } from "node:crypto";
import { type NReplClient } from "./client.js";
import type { NReplResponse } from "./types.js";

export interface NReplEvalOptions {
  ns?: string;
  timeoutMs?: number;
}

export interface NReplEvalResult {
  value?: string;
  out: string;
  err: string;
  ex?: string;
  ns?: string;
  error?: string; // set when status contains eval-error
}

export class NReplSession {
  private currentEvalId: string | null = null;

  private constructor(
    private readonly client: NReplClient,
    private readonly sessionId: string
  ) {}

  // Clone a new session from the root session.
  static async create(
    client: NReplClient,
    timeoutMs = 10_000
  ): Promise<NReplSession> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        client.unregister(id);
        reject(new Error(`nREPL session clone timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      client.register(id, {
        onMessage(msg: NReplResponse) {
          const newSession = msg["new-session"];
          if (newSession) {
            clearTimeout(timer);
            client.unregister(id);
            resolve(new NReplSession(client, newSession));
            return;
          }
          if (msg.status?.includes("error")) {
            clearTimeout(timer);
            client.unregister(id);
            reject(new Error("nREPL clone failed"));
          }
        },
        onError(err) {
          clearTimeout(timer);
          reject(new Error(`nREPL clone failed: ${err.message}`));
        },
      });
      client.send({ op: "clone", id });
    });
  }

  async eval(
    code: string,
    opts: NReplEvalOptions = {}
  ): Promise<NReplEvalResult> {
    const id = randomUUID();
    const timeoutMs = opts.timeoutMs ?? 10_000;
    this.currentEvalId = id;

    return new Promise((resolve, reject) => {
      const acc: NReplEvalResult = { out: "", err: "" };
      // nREPL sends eval-error and done in separate messages — track across both
      let hadEvalError = false;

      const timer = setTimeout(() => {
        this.client.unregister(id);
        this.currentEvalId = null;
        reject(new Error(`nREPL eval timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const msg: Record<string, string> = {
        op: "eval",
        code,
        session: this.sessionId,
        id,
      };
      if (opts.ns) msg["ns"] = opts.ns;

      this.client.register(id, {
        onMessage: (rsp: NReplResponse) => {
          if (rsp.value !== undefined) acc.value = rsp.value;
          if (rsp.out) acc.out += rsp.out;
          if (rsp.err) acc.err += rsp.err;
          if (rsp.ex) acc.ex = rsp.ex;
          if (rsp.ns) acc.ns = rsp.ns;

          // eval-error arrives before done — track it across messages
          if (
            rsp.status?.includes("eval-error") ||
            rsp.status?.includes("error")
          ) {
            hadEvalError = true;
          }

          if (rsp.status?.includes("done")) {
            clearTimeout(timer);
            this.client.unregister(id);
            this.currentEvalId = null;
            if (hadEvalError) {
              acc.error = acc.ex ?? (acc.err || "Evaluation error");
            }
            resolve(acc);
          }
        },
        onError: (err: Error) => {
          clearTimeout(timer);
          this.currentEvalId = null;
          reject(err);
        },
      });

      this.client.send(msg);
    });
  }

  async interrupt(): Promise<void> {
    const id = randomUUID();
    const msg: Record<string, string> = {
      op: "interrupt",
      session: this.sessionId,
      id,
    };
    if (this.currentEvalId) msg["interrupt-id"] = this.currentEvalId;

    return new Promise((resolve) => {
      this.client.register(id, {
        onMessage: (rsp: NReplResponse) => {
          if (rsp.status?.includes("done")) {
            this.client.unregister(id);
            resolve();
          }
        },
        onError: () => resolve(), // best-effort
      });
      this.client.send(msg);
    });
  }

  async close(): Promise<void> {
    const id = randomUUID();
    return new Promise((resolve) => {
      this.client.register(id, {
        onMessage: (rsp: NReplResponse) => {
          if (rsp.status?.includes("done")) {
            this.client.unregister(id);
            resolve();
          }
        },
        onError: () => resolve(),
      });
      this.client.send({ op: "close", session: this.sessionId, id });
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
