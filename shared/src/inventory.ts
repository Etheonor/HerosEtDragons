// ═══════════════════════════════════════════════════════════
// RollWith H&D — Inventaire & échanges (R9)
// Fonctions pures : fusion, transferts, validation de solde.
// Pas de conversion automatique entre monnaies (R9.2).
// ═══════════════════════════════════════════════════════════

export interface Money {
  po: number;
  pa: number;
  pc: number;
}

export interface Item {
  name: string;
  qty: number;
}

export interface Inventory {
  items: Item[];
  money: Money;
}

export function addItem(inv: Inventory, name: string, qty: number): Inventory {
  if (qty <= 0) throw new Error(`Quantité invalide: ${qty}`);

  const lowerName = name.toLowerCase();
  const existingIdx = inv.items.findIndex((i) => i.name.toLowerCase() === lowerName);

  if (existingIdx >= 0) {
    const items = [...inv.items];
    items[existingIdx] = { ...items[existingIdx]!, qty: items[existingIdx]!.qty + qty };
    return { ...inv, items };
  }

  return { ...inv, items: [...inv.items, { name, qty }] };
}

export function removeItem(inv: Inventory, name: string): Inventory {
  const lowerName = name.toLowerCase();
  const idx = inv.items.findIndex((i) => i.name.toLowerCase() === lowerName);

  if (idx < 0) throw new Error(`Objet introuvable: ${name}`);

  const item = inv.items[idx]!;
  if (item.qty <= 1) {
    const items = inv.items.filter((_, i) => i !== idx);
    return { ...inv, items };
  }

  const items = [...inv.items];
  items[idx] = { ...item, qty: item.qty - 1 };
  return { ...inv, items };
}

export function transferItem(from: Inventory, to: Inventory, name: string): [Inventory, Inventory] {
  const lowerName = name.toLowerCase();
  const idx = from.items.findIndex((i) => i.name.toLowerCase() === lowerName);

  if (idx < 0) throw new Error(`Objet introuvable dans la source: ${name}`);

  const item = from.items[idx]!;
  const newFrom = removeItem(from, name);
  const newTo = addItem(to, item.name, 1);

  return [newFrom, newTo];
}

export function canAfford(source: Money, amount: Money): boolean {
  return source.po >= amount.po && source.pa >= amount.pa && source.pc >= amount.pc;
}

export function transferMoney(from: Money, to: Money, amount: Money): [Money, Money] {
  if (!canAfford(from, amount)) {
    throw new Error("Fonds insuffisants (pas de conversion entre monnaies)");
  }

  const newFrom: Money = {
    po: from.po - amount.po,
    pa: from.pa - amount.pa,
    pc: from.pc - amount.pc,
  };

  const newTo: Money = {
    po: to.po + amount.po,
    pa: to.pa + amount.pa,
    pc: to.pc + amount.pc,
  };

  return [newFrom, newTo];
}
