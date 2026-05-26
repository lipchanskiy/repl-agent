// TCP client for nREPL. Handles bencode framing and message routing by id.
import net from "node:net";
import { encode, decodeAt, IncompleteDataError, type BencodeDict } from "./bencode.js";
import { parseResponse, type NReplResponse } from "./types.js";

export type PendingHandler = {
  onMessage: (msg: NReplResponse) => void;
  onError: (err: Error) => void;
};

export class NReplClient {
  private socket: net.Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pending = new Map<string, PendingHandler>();
  private connected = false;

  async connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();

      sock.once("connect", () => {
        this.connected = true;
        resolve();
      });

      sock.once("error", (err) => {
        reject(new Error(`nREPL connect failed: ${err.message}`));
      });

      sock.on("data", (chunk: Buffer) => this.handleData(chunk));
      sock.on("close", () => this.handleClose());
      sock.on("error", (err) => {
        // Post-connect errors go to all pending handlers
        if (this.connected) this.handleClose(err);
      });

      this.socket = sock;
      sock.connect(port, host);
    });
  }

  send(msg: BencodeDict): void {
    if (!this.socket || !this.connected) {
      throw new Error("nREPL client is not connected");
    }
    this.socket.write(encode(msg));
  }

  register(id: string, handler: PendingHandler): void {
    this.pending.set(id, handler);
  }

  unregister(id: string): void {
    this.pending.delete(id);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket || !this.connected) {
        resolve();
        return;
      }
      // Forcibly destroy after 3 s if the server does not close gracefully.
      const timer = setTimeout(() => this.socket?.destroy(), 3_000);
      this.socket.once("close", () => { clearTimeout(timer); resolve(); });
      this.socket.end();
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let offset = 0;
    while (offset < this.buffer.length) {
      try {
        const [val, newOffset] = decodeAt(this.buffer, offset);
        offset = newOffset;
        this.dispatch(parseResponse(val as Record<string, unknown>));
      } catch (err) {
        if (err instanceof IncompleteDataError) break;
        // Protocol error — destroy the socket
        this.socket?.destroy(
          err instanceof Error ? err : new Error(String(err))
        );
        break;
      }
    }
    this.buffer = this.buffer.slice(offset);
  }

  private dispatch(msg: NReplResponse): void {
    const id = msg.id;
    if (id !== undefined) {
      this.pending.get(id)?.onMessage(msg);
    }
  }

  private handleClose(err?: Error): void {
    this.connected = false;
    const closeErr = err ?? new Error("nREPL connection closed");
    for (const handler of this.pending.values()) {
      handler.onError(closeErr);
    }
    this.pending.clear();
  }
}
