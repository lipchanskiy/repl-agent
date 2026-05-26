// nREPL wire protocol types.
// All messages are bencode dicts; known fields typed here for convenience.

export interface NReplResponse {
  readonly id?: string;
  readonly session?: string;
  readonly ns?: string;
  readonly value?: string;
  readonly out?: string;
  readonly err?: string;
  readonly ex?: string;
  readonly "root-ex"?: string;
  readonly status?: readonly string[];
  readonly "new-session"?: string;
  // describe / info ops
  readonly versions?: Record<string, Record<string, string>>;
}

// Narrows a raw bencode dict (Record<string, unknown>) to NReplResponse.
// With exactOptionalPropertyTypes we must omit fields rather than set them to undefined.
export function parseResponse(raw: Record<string, unknown>): NReplResponse {
  const r: Record<string, unknown> = {};
  if (typeof raw["id"]          === "string") r["id"]          = raw["id"];
  if (typeof raw["session"]     === "string") r["session"]     = raw["session"];
  if (typeof raw["ns"]          === "string") r["ns"]          = raw["ns"];
  if (typeof raw["value"]       === "string") r["value"]       = raw["value"];
  if (typeof raw["out"]         === "string") r["out"]         = raw["out"];
  if (typeof raw["err"]         === "string") r["err"]         = raw["err"];
  if (typeof raw["ex"]          === "string") r["ex"]          = raw["ex"];
  if (typeof raw["root-ex"]     === "string") r["root-ex"]     = raw["root-ex"];
  if (typeof raw["new-session"] === "string") r["new-session"] = raw["new-session"];
  const status = raw["status"];
  if (Array.isArray(status)) {
    r["status"] = status.filter((s): s is string => typeof s === "string");
  }
  return r as NReplResponse;
}
