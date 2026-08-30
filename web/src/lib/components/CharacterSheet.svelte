<script lang="ts">
  import {
    CARAC_LABELS,
    CARAC_NAMES,
    getMod,
    getProficiency,
    getSaveBonus,
    getSkillBonus,
    getPassivePerception,
    getInitiativeBonus,
    getShowSpells,
    getSpellSaveDc,
    getSpellAttackBonus,
    formatMod,
    getLevelFromXp,
    getNextXpThreshold,
    SKILLS,
    SKILL_CARAC,
    type CaracKey,
  } from '$lib/char-utils';
  import type { CharacterDetail, CharacterSheet } from '$lib/api';
  import BlockLabel from '$lib/ds/BlockLabel.svelte';
  import { api } from '$lib/api';

  let {
    char,
    onRoll,
    onPvDelta,
  }: {
    char: CharacterDetail;
    /** Présent quand la feuille est connectée à la table (WS) : les jets
     *  passent par le serveur et alimentent le journal (R10.2). */
    onRoll?: (mod: number, label: string) => void;
    onPvDelta?: (delta: number) => void;
  } = $props();

  let sheet = $state<CharacterSheet>(char.sheet);
  let pv = $state(char.pv);
  let pvTemp = $state(char.pvTemp);
  let loading = $state(false);

  const caracs: CaracKey[] = ['for', 'dex', 'con', 'int', 'sag', 'cha'];
  const saveNames: Record<CaracKey, string> = {
    for: 'Force',
    dex: 'Dextérité',
    con: 'Constitution',
    int: 'Intelligence',
    sag: 'Sagesse',
    cha: 'Charisme',
  };

  $effect(() => {
    sheet = char.sheet;
    pv = char.pv;
    pvTemp = char.pvTemp;
  });

  let pvPct = $derived(Math.max(0, Math.min(100, (pv / char.pvMax) * 100)));

  function adjustPv(delta: number) {
    if (!char.canEdit) return;
    if (onPvDelta) {
      onPvDelta(delta);
      return;
    }
    pvRest(delta);
  }

  async function pvRest(delta: number) {
    if (loading) return;
    loading = true;
    try {
      const res = await api.characters.updatePv(char.id, delta);
      pv = res.pv;
    } catch {
      /* ignore for now */
    }
    loading = false;
  }



  async function toggleInspiration() {
    if (loading || !char.canEdit) return;
    loading = true;
    try {
      const res = await api.characters.toggleInspiration(char.id);
      sheet = { ...sheet, inspiration: res.inspiration };
    } catch {
      /* ignore */
    }
    loading = false;
  }

  function rollWith(mod: number, label: string) {
    if (onRoll) onRoll(mod, label);
  }

  function onCaracClick(carac: CaracKey) {
    rollWith(getMod(sheet, carac), `Test de ${CARAC_LABELS[carac].toLowerCase()}`);
  }
  function onSaveClick(carac: CaracKey) {
    rollWith(getSaveBonus(sheet, carac), `Sauvegarde de ${saveNames[carac].toLowerCase()}`);
  }
  function onSkillClick(skill: (typeof SKILLS)[number]) {
    rollWith(getSkillBonus(sheet, skill), `${skill}`);
  }
  function onInitClick() {
    const bonus = getInitiativeBonus(sheet) ?? 0;
    rollWith(bonus, "Initiative");
  }
  function onAttackClick(atkId: string) {
    const atk = sheet.attaques.find((a) => a.id === atkId);
    if (atk) rollWith(atk.bonus, `Attaque — ${atk.name}`);
  }
</script>

<div class="sheet">
  <!-- Barre haute -->
  <header class="sheet-header">
    <a href="/" class="back-btn">← retour à la table</a>
    <div class="header-title">Feuille de personnage</div>
    <div class="header-hint">Cliquez sur une carac, une compétence ou une attaque pour lancer le dé</div>
    <div class="grow"></div>
    <span class="hdr-meta">Héros & Dragons · DRS</span>
  </header>

  <!-- En-tête personnage -->
  <div class="char-header-wrap">
    <div class="char-header">
      <div class="char-name-col">
        <div class="char-name">{sheet.identite.nom}</div>
        <div class="char-citation">« {sheet.identite.citation ?? ''} »</div>
      </div>
      <div class="char-divider"></div>
      <div class="char-meta-grid">
        <div class="char-meta-item">
          <div class="meta-label">Classe & niveau</div>
          <div class="meta-value">{sheet.identite.classe} {sheet.identite.niveau}</div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Race</div>
          <div class="meta-value">{sheet.identite.race}</div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Historique</div>
          <div class="meta-value">{sheet.identite.historique}</div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Alignement</div>
          <div class="meta-value">{sheet.identite.alignement}</div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Points d'expérience</div>
          <div class="meta-value">
            {sheet.identite.xp.toLocaleString('fr')} <span class="meta-sub">/ {getNextXpThreshold(sheet.identite.xp).toLocaleString('fr')}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Corps 4 colonnes -->
  <div class="sheet-body">
    <!-- ── Colonne 1: Caractéristiques ── -->
    <div class="col col-caracs">
      {#each caracs as c, i (c)}
        <div
          class="carac-card"
          style="border-radius: var({['--sketchy-1', '--sketchy-2', '--sketchy-3', '--sketchy-4', '--sketchy-5', '--sketchy-6'][i % 6]});"
          onclick={() => onCaracClick(c)}
          title="Lancer un test"
        >
          <div class="carac-label">{CARAC_LABELS[c]}</div>
          <div class="carac-mod">{formatMod(getMod(sheet, c))}</div>
          <div class="carac-value">{sheet.caracs[c]}</div>
        </div>
      {/each}

      <div
        class="inspi-card"
        class:on={sheet.inspiration}
        onclick={toggleInspiration}
      >
        <div class="mini-label">INSPIRATION</div>
        <div class="inspi-value">{sheet.inspiration ? 'Oui' : '—'}</div>
      </div>

      <div class="mastery-card">
        <div class="mini-label">MAÎTRISE</div>
        <div class="mastery-value">{formatMod(getProficiency(sheet))}</div>
      </div>
    </div>

    <!-- ── Colonne 2: Sauvegardes + Compétences ── -->
    <div class="col col-skills">
      <div class="block saves-block">
        <BlockLabel text="Sauvegardes" />
        {#each caracs as c (c)}
          <div class="save-row" onclick={() => onSaveClick(c)}>
            <span class="dot" class:prof={sheet.saveProficiencies[c]}>{sheet.saveProficiencies[c] ? '●' : '○'}</span>
            <span class="save-name">{saveNames[c]}</span>
            <span class="save-bonus">{formatMod(getSaveBonus(sheet, c))}</span>
          </div>
        {/each}
      </div>

      <div class="block skills-block">
        <BlockLabel text="Compétences" />
        {#each SKILLS as skill (skill)}
          <div class="skill-row" onclick={() => onSkillClick(skill)}>
            <span class="dot" class:prof={sheet.skillProficiencies[skill] ?? false}>{(sheet.skillProficiencies[skill] ?? false) ? '●' : '○'}</span>
            <span class="skill-name">
              {skill}
              <span class="skill-ab">{SKILL_CARAC[skill].toUpperCase()}</span>
            </span>
            <span class="skill-bonus">{formatMod(getSkillBonus(sheet, skill))}</span>
          </div>
        {/each}
      </div>

      <div class="pp-block">
        <span class="pp-label">Perception passive</span>
        <span class="pp-value">{getPassivePerception(sheet)}</span>
      </div>

      <div class="langues-block">
        <div class="langues-title">Langues & maîtrises</div>
        <div class="langues-text">{sheet.languesEtMaitrises}</div>
      </div>
    </div>

    <!-- ── Colonne 3: Combat ── -->
    <div class="col col-combat">
      <div class="combat-stats">
        <div class="stat-card" style="border-radius: var(--sketchy-3);">
          <div class="mini-label">CA</div>
          <div class="stat-value big">{sheet.ca}</div>
        </div>
        <div class="stat-card clickable" style="border-radius: var(--sketchy-6);" onclick={onInitClick} title="Lancer l'initiative">
          <div class="mini-label">INITIATIVE</div>
          <div class="stat-value big accent">{formatMod(getInitiativeBonus(sheet))}</div>
        </div>
        <div class="stat-card" style="border-radius: var(--sketchy-8);">
          <div class="mini-label">VITESSE</div>
          <div class="stat-value big">{sheet.vitesse}</div>
        </div>
      </div>

      <div class="pv-block">
        <BlockLabel text="Points de vie" />
        <div class="pv-bar-row">
          <div class="pv-bar-bg">
            <div class="pv-bar-fill" style="width: {pvPct}%;"></div>
          </div>
          {#if char.canEdit}
            <button class="pv-btn minus" onclick={() => adjustPv(-1)} disabled={loading}>−</button>
            <button class="pv-btn plus" onclick={() => adjustPv(1)} disabled={loading}>+</button>
          {/if}
        </div>
        <div class="pv-extras">
          <span>PV {pv} / {char.pvMax}</span>
          <span>PV temporaires : {pvTemp}</span>
          <span>Dés de vie : {sheet.desDeVie.restants}/{sheet.desDeVie.total} × d{sheet.desDeVie.faces}</span>
        </div>
        <div class="death-saves">
          <span class="ds-title">Jets contre la mort</span>
          <span class="ds-sub">réussites</span>
          {#each [0, 1, 2] as i (i)}
            <span class="ds-pip ok" class:filled={i < sheet.deathSaves.successes}>{i < sheet.deathSaves.successes ? '⦿' : '○'}</span>
          {/each}
          <span class="ds-sub ko-margin">échecs</span>
          {#each [0, 1, 2] as i (i)}
            <span class="ds-pip ko" class:filled={i < sheet.deathSaves.failures}>{i < sheet.deathSaves.failures ? '⦿' : '○'}</span>
          {/each}
        </div>
      </div>

      <div class="block attacks-block">
        <BlockLabel text="Attaques" />
        <div class="attacks-header">
          <span>Arme</span>
          <span>Att.</span>
          <span>Dégâts</span>
        </div>
        {#each sheet.attaques as atk (atk.id)}
          <div class="attack-row" onclick={() => onAttackClick(atk.id)} title="Jet d'attaque">
            <span class="atk-name">{atk.name}</span>
            <span class="atk-bonus">{formatMod(atk.bonus)}</span>
            <span class="atk-dmg">{atk.damage}</span>
          </div>
        {/each}
      </div>

      {#if getShowSpells(sheet)}
        <div class="block spells-block">
          <BlockLabel text={`Sorts de ${sheet.identite.classe.toLowerCase()}`} />
          <div class="spell-stats">
            <span>DD sauvegarde <strong>{getSpellSaveDc(sheet)}</strong></span>
            <span>Att. de sort <strong class="accent">{formatMod(getSpellAttackBonus(sheet) ?? 0)}</strong></span>
            <span>Carac. <strong>{sheet.sorts.caracIncantation?.toUpperCase()}</strong></span>
          </div>
          {#each sheet.sorts.emplacements as lv (lv.level)}
            <div class="spell-level">
              <div class="sl-header">
                <span class="sl-level">niveau {lv.level}</span>
                <span class="sl-caption">emplacements :</span>
                {#each Array(lv.max) as _, i (i)}
                  <span class="slot-pip" class:used={i < lv.used}>{i < lv.used ? '⦿' : '○'}</span>
                {/each}
              </div>
              <div class="sl-spells">
                {#each sheet.sorts.connus.filter((s) => s.level === lv.level) as sp (sp.slug)}
                  <span class="spell-chip">{sp.slug.replace(/-/g, ' ')}</span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Colonne 4: Traits & équipement ── -->
    <div class="col col-traits">
      <div class="block traits-block">
        <BlockLabel text="Capacités & traits" />
        {#each sheet.capacites as trait (trait.id)}
          <div class="trait-item">
            <div class="trait-name">{trait.name}</div>
            <div class="trait-desc">{trait.description}</div>
          </div>
        {/each}
      </div>

      <div class="block persona-block">
        <BlockLabel text="Personnalité" />
        {#if sheet.personnalite.traits}
          <div class="persona-item"><span class="persona-key">traits — </span><span class="persona-val">{sheet.personnalite.traits}</span></div>
        {/if}
        {#if sheet.personnalite.ideaux}
          <div class="persona-item"><span class="persona-key">idéal — </span><span class="persona-val">{sheet.personnalite.ideaux}</span></div>
        {/if}
        {#if sheet.personnalite.liens}
          <div class="persona-item"><span class="persona-key">lien — </span><span class="persona-val">{sheet.personnalite.liens}</span></div>
        {/if}
        {#if sheet.personnalite.defauts}
          <div class="persona-item"><span class="persona-key">défaut — </span><span class="persona-val">{sheet.personnalite.defauts}</span></div>
        {/if}
      </div>

      <div class="block equip-block">
        <BlockLabel text="Équipement" />
        <div class="bourse">
          <span>{sheet.equipement.bourse.po} <span class="coin po">po</span></span>
          <span>{sheet.equipement.bourse.pa} <span class="coin pa">pa</span></span>
          <span>{sheet.equipement.bourse.pc} <span class="coin pc">pc</span></span>
        </div>
        <div class="equip-list">
          {#each sheet.equipement.objets as item (item.name)}
            <div class="equip-row">
              <span class="equip-name">{item.name}</span>
              <span class="equip-qty">×{item.qty}</span>
            </div>
          {/each}
        </div>
        <div class="equip-note">Le sac complet se gère depuis l'onglet Inventaire de la table</div>
      </div>
    </div>
  </div>
</div>

<style>
  .sheet {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    padding-bottom: 60px;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 22px;
    border-bottom: 2px solid var(--border);
    background: var(--bg);
  }
  .grow { flex: 1; }
  .back-btn {
    font-size: 13px;
    text-decoration: none;
    border: 2px solid var(--border);
    border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    padding: 5px 13px;
    color: var(--text);
    background: var(--panel);
    transition: background 0.15s, color 0.15s;
  }
  .back-btn:hover {
    background: var(--selected);
    color: var(--heading);
  }
  .header-title {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--heading);
  }
  .header-hint {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--accent-text);
  }
  .hdr-meta {
    font-size: 12px;
    color: var(--text-3);
  }

  .char-header-wrap {
    max-width: 1290px;
    margin: 18px auto 0;
    padding: 0 22px;
  }
  .char-header {
    display: flex;
    align-items: stretch;
    gap: 16px;
    position: relative;
    border: 2px solid var(--border);
    border-radius: var(--sketchy-1);
    background: var(--panel);
    padding: 14px 20px;
  }
  .char-name-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 220px;
  }
  .char-name {
    font-family: var(--font-title);
    font-size: 34px;
    line-height: 1.05;
    color: var(--heading);
  }
  .char-citation {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-2);
  }
  .char-divider {
    width: 2px;
    background: var(--border-soft);
  }
  .char-meta-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px 18px;
    align-content: center;
  }
  .meta-label {
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .meta-value {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--text);
  }
  .meta-sub {
    font-size: 10.5px;
    color: var(--text-3);
    font-weight: 400;
  }

  .sheet-body {
    max-width: 1290px;
    margin: 16px auto 0;
    padding: 0 22px;
    display: grid;
    grid-template-columns: 172px 236px 1fr 1fr;
    gap: 14px;
    align-items: start;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .col-skills, .col-combat, .col-traits { gap: 12px; }

  .mini-label {
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text-2);
    letter-spacing: 0.06em;
  }

  /* ── Colonne 1 ── */
  .carac-card {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 9px 8px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .carac-card:hover {
    border-color: var(--accent-border);
    background: var(--bg);
  }
  .carac-label {
    font-size: 11.5px;
    color: var(--text-2);
    letter-spacing: 0.08em;
  }
  .carac-mod {
    font-family: var(--font-title);
    font-size: 26px;
    color: var(--accent-text);
    line-height: 1;
  }
  .carac-value {
    font-size: 12px;
    color: var(--text-2);
  }

  .inspi-card {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 8px;
    text-align: center;
    cursor: pointer;
  }
  .inspi-card.on {
    background: var(--bg);
  }
  .inspi-value {
    font-family: var(--font-title);
    font-size: 17px;
    line-height: 1.1;
    color: var(--text-3);
  }
  .inspi-card.on .inspi-value {
    color: var(--accent-text);
  }

  .mastery-card {
    border: 2px solid var(--border);
    border-radius: 12px 235px 14px 245px / 235px 12px 255px 14px;
    background: var(--panel);
    padding: 8px;
    text-align: center;
  }
  .mastery-value {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--text);
    line-height: 1.1;
  }

  /* ── Colonne 2 ── */
  .block {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 10px 13px;
    position: relative;
  }
  .saves-block { border-radius: var(--sketchy-5); }
  .skills-block { border-radius: var(--sketchy-3); }

  .save-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    font-size: 13px;
    padding: 2.5px 0;
    border-bottom: 1px dashed var(--border-soft);
    cursor: pointer;
  }
  .save-row:hover { color: var(--accent-text); }
  .save-name { flex: 1; }
  .save-bonus { font-size: 12.5px; }
  .dot { font-size: 12.5px; color: var(--border); }
  .dot.prof { color: var(--accent-text); }

  .skill-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    font-size: 12.5px;
    padding: 2px 0;
    border-bottom: 1px dashed var(--border-soft);
    cursor: pointer;
  }
  .skill-row:hover { color: var(--accent-text); }
  .skill-name { flex: 1; }
  .skill-ab {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--text-3);
  }
  .skill-bonus { font-size: 12.5px; }

  .pp-block {
    border: 2px solid var(--border);
    border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px;
    background: var(--panel);
    padding: 9px 13px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .pp-label { font-size: 12.5px; }
  .pp-value { font-size: 15px; color: var(--heading); }

  .langues-block {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 9px 13px;
  }
  .langues-title { font-size: 13.5px; font-weight: 500; color: var(--text-2); }
  .langues-text { font-size: 12.5px; line-height: 1.55; margin-top: 3px; }

  /* ── Colonne 3: Combat ── */
  .combat-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 9px;
  }
  .stat-card {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 9px 4px;
    text-align: center;
  }
  .stat-card.clickable {
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .stat-card.clickable:hover {
    border-color: var(--accent-border);
    background: var(--bg);
  }
  .stat-value { color: var(--heading); }
  .stat-value.big { font-family: var(--font-title); font-size: 23px; line-height: 1; }
  .stat-value.accent { color: var(--accent-text); }

  .pv-block {
    border: 2px solid var(--border);
    border-radius: var(--sketchy-1);
    background: var(--panel);
    padding: 11px 14px;
    position: relative;
  }
  .pv-bar-row { display: flex; align-items: center; gap: 8px; }
  .pv-bar-bg {
    flex: 1;
    height: 11px;
    border: 2px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--panel);
  }
  .pv-bar-fill {
    height: 100%;
    background: repeating-linear-gradient(-55deg, var(--accent) 0, var(--accent) 4px, var(--accent-hover) 4px, var(--accent-hover) 8px);
  }
  .pv-btn {
    font-family: var(--font-body); font-size: 13px; width: 24px; height: 24px; padding: 0;
    background: var(--panel); border: 2px solid var(--border); color: var(--text-2);
    cursor: pointer; line-height: 1;
  }
  .pv-btn.minus { border-radius: 8px 3px 8px 3px; }
  .pv-btn.minus:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .pv-btn.plus { border-radius: 3px 8px 3px 8px; }
  .pv-btn.plus:hover { border-color: var(--text-2); color: var(--text); }
  .pv-extras {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
    margin-top: 5px;
    flex-wrap: wrap;
  }

  .death-saves {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
    border-top: 1px dashed var(--border-soft);
    padding-top: 7px;
    flex-wrap: wrap;
  }
  .ds-title { font-size: 13px; font-weight: 500; color: var(--text-2); margin-right: 5px; }
  .ds-sub { font-size: 11.5px; color: var(--text-2); }
  .ko-margin { margin-left: 6px; }
  .ds-pip { font-size: 14px; color: var(--border); cursor: pointer; user-select: none; }
  .ds-pip.ok.filled { color: #8ab58d; }
  .ds-pip.ko.filled { color: var(--accent-text); }

  .attacks-block { border-radius: 12px 235px 14px 245px / 235px 12px 255px 14px; }
  .attacks-header {
    display: grid;
    grid-template-columns: 1fr 58px 1fr;
    gap: 8px;
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--border-soft);
  }
  .attack-row {
    display: grid;
    grid-template-columns: 1fr 58px 1fr;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--border-soft);
    font-size: 12.5px;
    cursor: pointer;
    align-items: baseline;
  }
  .attack-row:hover { color: var(--accent-text); }
  .atk-name { font-weight: 600; }
  .atk-bonus { font-size: 12.5px; color: var(--accent-text); }
  .atk-dmg { font-size: 12px; }

  .spells-block { border-radius: var(--sketchy-5); }
  .spell-stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-2);
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 6px;
  }
  .spell-stats strong { color: var(--text); }
  .spell-stats strong.accent { color: var(--accent-text); }
  .spell-level { margin-top: 7px; }
  .sl-header { display: flex; align-items: baseline; gap: 8px; }
  .sl-level { font-size: 13.5px; font-weight: 500; color: var(--text-2); }
  .sl-caption { font-size: 12px; color: var(--text-3); }
  .sl-slots { display: flex; gap: 4px; margin: 4px 0; }
  .slot-pip { font-size: 14px; color: var(--border); cursor: pointer; user-select: none; }
  .slot-pip.used { color: var(--accent-text); }
  .sl-spells { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .spell-chip {
    font-size: 12px;
    padding: 2px 10px;
    border: 2px solid var(--accent-border);
    border-radius: 10px 3px 12px 3px;
    color: var(--accent-text);
    background: var(--bg);
  }

  /* ── Colonne 4 ── */
  .traits-block { border-radius: var(--sketchy-3); }
  .trait-item { padding: 4px 0; border-bottom: 1px dashed var(--border-soft); }
  .trait-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .trait-desc { font-size: 12px; color: var(--text-2); line-height: 1.45; margin-top: 1px; }

  .persona-block { border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px; }
  .persona-item { padding: 3px 0; border-bottom: 1px dashed var(--border-soft); }
  .persona-key { font-size: 13px; font-weight: 500; color: var(--accent-text); }
  .persona-val { font-style: italic; font-size: 12.5px; color: var(--text-2); }

  .equip-block { border-radius: var(--sketchy-5); }
  .bourse {
    display: flex;
    gap: 14px;
    font-size: 13.5px;
    color: var(--text);
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 6px;
  }
  .coin { font-size: 10.5px; }
  .coin.po { color: var(--coin-po); }
  .coin.pa { color: var(--coin-pa); }
  .coin.pc { color: var(--coin-pc); }
  .equip-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 12.5px;
    padding: 3px 0;
    border-bottom: 1px dashed var(--border-soft);
  }
  .equip-qty { font-size: 12px; color: var(--text-2); }
  .equip-note { font-size: 12.5px; color: var(--text-3); margin-top: 5px; }
</style>
