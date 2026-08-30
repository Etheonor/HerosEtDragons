import { describe, it, expect } from "vitest";
import {
  isClientMessage,
  isServerMessage,
  isSnapshot,
  isClientMessageValid,
  isServerMessageValid,
} from "./protocol";

describe("isClientMessage", () => {
  it("matches token.move", () => {
    const msg = { type: "token.move", tokenId: "a", x: 50, y: 50 };
    expect(isClientMessage(msg, "token.move")).toBe(true);
  });

  it("does not match wrong type", () => {
    const msg = { type: "token.move", tokenId: "a", x: 50, y: 50 };
    expect(isClientMessage(msg, "char.hp")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isClientMessage(null, "token.move")).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isClientMessage("hello", "token.move")).toBe(false);
    expect(isClientMessage(42, "token.move")).toBe(false);
  });

  it("matches chat.say", () => {
    const msg = { type: "chat.say", text: "hello" };
    expect(isClientMessage(msg, "chat.say")).toBe(true);
  });

  it("matches dice.roll", () => {
    const msg = { type: "dice.roll", sides: 20, n: 1, mod: 0 };
    expect(isClientMessage(msg, "dice.roll")).toBe(true);
  });

  it("matches inv.give (money)", () => {
    const msg = { type: "inv.give", from: "a", to: "b", money: { po: 1, pa: 0, pc: 0 } };
    expect(isClientMessage(msg, "inv.give")).toBe(true);
  });

  it("matches mode.set", () => {
    const msg = { type: "mode.set", mode: "combat" };
    expect(isClientMessage(msg, "mode.set")).toBe(true);
  });

  it("matches fog.reveal", () => {
    const msg = { type: "fog.reveal", x: 50, y: 50 };
    expect(isClientMessage(msg, "fog.reveal")).toBe(true);
  });
});

describe("isServerMessage", () => {
  it("matches snapshot", () => {
    const msg = { type: "snapshot", state: {}, journalTail: [], presence: [] };
    expect(isServerMessage(msg, "snapshot")).toBe(true);
  });

  it("matches journal", () => {
    const msg = { type: "journal", entry: { id: 1, ts: 0, kind: "say", text: "hi" } };
    expect(isServerMessage(msg, "journal")).toBe(true);
  });

  it("matches error", () => {
    const msg = { type: "error", code: "NOPE", msg: "Nope" };
    expect(isServerMessage(msg, "error")).toBe(true);
  });

  it("does not match wrong type", () => {
    const msg = { type: "error", code: "NOPE", msg: "Nope" };
    expect(isServerMessage(msg, "journal")).toBe(false);
  });
});

describe("isSnapshot", () => {
  it("returns true for a snapshot message", () => {
    const msg = { type: "snapshot", state: {}, journalTail: [], presence: [] };
    expect(isSnapshot(msg)).toBe(true);
  });

  it("returns false for a non-snapshot message", () => {
    const msg = { type: "journal", entry: {} };
    expect(isSnapshot(msg)).toBe(false);
  });
});

describe("isClientMessageValid", () => {
  it("validates a known client message type", () => {
    expect(isClientMessageValid({ type: "token.move", tokenId: "a", x: 1, y: 2 })).toBe(true);
    expect(isClientMessageValid({ type: "token.put", charId: "a", x: 1, y: 2 })).toBe(true);
    expect(isClientMessageValid({ type: "chat.say", text: "hi" })).toBe(true);
    expect(isClientMessageValid({ type: "combat.next" })).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isClientMessageValid({ type: "unknown.thing" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isClientMessageValid(null)).toBe(false);
    expect(isClientMessageValid("string")).toBe(false);
    expect(isClientMessageValid(42)).toBe(false);
    expect(isClientMessageValid(undefined)).toBe(false);
  });

  it("rejects objects without type", () => {
    expect(isClientMessageValid({ foo: "bar" })).toBe(false);
  });
});

describe("isServerMessageValid", () => {
  it("validates known server message types", () => {
    expect(isServerMessageValid({ type: "snapshot" })).toBe(true);
    expect(isServerMessageValid({ type: "delta", patch: {} })).toBe(true);
    expect(isServerMessageValid({ type: "error", code: "X", msg: "Y" })).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isServerMessageValid({ type: "unknown" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isServerMessageValid(null)).toBe(false);
    expect(isServerMessageValid("string")).toBe(false);
  });
});
