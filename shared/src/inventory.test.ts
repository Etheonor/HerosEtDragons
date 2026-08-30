import { describe, it, expect } from "vitest";
import {
  addItem,
  removeItem,
  transferItem,
  canAfford,
  transferMoney,
  type Money,
  type Inventory,
} from "./inventory";

function inv(
  items: { name: string; qty: number }[] = [],
  money: Money = { po: 0, pa: 0, pc: 0 },
): Inventory {
  return { items: items.map((i) => ({ name: i.name, qty: i.qty })), money };
}

describe("addItem (fusion par nom insensible à la casse)", () => {
  it("adds a new item", () => {
    const result = addItem(inv([]), "Épée longue", 1);
    expect(result.items).toEqual([{ name: "Épée longue", qty: 1 }]);
  });

  it("merges with existing item (same case)", () => {
    const result = addItem(inv([{ name: "Corde", qty: 1 }]), "Corde", 2);
    expect(result.items).toEqual([{ name: "Corde", qty: 3 }]);
  });

  it("merges case-insensitively (Corde + corde)", () => {
    const result = addItem(inv([{ name: "Corde", qty: 1 }]), "corde", 2);
    expect(result.items).toEqual([{ name: "Corde", qty: 3 }]);
  });

  it("merges case-insensitively (ÉPÉE + épée)", () => {
    const result = addItem(inv([{ name: "ÉPÉE", qty: 1 }]), "épée", 1);
    expect(result.items).toEqual([{ name: "ÉPÉE", qty: 2 }]);
  });

  it("preserves the original name casing on merge", () => {
    const result = addItem(inv([{ name: "Corde de soie", qty: 1 }]), "CORDE DE SOIE", 1);
    expect(result.items[0]!.name).toBe("Corde de soie");
    expect(result.items[0]!.qty).toBe(2);
  });

  it("does not merge different items", () => {
    const result = addItem(inv([{ name: "Corde", qty: 1 }]), "Épée", 1);
    expect(result.items).toHaveLength(2);
  });

  it("throws for qty <= 0", () => {
    expect(() => addItem(inv([]), "Corde", 0)).toThrow();
    expect(() => addItem(inv([]), "Corde", -1)).toThrow();
  });
});

describe("removeItem", () => {
  it("removes one unit (qty decremented)", () => {
    const result = removeItem(inv([{ name: "Flèche", qty: 10 }]), "flèche");
    expect(result.items).toEqual([{ name: "Flèche", qty: 9 }]);
  });

  it("removes the item entirely when qty reaches 0", () => {
    const result = removeItem(inv([{ name: "Flèche", qty: 1 }]), "flèche");
    expect(result.items).toEqual([]);
  });

  it("is case-insensitive", () => {
    const result = removeItem(inv([{ name: "Flèche", qty: 5 }]), "FLÈCHE");
    expect(result.items).toEqual([{ name: "Flèche", qty: 4 }]);
  });

  it("throws if item does not exist", () => {
    expect(() => removeItem(inv([]), "Flèche")).toThrow();
    expect(() => removeItem(inv([{ name: "Corde", qty: 1 }]), "Flèche")).toThrow();
  });
});

describe("transferItem", () => {
  it("moves one unit from from to to", () => {
    const from = inv([{ name: "Potion", qty: 3 }]);
    const to = inv([{ name: "Potion", qty: 1 }]);
    const [newFrom, newTo] = transferItem(from, to, "potion");
    expect(newFrom.items).toEqual([{ name: "Potion", qty: 2 }]);
    expect(newTo.items).toEqual([{ name: "Potion", qty: 2 }]);
  });

  it("merges case-insensitively on the receiving side", () => {
    const from = inv([{ name: "Corde", qty: 2 }]);
    const to = inv([{ name: "corde", qty: 1 }]);
    const [newFrom, newTo] = transferItem(from, to, "corde");
    expect(newFrom.items).toEqual([{ name: "Corde", qty: 1 }]);
    expect(newTo.items).toEqual([{ name: "corde", qty: 2 }]);
  });

  it("throws if item not in source", () => {
    expect(() => transferItem(inv([]), inv([]), "Potion")).toThrow();
  });
});

describe("canAfford", () => {
  it("returns true when enough in each currency (no conversion)", () => {
    expect(canAfford({ po: 10, pa: 5, pc: 3 }, { po: 5, pa: 2, pc: 1 })).toBe(true);
  });

  it("returns false when not enough po (no conversion from pa)", () => {
    expect(canAfford({ po: 5, pa: 100, pc: 0 }, { po: 10, pa: 0, pc: 0 })).toBe(false);
  });

  it("returns false when not enough pa (no conversion from pc)", () => {
    expect(canAfford({ po: 0, pa: 5, pc: 100 }, { po: 0, pa: 10, pc: 0 })).toBe(false);
  });

  it("returns false when not enough pc", () => {
    expect(canAfford({ po: 0, pa: 0, pc: 5 }, { po: 0, pa: 0, pc: 10 })).toBe(false);
  });

  it("returns true when amount is zero", () => {
    expect(canAfford({ po: 0, pa: 0, pc: 0 }, { po: 0, pa: 0, pc: 0 })).toBe(true);
  });

  it("returns true when source has exactly the amount", () => {
    expect(canAfford({ po: 5, pa: 3, pc: 2 }, { po: 5, pa: 3, pc: 2 })).toBe(true);
  });
});

describe("transferMoney", () => {
  it("transfers money and updates both sides", () => {
    const from: Money = { po: 10, pa: 5, pc: 3 };
    const to: Money = { po: 0, pa: 0, pc: 0 };
    const [newFrom, newTo] = transferMoney(from, to, { po: 3, pa: 2, pc: 1 });
    expect(newFrom).toEqual({ po: 7, pa: 3, pc: 2 });
    expect(newTo).toEqual({ po: 3, pa: 2, pc: 1 });
  });

  it("throws if insufficient funds (no conversion)", () => {
    const from: Money = { po: 2, pa: 100, pc: 0 };
    const to: Money = { po: 0, pa: 0, pc: 0 };
    expect(() => transferMoney(from, to, { po: 5, pa: 0, pc: 0 })).toThrow();
  });

  it("handles zero transfer", () => {
    const from: Money = { po: 10, pa: 5, pc: 3 };
    const to: Money = { po: 1, pa: 1, pc: 1 };
    const [newFrom, newTo] = transferMoney(from, to, { po: 0, pa: 0, pc: 0 });
    expect(newFrom).toEqual(from);
    expect(newTo).toEqual(to);
  });

  it("transfers all money", () => {
    const from: Money = { po: 10, pa: 5, pc: 3 };
    const to: Money = { po: 0, pa: 0, pc: 0 };
    const [newFrom, newTo] = transferMoney(from, to, { po: 10, pa: 5, pc: 3 });
    expect(newFrom).toEqual({ po: 0, pa: 0, pc: 0 });
    expect(newTo).toEqual({ po: 10, pa: 5, pc: 3 });
  });

  it("does not convert pc to pa (no automatic conversion)", () => {
    const from: Money = { po: 0, pa: 0, pc: 100 };
    const to: Money = { po: 0, pa: 0, pc: 0 };
    expect(() => transferMoney(from, to, { po: 0, pa: 1, pc: 0 })).toThrow();
  });
});
