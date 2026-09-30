import { describe, expect, it } from "vitest";
import { HOTKEYS, hotkeyIdFromEvent, hotkeysForRole } from "./hotkeys";

/**
 * Événement factice : les tests unitaires tournent en Node, sans DOM. On ne
 * reproduit que les propriétés lues par `hotkeyIdFromEvent`.
 */
function ev(
  key: string,
  init: Partial<KeyboardEvent> = {},
  target: { tagName?: string; isContentEditable?: boolean } | null = null,
): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
    target,
    ...init,
  } as unknown as KeyboardEvent;
}

describe("hotkeys — table déclarative", () => {
  it("les ids sont uniques", () => {
    const ids = HOTKEYS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("résout une touche de lettre, insensible à la casse", () => {
    expect(hotkeyIdFromEvent(ev("v"), { isMj: true })).toBe("tool.move");
    expect(hotkeyIdFromEvent(ev("V"), { isMj: true })).toBe("tool.move");
  });

  it("distingue espace, ? et /", () => {
    expect(hotkeyIdFromEvent(ev(" "), { isMj: false })).toBe("palette.open");
    expect(hotkeyIdFromEvent(ev("?"), { isMj: false })).toBe("help.open");
    expect(hotkeyIdFromEvent(ev("/"), { isMj: false })).toBe("chat.focus");
  });

  it("filtre les raccourcis MJ pour un joueur", () => {
    expect(hotkeyIdFromEvent(ev("v"), { isMj: false })).toBeNull();
    expect(hotkeyIdFromEvent(ev("1"), { isMj: false })).toBeNull();
    expect(hotkeyIdFromEvent(ev("h"), { isMj: false })).toBe("map.hand");
  });

  it("ignore les modificateurs, la composition et la répétition", () => {
    expect(hotkeyIdFromEvent(ev("v", { ctrlKey: true }), { isMj: true })).toBeNull();
    expect(hotkeyIdFromEvent(ev("v", { metaKey: true }), { isMj: true })).toBeNull();
    expect(hotkeyIdFromEvent(ev("v", { altKey: true }), { isMj: true })).toBeNull();
    expect(hotkeyIdFromEvent(ev("v", { isComposing: true }), { isMj: true })).toBeNull();
    expect(hotkeyIdFromEvent(ev("v", { repeat: true }), { isMj: true })).toBeNull();
  });

  it("est muet dans un champ de saisie et sous un overlay", () => {
    expect(hotkeyIdFromEvent(ev("v", {}, { tagName: "INPUT" }), { isMj: true })).toBeNull();
    expect(hotkeyIdFromEvent(ev("v", {}, { isContentEditable: true }), { isMj: true })).toBeNull();
    expect(hotkeyIdFromEvent(ev("v"), { isMj: true, overlayOpen: true })).toBeNull();
  });

  it("l'aide est filtrée par rôle et sans groupe vide", () => {
    const mj = hotkeysForRole(true).flatMap((g) => g.items.map((i) => i.id));
    const player = hotkeysForRole(false).flatMap((g) => g.items.map((i) => i.id));
    expect(mj).toContain("tool.fog");
    expect(player).not.toContain("tool.fog");
    expect(player).toContain("palette.open");
    expect(hotkeysForRole(false).every((g) => g.items.length > 0)).toBe(true);
  });
});
