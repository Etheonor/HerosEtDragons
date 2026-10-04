/**
 * Registre de commandes de la command palette.
 *
 * Les commandes sont fournies par un « provider » (la page table) : elles
 * dépendent de l'état vivant (outil actif, taille de grille, réglages) et
 * doivent donc être relues à chaque ouverture plutôt que figées à l'enregistrement.
 * Le registre garde l'API `register`/`unregister` demandée par le plan.
 */

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  mjOnly?: boolean;
  /** Raccourci affiché dans un <kbd>. */
  shortcut?: string;
  /** Valeur courante affichée à droite (ex. « 32 px », « actif »). */
  badge?: string;
  /** Commande cochée / active. */
  active?: boolean;
  run: () => void;
}

type Provider = () => PaletteCommand[];

class CommandRegistry {
  private providers = $state<{ id: string; fn: Provider }[]>([]);

  /** Enregistre un fournisseur ; le dernier enregistrement du même id gagne. */
  register(id: string, fn: Provider): void {
    this.providers = [...this.providers.filter((p) => p.id !== id), { id, fn }];
  }

  unregister(id: string): void {
    this.providers = this.providers.filter((p) => p.id !== id);
  }

  /** Toutes les commandes visibles pour ce rôle, dans l'ordre d'enregistrement. */
  list(isMj: boolean): PaletteCommand[] {
    return this.providers
      .flatMap((p) => p.fn())
      .filter((c) => !c.mjOnly || isMj)
      .filter((c, index, all) => all.findIndex((o) => o.id === c.id) === index);
  }
}

export const commandRegistry = new CommandRegistry();
