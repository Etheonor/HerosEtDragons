import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "./ws-validation";

describe("clientMessageSchema", () => {
  it("accepte un message valide de chaque type", () => {
    const samples = [
      { type: "chat.say", text: "Bonjour" },
      { type: "dice.roll", sides: 20, n: 2, mod: 3 },
      { type: "char.hp", charId: "c1", delta: -7 },
      { type: "char.condition", charId: "c1", cond: "Terrorisé", on: true },
      { type: "token.move", tokenId: "t1", x: 42, y: 58 },
      { type: "token.put", charId: "c1", x: 10, y: 20 },
      { type: "token.remove", charId: "c1" },
      { type: "npc.duplicate", charId: "c1" },
      { type: "npc.addFromTemplate", templateId: "t1", x: 5, y: 5, count: 3 },
      { type: "npc.saveAsTemplate", charId: "c1" },
      { type: "npc.add", name: "Gobelin", pv: 7, ca: 15, init: 2 },
      { type: "npc.remove", charId: "c1" },
      { type: "map.select", mapId: "m1" },
      { type: "marker.set", x: 1, y: 2, text: "piège" },
      { type: "marker.move", id: "mk1", x: 3, y: 4 },
      { type: "marker.remove", id: "mk1" },
      { type: "marker.clear" },
      { type: "fog.enable" },
      { type: "fog.reveal", x: 50, y: 50 },
      { type: "fog.cover" },
      { type: "fog.disable" },
      { type: "ping", x: 12, y: 34 },
      { type: "mode.set", mode: "combat" },
      { type: "initiative.roll", charId: "c1" },
      { type: "combat.next" },
      { type: "inv.add", charId: "c1", item: "Corde", qty: 2 },
      { type: "inv.drop", charId: "c1", item: "Corde" },
      { type: "inv.give", from: "c1", to: "c2", money: { po: 1, pa: 0, pc: 0 } },
    ] as const;
    for (const s of samples) {
      const res = clientMessageSchema.safeParse(s);
      expect(res.success, `${s.type} doit être accepté`).toBe(true);
    }
  });

  it("applique les defaults (dice.roll sans mod/drop, npc.add sans nom)", () => {
    const dice = clientMessageSchema.safeParse({ type: "dice.roll", sides: 6, n: 2 });
    expect(dice.success).toBe(true);
    if (dice.success) {
      expect(dice.data).toMatchObject({ mod: 0, drop: 0 });
    }

    const npc = clientMessageSchema.safeParse({ type: "npc.add", pv: 5, ca: 12 });
    expect(npc.success).toBe(true);
    if (npc.success) {
      expect(npc.data).toMatchObject({ name: "PNJ", init: 0, saveAsTemplate: false });
    }
  });

  it("refuse un type inconnu", () => {
    const res = clientMessageSchema.safeParse({ type: "chat.teleport", x: 1 });
    expect(res.success).toBe(false);
  });

  it("refuse des dés hors bornes (DoS CPU)", () => {
    const res = clientMessageSchema.safeParse({ type: "dice.roll", sides: 20, n: 10_000 });
    expect(res.success).toBe(false);
  });

  it("refuse un drop supérieur à n-1", () => {
    const res = clientMessageSchema.safeParse({ type: "dice.roll", sides: 6, n: 4, drop: 4 });
    expect(res.success).toBe(false);
  });

  it("refuse des coordonnées non numériques (NaN/Infinity)", () => {
    const nan = clientMessageSchema.safeParse({ type: "token.move", tokenId: "t", x: NaN, y: 5 });
    expect(nan.success).toBe(false);
    const inf = clientMessageSchema.safeParse({ type: "ping", x: Infinity, y: 0 });
    expect(inf.success).toBe(false);
  });

  it("refuse un message de chat trop long (DoS D1)", () => {
    const res = clientMessageSchema.safeParse({ type: "chat.say", text: "a".repeat(2001) });
    expect(res.success).toBe(false);
  });

  it("refuse un char.hp hors bornes", () => {
    const res = clientMessageSchema.safeParse({ type: "char.hp", charId: "c", delta: 500 });
    expect(res.success).toBe(false);
  });

  it("refuse un mode.set inconnu", () => {
    const res = clientMessageSchema.safeParse({ type: "mode.set", mode: "ambush" });
    expect(res.success).toBe(false);
  });

  it("refuse une condition vide ou géante", () => {
    const empty = clientMessageSchema.safeParse({
      type: "char.condition",
      charId: "c",
      cond: "",
      on: true,
    });
    expect(empty.success).toBe(false);
    const huge = clientMessageSchema.safeParse({
      type: "char.condition",
      charId: "c",
      cond: "x".repeat(41),
      on: true,
    });
    expect(huge.success).toBe(false);
  });
});
