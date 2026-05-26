import { describe, it, expect } from "vitest";
import { checkEval } from "../src/permissions/eval-guard.js";
import { Mode } from "../src/permissions/mode.js";
import type { Policy } from "../src/permissions/policy.js";

const POLICY: Policy = {
  allowedForms: ["count", "keys", "vals", "clojure.repl/doc"],
  allowedNsRead: [],
  blockedNs: [],
  maxTimeoutMs: 3000,
  logAllEvals: true,
  logPath: "/tmp/test.log",
};

describe("checkEval — dev mode", () => {
  it("allows everything in dev", () => {
    expect(checkEval("(def x 1)", Mode.Dev, null).allowed).toBe(true);
    expect(checkEval("(require 'clojure.string)", Mode.Dev, null).allowed).toBe(true);
    expect(checkEval("(System/exit 0)", Mode.Dev, null).allowed).toBe(true);
  });
});

describe("checkEval — readonly mode", () => {
  it("allows pure expressions", () => {
    expect(checkEval("(count [1 2 3])", Mode.Readonly, null).allowed).toBe(true);
    expect(checkEval("(+ 1 2)", Mode.Readonly, null).allowed).toBe(true);
    expect(checkEval("42", Mode.Readonly, null).allowed).toBe(true);
  });

  it("blocks def and ns mutations", () => {
    expect(checkEval("(def x 1)", Mode.Readonly, null).allowed).toBe(false);
    expect(checkEval("(defn foo [] 1)", Mode.Readonly, null).allowed).toBe(false);
    expect(checkEval("(ns myapp.core)", Mode.Readonly, null).allowed).toBe(false);
    expect(checkEval("(require 'clojure.string)", Mode.Readonly, null).allowed).toBe(false);
  });
});

describe("checkEval — restricted mode", () => {
  it("allows forms in the allowlist", () => {
    expect(checkEval("(count [1 2 3])", Mode.Restricted, POLICY).allowed).toBe(true);
    expect(checkEval("(keys {:a 1})", Mode.Restricted, POLICY).allowed).toBe(true);
    expect(checkEval("(clojure.repl/doc count)", Mode.Restricted, POLICY).allowed).toBe(true);
  });

  it("blocks forms not in allowlist", () => {
    const r = checkEval("(println \"hello\")", Mode.Restricted, POLICY);
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.reason).toMatch(/println/);
  });

  it("always blocks dangerous forms even if listed", () => {
    const policyWithDef = { ...POLICY, allowedForms: ["def", "count"] };
    expect(checkEval("(def x 1)", Mode.Restricted, policyWithDef).allowed).toBe(false);
    expect(checkEval("(require 'foo)", Mode.Restricted, policyWithDef).allowed).toBe(false);
  });

  it("allows non-list expressions (literals)", () => {
    expect(checkEval("42", Mode.Restricted, POLICY).allowed).toBe(true);
    expect(checkEval('"hello"', Mode.Restricted, POLICY).allowed).toBe(true);
    expect(checkEval(":keyword", Mode.Restricted, POLICY).allowed).toBe(true);
  });

  it("returns reason string when blocked", () => {
    const r = checkEval("(println \"x\")", Mode.Restricted, POLICY);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toContain("println");
      expect(r.reason).toContain("allowed-forms");
    }
  });
});
