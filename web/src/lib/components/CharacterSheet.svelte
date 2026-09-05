<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    CARAC_LABELS,
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
    getNextXpThreshold,
    SKILLS,
    SKILL_CARAC,
    type CaracKey,
  } from '$lib/char-utils';
  import type { CharacterDetail, CharacterSheet } from '$lib/api';
  import BlockLabel from '$lib/ds/BlockLabel.svelte';
  import Editable from '$lib/ds/Editable.svelte';
  import { api } from '$lib/api';
  import { loadPortraits, portraitUrl, portraitsByRace, type PortraitEntry } from '$lib/portraits';
  import { findRace, findClass, racialBonus, type Carac } from '@rollwith/shared/hd';

  let {
    char,
    onRoll,
    onPvDelta,
  }: {
    char: CharacterDetail;
    onRoll?: (mod: number, label: string) => void;
    onPvDelta?: (delta: number) => void;
  } = $props();

  const caracs: CaracKey[] = ['for', 'dex', 'con', 'int', 'sag', 'cha'];
  const saveNames: Record<CaracKey, string> = {
    for: 'Force',
    dex: 'Dextérité',
    con: 'Constitution',
    int: 'Intelligence',
    sag: 'Sagesse',
    cha: 'Charisme',
  };

  let sheet = $state<CharacterSheet>(char.sheet);

  // ── Portraits ────────────────────────────────────────────────
  let pickerOpen = $state(false);
  let portraitList = $state<PortraitEntry[]>([]);
  const portraitGroups = $derived(portraitsByRace(portraitList));

  async function openPicker() {
    if (readonly) return;
    pickerOpen = !pickerOpen;
    if (pickerOpen && portraitList.length === 0) {
      portraitList = await loadPortraits();
    }
  }

  function choosePortrait(key: string | null) {
    sheet.portrait = key;
    touch();
    pickerOpen = false;
  }
  let pv = $state(char.pv);
  let pvTemp = $state(char.pvTemp);

  // Ne ré-ancrer la feuille locale que si le parent fournit un NOUVEL objet
  // (sinon on écraserait les éditions en cours lors d'un update de PV).
  let lastSheetRef: CharacterSheet | null = null;
  $effect(() => {
    if (char.sheet !== lastSheetRef) {
      lastSheetRef = char.sheet;
      sheet = char.sheet;
    }
    pv = char.pv;
    pvTemp = char.pvTemp;
  });

  const readonly = $derived(!char.canEdit);

  // ── Apport course/classe (hd.ts, données officielles DRS) ────
  const raceInfo = $derived(findRace(sheet.identite?.race));
  const classInfo = $derived(findClass(sheet.identite?.classe));
  const racialShown = $derived.by<Partial<Record<Carac, number>> | null>(() => {
    if (sheet.racial && Object.keys(sheet.racial).length) return sheet.racial;
    if (raceInfo) return racialBonus(raceInfo);
    return null;
  });
  const CARAC_LABELS_FR: Record<Carac, string> = {
    for: 'Force', dex: 'Dex', con: 'Const', int: 'Int', sag: 'Sag', cha: 'Charism',
  };

  // ── Autosave ─────────────────────────────────────────────────
  let saveState = $state<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  let saveError = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function touch() {
    if (readonly) return;
    saveState = 'dirty';
    saveError = '';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 700);
  }

  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (readonly || saveState !== 'dirty') return;
    saveState = 'saving';
    try {
      await api.characters.updateSheet(char.id, normalized());
      saveState = 'saved';
      setTimeout(() => {
        if (saveState === 'saved') saveState = 'idle';
      }, 1500);
    } catch (e) {
      saveState = 'error';
      saveError = e instanceof Error ? e.message : 'Enregistrement impossible';
    }
  }

  onDestroy(() => {
    if (saveState === 'dirty') void flush();
  });

  function num(v: unknown, min: number, max: number, fb: number): number {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb;
  }
  function txt(v: unknown, max: number, fb = ''): string {
    return v === undefined || v === null ? fb : String(v).slice(0, max);
  }

  /** Coie normalisée (bornes, types) de la feuille pour l'envoi serveur. */
  function normalized(): CharacterSheet {
    const s = sheet;
    return {
      identite: {
        nom: txt(s.identite.nom, 100) || 'Sans nom',
        race: txt(s.identite.race, 100),
        classe: txt(s.identite.classe, 100),
        niveau: num(s.identite.niveau, 1, 20, 1),
        historique: txt(s.identite.historique, 100),
        alignement: txt(s.identite.alignement, 60),
        xp: num(s.identite.xp, 0, 5_000_000, 0),
        citation: s.identite.citation === undefined ? undefined : txt(s.identite.citation, 4000),
      },
      caracs: {
        for: num(s.caracs.for, 1, 30, 10),
        dex: num(s.caracs.dex, 1, 30, 10),
        con: num(s.caracs.con, 1, 30, 10),
        int: num(s.caracs.int, 1, 30, 10),
        sag: num(s.caracs.sag, 1, 30, 10),
        cha: num(s.caracs.cha, 1, 30, 10),
      },
      saveProficiencies: { ...s.saveProficiencies },
      skillProficiencies: { ...s.skillProficiencies },
      ca: num(s.ca, 0, 40, 10),
      vitesse: txt(s.vitesse, 40),
      initiativeBonus: num(s.initiativeBonus, -5, 20, 0),
      pvMax: num(s.pvMax, 0, 1000, 0),
      desDeVie: {
        faces: num(s.desDeVie.faces, 4, 12, 8),
        total: num(s.desDeVie.total, 0, 21, 1),
        restants: num(s.desDeVie.restants, 0, 21, 1),
      },
      deathSaves: {
        successes: num(s.deathSaves.successes, 0, 3, 0),
        failures: num(s.deathSaves.failures, 0, 3, 0),
      },
      inspiration: !!s.inspiration,
      attaques: s.attaques.slice(0, 30).map((a) => ({
        id: a.id,
        name: txt(a.name, 100) || 'Attaque',
        bonus: num(a.bonus, -5, 30, 0),
        damage: txt(a.damage, 40),
      })),
      sorts: {
        caracIncantation: s.sorts.caracIncantation,
        connus: s.sorts.connus.slice(0, 200).map((sp) => ({
          slug: txt(sp.slug, 100).replace(/\s+/g, '-').toLowerCase() || 'sort',
          level: num(sp.level, 0, 9, 0),
          name: sp.name === undefined ? undefined : txt(sp.name, 100),
        })),
        emplacements: s.sorts.emplacements
          .slice(0, 10)
          .map((e) => ({
            level: num(e.level, 0, 9, 1),
            max: num(e.max, 0, 16, 0),
            used: num(e.used, 0, 16, 0),
          }))
          .sort((a, b) => a.level - b.level),
      },
      capacites: s.capacites.slice(0, 60).map((c) => ({
        id: c.id,
        name: txt(c.name, 100) || 'Capacité',
        description: txt(c.description, 4000),
      })),
      personnalite: {
        traits: s.personnalite.traits ? txt(s.personnalite.traits, 4000) : undefined,
        ideaux: s.personnalite.ideaux ? txt(s.personnalite.ideaux, 4000) : undefined,
        liens: s.personnalite.liens ? txt(s.personnalite.liens, 4000) : undefined,
        defauts: s.personnalite.defauts ? txt(s.personnalite.defauts, 4000) : undefined,
      },
      languesEtMaitrises: txt(s.languesEtMaitrises, 4000),
      portrait: s.portrait ?? null,
      equipement: {
        bourse: {
          po: num(s.equipement.bourse.po, 0, 1_000_000, 0),
          pa: num(s.equipement.bourse.pa, 0, 1_000_000, 0),
          pc: num(s.equipement.bourse.pc, 0, 1_000_000, 0),
        },
        objets: s.equipement.objets.slice(0, 200).map((o) => ({
          name: txt(o.name, 200) || 'Objet',
          qty: num(o.qty, 0, 9999, 1),
        })),
      },
      couleurPion: txt(s.couleurPion, 20) || '#C0392B',
    };
  }

  // ── Helpers d'édition courants ──────────────────────────────
  function commitNiveau() {
    sheet.identite.niveau = num(sheet.identite.niveau, 1, 20, 1);
    sheet.desDeVie.total = sheet.identite.niveau;
    if (sheet.desDeVie.restants > sheet.desDeVie.total) {
      sheet.desDeVie.restants = sheet.desDeVie.total;
    }
    touch();
  }

  function toggleSave(c: CaracKey) {
    if (readonly) return;
    sheet.saveProficiencies = { ...sheet.saveProficiencies, [c]: !sheet.saveProficiencies[c] };
    touch();
  }
  function toggleSkill(skill: string) {
    if (readonly) return;
    sheet.skillProficiencies = {
      ...sheet.skillProficiencies,
      [skill]: !(sheet.skillProficiencies[skill] ?? false),
    };
    touch();
  }
  function setDeath(key: 'successes' | 'failures', i: number) {
    if (readonly) return;
    const cur = sheet.deathSaves[key];
    sheet.deathSaves = { ...sheet.deathSaves, [key]: i < cur ? i : i + 1 };
    touch();
  }
  function setUsed(row: { level: number; max: number; used: number }, i: number) {
    if (readonly) return;
    row.used = i < row.used ? i : i + 1;
    touch();
  }
  function addLevelRow() {
    if (readonly) return;
    const next = sheet.sorts.emplacements.reduce((m, e) => Math.max(m, e.level), 0) + 1;
    if (next > 9) return;
    sheet.sorts = {
      ...sheet.sorts,
      emplacements: [...sheet.sorts.emplacements, { level: next, max: 4, used: 0 }],
    };
    touch();
  }
  function removeLevelRow(level: number) {
    if (readonly) return;
    sheet.sorts = {
      ...sheet.sorts,
      emplacements: sheet.sorts.emplacements.filter((e) => e.level !== level),
      connus: sheet.sorts.connus.filter((sp) => sp.level !== level),
    };
    touch();
  }
  function addSpell(level: number) {
    if (readonly) return;
    sheet.sorts = {
      ...sheet.sorts,
      connus: [...sheet.sorts.connus, { slug: `nouveau-sort-${level}`, level, name: 'Nouveau sort' }],
    };
    touch();
  }
  function removeSpell(slug: string, level: number) {
    if (readonly) return;
    sheet.sorts = {
      ...sheet.sorts,
      connus: sheet.sorts.connus.filter((sp) => !(sp.slug === slug && sp.level === level)),
    };
    touch();
  }
  function commitSpellName(sp: { slug: string; name?: string }) {
    sp.name = txt(sp.name, 100) || txt(sp.slug, 100).replace(/-/g, ' ');
    touch();
  }

  function addAttack() {
    if (readonly) return;
    sheet.attaques = [
      ...sheet.attaques,
      { id: crypto.randomUUID(), name: 'Nouvelle arme', bonus: 0, damage: '1d8' },
    ];
    touch();
  }
  function removeAttack(id: string) {
    if (readonly) return;
    sheet.attaques = sheet.attaques.filter((a) => a.id !== id);
    touch();
  }
  function addCapacite() {
    if (readonly) return;
    sheet.capacites = [
      ...sheet.capacites,
      { id: crypto.randomUUID(), name: 'Nouvelle capacité', description: '' },
    ];
    touch();
  }
  function removeCapacite(id: string) {
    if (readonly) return;
    sheet.capacites = sheet.capacites.filter((c) => c.id !== id);
    touch();
  }
  function addObjet() {
    if (readonly) return;
    sheet.equipement = {
      ...sheet.equipement,
      objets: [...sheet.equipement.objets, { name: 'Nouvel objet', qty: 1 }],
    };
    touch();
  }
  function removeObjet(idx: number) {
    if (readonly) return;
    sheet.equipement = {
      ...sheet.equipement,
      objets: sheet.equipement.objets.filter((_, i) => i !== idx),
    };
    touch();
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
    rollWith(getInitiativeBonus(sheet) ?? 0, 'Initiative');
  }
  function onAttackClick(atkId: string) {
    const atk = sheet.attaques.find((a) => a.id === atkId);
    if (atk) rollWith(Number(atk.bonus) || 0, `Attaque — ${atk.name}`);
  }

  function adjustPv(delta: number) {
    if (readonly || !onPvDelta) return;
    onPvDelta(delta);
  }

  async function commitPvTemp() {
    pvTemp = num(pvTemp, 0, 1000, 0);
    try {
      const res = await api.characters.updatePvTemp(char.id, pvTemp);
      pvTemp = res.pvTemp;
    } catch {
      /* la valeur brute reste affichée, resynchronisée au prochain chargement */
    }
  }

  async function toggleInspiration() {
    if (readonly || saveState === 'saving') return;
    try {
      const res = await api.characters.toggleInspiration(char.id);
      sheet.inspiration = res.inspiration;
    } catch {
      /* ignore */
    }
  }

  let pvPct = $derived(
    Math.max(0, Math.min(100, (pv / Math.max(1, num(sheet.pvMax, 0, 1000, 1))) * 100)),
  );

  const spellsSorted = $derived(
    [...sheet.sorts.emplacements].sort((a, b) => a.level - b.level),
  );

  function spellLabel(sp: { slug: string; name?: string }): string {
    return sp.name ?? sp.slug.replace(/-/g, ' ');
  }
</script>

<div class="sheet">
  <!-- Barre haute -->
  <header class="sheet-header">
    <a href="/campaigns/{char.campaignId}/table" class="back-btn">← retour à la table</a>
    <div class="header-title">Feuille de personnage</div>
    <div class="header-hint">
      {#if readonly}
        Lecture seule{char.role === 'mj' ? '' : " — seule votre fiche est modifiable"}
      {:else}
        Les valeurs soulignées au survol sont modifiables · cliquez carac, initiative ou attaque pour
        lancer le dé
      {/if}
    </div>
    <div class="grow"></div>
    {#if saveState === 'dirty' || saveState === 'saving'}
      <span class="save-pill">modifications…</span>
    {:else if saveState === 'saved'}
      <span class="save-pill ok">enregistré</span>
    {:else if saveState === 'error'}
      <span class="save-pill err">{saveError}</span>
    {/if}
    <span class="hdr-meta">Héros & Dragons · DRS</span>
  </header>

  <!-- En-tête personnage -->
  <div class="char-header-wrap">
    <div class="char-header">
      <button
        class="portrait-frame"
        class:empty={!sheet.portrait}
        disabled={readonly}
        title={readonly ? undefined : 'Choisir un portrait'}
        onclick={openPicker}
      >
        {#if portraitUrl(sheet.portrait)}
          <img src={portraitUrl(sheet.portrait)} alt="portrait" draggable="false" />
        {:else}
          <span class="portrait-initial">{(sheet.identite.nom || '?').slice(0, 1).toUpperCase()}</span>
        {/if}
      </button>
      <div class="char-name-col">
        <div class="char-name"><Editable {readonly} w={210} value={sheet.identite.nom} onchange={(v) => (sheet.identite.nom = String(v))} oncommit={touch} ontype={touch} /></div>
        <div class="char-citation">« <Editable {readonly} w={220} value={sheet.identite.citation ?? ''} onchange={(v) => (sheet.identite.citation = String(v))} placeholder="citation" oncommit={touch} ontype={touch} /> »</div>
      </div>
      <div class="char-divider"></div>
      <div class="char-meta-col">
      <div class="char-meta-grid">
        <div class="char-meta-item">
          <div class="meta-label">Classe & niveau</div>
          <div class="meta-value">
            <Editable {readonly} w={110} value={sheet.identite.classe} onchange={(v) => (sheet.identite.classe = String(v))} oncommit={touch} ontype={touch} />
            <Editable {readonly} type="number" min={1} max={20} w={34} align="center" value={sheet.identite.niveau} onchange={(v) => (sheet.identite.niveau = Number(v))} oncommit={commitNiveau} ontype={touch} />
          </div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Race</div>
          <div class="meta-value"><Editable {readonly} w={130} value={sheet.identite.race} onchange={(v) => (sheet.identite.race = String(v))} oncommit={touch} ontype={touch} /></div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Historique</div>
          <div class="meta-value"><Editable {readonly} w={130} value={sheet.identite.historique} onchange={(v) => (sheet.identite.historique = String(v))} oncommit={touch} ontype={touch} /></div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Alignement</div>
          <div class="meta-value"><Editable {readonly} w={120} value={sheet.identite.alignement} onchange={(v) => (sheet.identite.alignement = String(v))} oncommit={touch} ontype={touch} /></div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Points d'expérience</div>
          <div class="meta-value">
            <Editable {readonly} type="number" min={0} w={70} value={sheet.identite.xp} onchange={(v) => (sheet.identite.xp = Number(v))} oncommit={touch} ontype={touch} />
            <span class="meta-sub" title="Seuil calculé selon l'XP">/ {getNextXpThreshold(num(sheet.identite.xp, 0, 5e6, 0)).toLocaleString('fr')}</span>
          </div>
        </div>
      </div>
      {#if raceInfo || classInfo}
        <div class="rules-strip">
          {#if raceInfo}
            <span class="rule-chip race-chip">
              {raceInfo.label}
              {#each Object.entries(racialShown ?? {}) as [k, v] (k)}
                <b>+{v} {CARAC_LABELS_FR[k as Carac]}</b>
              {/each}
            </span>
          {/if}
          {#if classInfo}
            <span class="rule-chip class-chip">
              {classInfo.label}
              <b>DV d{classInfo.hitDie}</b>
              <b>sauvegardes {classInfo.saves.map((k) => k.toUpperCase()).join(' · ')}</b>
              {#if classInfo.casting}<b>incantation {classInfo.casting.toUpperCase()}</b>{/if}
            </span>
          {/if}
        </div>
      {/if}
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
          title="Cliquez pour lancer un test"
        >
          <div class="carac-label">{CARAC_LABELS[c]}</div>
          <div class="carac-mod" title="Modificateur calculé">{formatMod(getMod(sheet, c))}</div>
          <div class="carac-value">
            <Editable {readonly} type="number" min={1} max={30} align="center" w={42} value={sheet.caracs[c]} onchange={(v) => (sheet.caracs[c] = Number(v))} oncommit={() => { sheet.caracs[c] = num(sheet.caracs[c], 1, 30, 10); touch(); }} ontype={touch} />
            {#if racialShown?.[c]}
              <span class="racial-badge" title="Dont +{racialShown[c]} racial ({raceInfo?.label ?? 'course'})">+{racialShown[c]}</span>
            {/if}
          </div>
        </div>
      {/each}

      <div
        class="inspi-card"
        class:on={sheet.inspiration}
        onclick={toggleInspiration}
        title={readonly ? undefined : 'Basculer l’inspiration'}
      >
        <div class="mini-label">INSPIRATION</div>
        <div class="inspi-value">{sheet.inspiration ? 'Oui' : '—'}</div>
      </div>

      <div class="mastery-card">
        <div class="mini-label">MAÎTRISE</div>
        <div class="mastery-value" title="Calculée selon le niveau">{formatMod(getProficiency(sheet))}</div>
      </div>
    </div>

    <!-- ── Colonne 2: Sauvegardes + Compétences ── -->
    <div class="col col-skills">
      <div class="block saves-block">
        <BlockLabel text="Sauvegardes" />
        {#each caracs as c (c)}
          <div class="save-row" onclick={() => onSaveClick(c)} title="Cliquez pour lancer la sauvegarde">
            <button
              class="dot"
              class:prof={sheet.saveProficiencies[c]}
              class:clickable={!readonly}
              title={readonly ? undefined : 'Maîtrise : cliquez pour basculer'}
              onclick={(e) => {
                e.stopPropagation();
                toggleSave(c);
              }}
            >{sheet.saveProficiencies[c] ? '●' : '○'}</button>
            <span class="save-name">{saveNames[c]}</span>
            <span class="save-bonus" title="mod + maîtrise">{formatMod(getSaveBonus(sheet, c))}</span>
          </div>
        {/each}
      </div>

      <div class="block skills-block">
        <BlockLabel text="Compétences" />
        {#each SKILLS as skill (skill)}
          <div class="skill-row" onclick={() => onSkillClick(skill)} title="Cliquez pour lancer le jet">
            <button
              class="dot"
              class:prof={sheet.skillProficiencies[skill] ?? false}
              class:clickable={!readonly}
              title={readonly ? undefined : 'Maîtrise : cliquez pour basculer'}
              onclick={(e) => {
                e.stopPropagation();
                toggleSkill(skill);
              }}
            >{sheet.skillProficiencies[skill] ?? false ? '●' : '○'}</button>
            <span class="skill-name">
              {skill}
              <span class="skill-ab">{SKILL_CARAC[skill].toUpperCase()}</span>
            </span>
            <span class="skill-bonus" title="mod + maîtrise">{formatMod(getSkillBonus(sheet, skill))}</span>
          </div>
        {/each}
      </div>

      <div class="pp-block">
        <span class="pp-label">Perception passive</span>
        <span class="pp-value" title="Calculée : 10 + mod Sagesse">{getPassivePerception(sheet)}</span>
      </div>

      <div class="langues-block">
        <div class="langues-title">Langues & maîtrises</div>
        <Editable {readonly} type="area" value={sheet.languesEtMaitrises} onchange={(v) => (sheet.languesEtMaitrises = String(v))} placeholder="Commun, elfique · armures · outils…" oncommit={touch} ontype={touch} />
      </div>
    </div>

    <!-- ── Colonne 3: Combat ── -->
    <div class="col col-combat">
      <div class="combat-stats">
        <div class="stat-card" style="border-radius: var(--sketchy-3);">
          <div class="mini-label">CA</div>
          <div class="stat-value big">
            <Editable {readonly} type="number" min={0} max={40} align="center" w={48} className="ed-big" value={sheet.ca} onchange={(v) => (sheet.ca = Number(v))} oncommit={() => { sheet.ca = num(sheet.ca, 0, 40, 10); touch(); }} ontype={touch} />
          </div>
        </div>
        <div class="stat-card clickable" style="border-radius: var(--sketchy-6);" onclick={onInitClick} title="Cliquez pour lancer l'initiative">
          <div class="mini-label">INITIATIVE</div>
          <div class="stat-value big accent">
            <Editable {readonly} type="number" min={-5} max={20} align="center" w={44} className="ed-big ed-accent" value={sheet.initiativeBonus} onchange={(v) => (sheet.initiativeBonus = Number(v))} oncommit={() => { sheet.initiativeBonus = num(sheet.initiativeBonus, -5, 20, 0); touch(); }} ontype={touch} />
          </div>
        </div>
        <div class="stat-card" style="border-radius: var(--sketchy-8);">
          <div class="mini-label">VITESSE</div>
          <div class="stat-value big">
            <Editable {readonly} align="center" w={72} className="ed-big" value={sheet.vitesse} onchange={(v) => (sheet.vitesse = String(v))} oncommit={touch} ontype={touch} />
          </div>
        </div>
      </div>

      <div class="pv-block">
        <BlockLabel text="Points de vie" />
        <div class="pv-bar-row">
          <div class="pv-bar-bg">
            <div class="pv-bar-fill" style="width: {pvPct}%;"></div>
          </div>
          {#if !readonly}
            <button class="pv-btn minus" onclick={() => adjustPv(-1)} disabled={!onPvDelta}>−</button>
            <button class="pv-btn plus" onclick={() => adjustPv(1)} disabled={!onPvDelta}>+</button>
          {/if}
        </div>
        <div class="pv-extras">
          <span>PV {pv} /
            {#if readonly}
              {sheet.pvMax}
            {:else}
              <Editable type="number" min={0} max={1000} align="center" w={44} value={sheet.pvMax} onchange={(v) => (sheet.pvMax = Number(v))} oncommit={() => { sheet.pvMax = num(sheet.pvMax, 0, 1000, 0); touch(); }} ontype={touch} />
            {/if}
          </span>
          <span>PV temporaires :
            {#if readonly}
              {pvTemp}
            {:else}
              <Editable type="number" min={0} max={1000} align="center" w={40} value={pvTemp} onchange={(v) => (pvTemp = Number(v))} oncommit={commitPvTemp} />
            {/if}
          </span>
          <span>
            Dés de vie :
            {#if readonly}
              {sheet.desDeVie.restants}/{sheet.desDeVie.total} × d{sheet.desDeVie.faces}
            {:else}
              <Editable type="number" min={0} w={30} align="center" value={sheet.desDeVie.restants} onchange={(v) => (sheet.desDeVie.restants = Number(v))} oncommit={() => { sheet.desDeVie.restants = num(sheet.desDeVie.restants, 0, sheet.desDeVie.total, 0); touch(); }} ontype={touch} />
              /<span title="Déterminé par le niveau">{sheet.identite.niveau}</span> × d
              <Editable type="number" min={4} max={12} w={34} align="center" value={sheet.desDeVie.faces} onchange={(v) => (sheet.desDeVie.faces = Number(v))} oncommit={() => { sheet.desDeVie.faces = num(sheet.desDeVie.faces, 4, 12, 8); touch(); }} ontype={touch} />
            {/if}
          </span>
        </div>
        <div class="death-saves">
          <span class="ds-title">Jets contre la mort</span>
          <span class="ds-sub">réussites</span>
          {#each [0, 1, 2] as i (i)}
            <button class="ds-pip ok" class:filled={i < sheet.deathSaves.successes} disabled={readonly} onclick={() => setDeath('successes', i)}>{i < sheet.deathSaves.successes ? '⦿' : '○'}</button>
          {/each}
          <span class="ds-sub ko-margin">échecs</span>
          {#each [0, 1, 2] as i (i)}
            <button class="ds-pip ko" class:filled={i < sheet.deathSaves.failures} disabled={readonly} onclick={() => setDeath('failures', i)}>{i < sheet.deathSaves.failures ? '⦿' : '○'}</button>
          {/each}
        </div>
      </div>

      <div class="block attacks-block">
        <BlockLabel text="Attaques" />
        <div class="attacks-header">
          <span>Arme</span>
          <span>Att.</span>
          <span>Dégâts</span>
          <span></span>
        </div>
        {#each sheet.attaques as atk (atk.id)}
          <div class="attack-row" onclick={() => onAttackClick(atk.id)} title="Cliquez pour lancer l'attaque">
            <span class="atk-name"><Editable {readonly} w={130} value={atk.name} onchange={(v) => (atk.name = String(v))} oncommit={touch} ontype={touch} /></span>
            <span class="atk-bonus"><Editable {readonly} type="number" min={-5} max={30} align="center" w={38} className="ed-accent" value={atk.bonus} onchange={(v) => (atk.bonus = Number(v))} oncommit={() => { atk.bonus = num(atk.bonus, -5, 30, 0); touch(); }} ontype={touch} /></span>
            <span class="atk-dmg"><Editable {readonly} w={90} value={atk.damage} onchange={(v) => (atk.damage = String(v))} oncommit={touch} ontype={touch} /></span>
            {#if !readonly}
              <button class="row-x" title="Retirer cette attaque" onclick={(e) => { e.stopPropagation(); removeAttack(atk.id); }}>✕</button>
            {/if}
          </div>
        {/each}
        {#if !readonly}
          <button class="add-row" onclick={addAttack}>+ attaque</button>
        {/if}
      </div>

      {#if getShowSpells(sheet)}
        <div class="block spells-block">
          <BlockLabel text={`Sorts de ${(sheet.identite.classe || '…').toLowerCase()}`} />
          <div class="spell-stats">
            <span>DD sauvegarde <strong title="Calculé : 8 + maîtrise + mod">{getSpellSaveDc(sheet)}</strong></span>
            <span>Att. de sort <strong class="accent" title="Calculé : maîtrise + mod">{formatMod(getSpellAttackBonus(sheet) ?? 0)}</strong></span>
            <span>Carac.
              {#if readonly}
                <strong>{sheet.sorts.caracIncantation?.toUpperCase() ?? '—'}</strong>
              {:else}
                <select
                  class="carac-select"
                  bind:value={sheet.sorts.caracIncantation}
                  onchange={touch}
                >
                  <option value={null}>—</option>
                  <option value="for">FOR</option>
                  <option value="dex">DEX</option>
                  <option value="con">CON</option>
                  <option value="int">INT</option>
                  <option value="sag">SAG</option>
                  <option value="cha">CHA</option>
                </select>
              {/if}
            </span>
          </div>
          {#each spellsSorted as lv (lv.level)}
            <div class="spell-level">
              <div class="sl-header">
                <span class="sl-level">niveau {lv.level}</span>
                <span class="sl-caption">emplacements :</span>
                {#each Array(lv.max) as _, i (i)}
                  <button class="slot-pip" class:used={i < lv.used} disabled={readonly} title={readonly ? undefined : 'Cocher / libérer'} onclick={() => setUsed(lv, i)}>{i < lv.used ? '⦿' : '○'}</button>
                {/each}
                {#if !readonly}
                  <span class="sl-caption">max</span>
                  <Editable type="number" min={0} max={16} w={34} align="center" value={lv.max} onchange={(v) => (lv.max = Number(v))} oncommit={() => { lv.max = num(lv.max, 0, 16, 0); if (lv.used > lv.max) lv.used = lv.max; touch(); }} ontype={touch} />
                  <button class="row-x" title="Supprimer ce palier" onclick={() => removeLevelRow(lv.level)}>✕</button>
                {/if}
              </div>
              <div class="sl-spells">
                {#each sheet.sorts.connus.filter((s) => s.level === lv.level) as sp (sp.slug)}
                  <span class="spell-chip">
                    <Editable {readonly} w={Math.max(60, spellLabel(sp).length * 7 + 8)} value={spellLabel(sp)} onchange={(v) => (sp.name = String(v))} oncommit={() => commitSpellName(sp)} ontype={touch} />
                    {#if !readonly}
                      <button class="chip-x" title="Retirer" onclick={() => removeSpell(sp.slug, lv.level)}>✕</button>
                    {/if}
                  </span>
                {/each}
                {#if !readonly}
                  <button class="add-spell" onclick={() => addSpell(lv.level)}>+ sort</button>
                {/if}
              </div>
            </div>
          {/each}
          {#if !readonly}
            <button class="add-row" onclick={addLevelRow}>+ palier de sorts</button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ── Colonne 4: Traits & équipement ── -->
    <div class="col col-traits">
      <div class="block traits-block">
        <BlockLabel text="Capacités & traits" />
        {#each sheet.capacites as trait (trait.id)}
          <div class="trait-item">
            <div class="trait-name-row">
              <span class="trait-name"><Editable {readonly} w={180} value={trait.name} onchange={(v) => (trait.name = String(v))} oncommit={touch} ontype={touch} /></span>
              {#if !readonly}
                <button class="row-x" title="Retirer" onclick={() => removeCapacite(trait.id)}>✕</button>
              {/if}
            </div>
            <div class="trait-desc"><Editable {readonly} type="area" value={trait.description} onchange={(v) => (trait.description = String(v))} placeholder="description…" oncommit={touch} ontype={touch} /></div>
          </div>
        {/each}
        {#if !readonly}
          <button class="add-row" onclick={addCapacite}>+ capacité</button>
        {/if}
      </div>

      <div class="block persona-block">
        <BlockLabel text="Personnalité" />
        <div class="persona-item"><span class="persona-key">traits — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.traits ?? ''} onchange={(v) => (sheet.personnalite.traits = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
        <div class="persona-item"><span class="persona-key">idéal — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.ideaux ?? ''} onchange={(v) => (sheet.personnalite.ideaux = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
        <div class="persona-item"><span class="persona-key">lien — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.liens ?? ''} onchange={(v) => (sheet.personnalite.liens = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
        <div class="persona-item"><span class="persona-key">défaut — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.defauts ?? ''} onchange={(v) => (sheet.personnalite.defauts = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
      </div>

      <div class="block equip-block">
        <BlockLabel text="Équipement" />
        <div class="bourse">
          <span>{#if readonly}{sheet.equipement.bourse.po}{:else}<Editable type="number" min={0} w={52} align="center" value={sheet.equipement.bourse.po} onchange={(v) => (sheet.equipement.bourse.po = Number(v))} oncommit={() => { sheet.equipement.bourse.po = num(sheet.equipement.bourse.po, 0, 1e6, 0); touch(); }} ontype={touch} />{/if} <span class="coin po">po</span></span>
          <span>{#if readonly}{sheet.equipement.bourse.pa}{:else}<Editable type="number" min={0} w={52} align="center" value={sheet.equipement.bourse.pa} onchange={(v) => (sheet.equipement.bourse.pa = Number(v))} oncommit={() => { sheet.equipement.bourse.pa = num(sheet.equipement.bourse.pa, 0, 1e6, 0); touch(); }} ontype={touch} />{/if} <span class="coin pa">pa</span></span>
          <span>{#if readonly}{sheet.equipement.bourse.pc}{:else}<Editable type="number" min={0} w={52} align="center" value={sheet.equipement.bourse.pc} onchange={(v) => (sheet.equipement.bourse.pc = Number(v))} oncommit={() => { sheet.equipement.bourse.pc = num(sheet.equipement.bourse.pc, 0, 1e6, 0); touch(); }} ontype={touch} />{/if} <span class="coin pc">pc</span></span>
        </div>
        <div class="equip-list">
          {#each sheet.equipement.objets as item, idx (item.name + idx)}
            <div class="equip-row">
              <span class="equip-name"><Editable {readonly} w={190} value={item.name} onchange={(v) => (item.name = String(v))} oncommit={touch} ontype={touch} /></span>
              <span class="equip-qty">×<Editable {readonly} type="number" min={0} max={9999} w={40} align="center" value={item.qty} onchange={(v) => (item.qty = Number(v))} oncommit={() => { item.qty = num(item.qty, 0, 9999, 1); touch(); }} ontype={touch} /></span>
              {#if !readonly}
                <button class="row-x" title="Jeter cet objet" onclick={() => removeObjet(idx)}>✕</button>
              {/if}
            </div>
          {/each}
        </div>
        {#if !readonly}
          <button class="add-row" onclick={addObjet}>+ objet</button>
        {/if}
      </div>
    </div>
  </div>

  {#if pickerOpen}
    <div class="overlay" role="presentation" onclick={() => (pickerOpen = false)}>
      <div
        class="picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choisir un portrait"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (pickerOpen = false)}
      >
        <div class="picker-head">
          <div class="picker-title">Choisir un portrait</div>
          <button class="picker-clear" onclick={() => choosePortrait(null)}>Aucun</button>
        </div>
        <div class="picker-body">
          {#if portraitList.length === 0}
            <p class="picker-empty">Portraits indisponibles.</p>
          {:else}
            {#each portraitGroups as g (g.race)}
              <div class="picker-race">{g.race}</div>
              <div class="picker-grid">
                {#each g.items as it (it.key)}
                  <button
                    class="picker-cell"
                    class:selected={sheet.portrait === it.key}
                    title={it.key}
                    onclick={() => choosePortrait(it.key)}
                  >
                    <img src={portraitUrl(it.key)} alt="" loading="lazy" draggable="false" />
                  </button>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .picker {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 15px 255px 15px 225px / 225px 15px 255px 15px;
    width: min(620px, calc(100vw - 48px));
    max-height: min(76vh, 720px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 50px var(--shadow-2);
  }
  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px 12px;
    flex: none;
  }
  .picker-title {
    font-family: var(--font-title);
    font-size: 22px;
    color: var(--heading);
  }
  .picker-clear {
    font-family: var(--font-body);
    font-size: 12.5px;
    background: transparent;
    border: 2px dashed var(--border);
    border-radius: 10px 3px 12px 3px;
    color: var(--text-2);
    padding: 4px 12px;
    cursor: pointer;
  }
  .picker-clear:hover {
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .picker-body {
    overflow-y: auto;
    padding: 0 22px 20px;
    min-height: 0;
  }
  .picker-empty {
    color: var(--text-2);
    font-style: italic;
    font-size: 13px;
  }
  .picker-race {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-3);
    margin: 12px 0 6px;
  }
  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    gap: 8px;
  }
  .picker-cell {
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
    background: var(--bg);
    overflow: hidden;
    aspect-ratio: 1;
    cursor: pointer;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .picker-cell:hover {
    border-color: var(--text-2);
  }
  .picker-cell.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-border);
  }
  .picker-cell img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
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
  .save-pill {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    color: var(--text-2);
    border: 1.5px dashed var(--border);
    border-radius: 10px 3px 12px 3px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .save-pill.ok {
    color: #8ab58d;
    border-style: solid;
    border-color: var(--border);
  }
  .save-pill.err {
    color: var(--accent-text);
    border-style: solid;
    border-color: var(--accent-border);
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
  .char-meta-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rules-strip { display: flex; gap: 8px; flex-wrap: wrap; }
  .rule-chip {
    font-size: 11px; font-weight: 700; letter-spacing: .03em;
    border: 1.5px solid var(--border); border-radius: var(--sketchy-badge);
    padding: 2px 9px; color: var(--text-2); display: inline-flex; gap: 7px; align-items: baseline;
    white-space: nowrap;
  }
  .rule-chip b { color: var(--accent-text); font-weight: 700; }
  .race-chip { border-color: var(--accent-border); }
  .racial-badge {
    font-family: var(--font-body); font-size: 10.5px; font-weight: 700;
    color: var(--accent-text); vertical-align: super; margin-left: 1px;
  }
  .char-name-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 230px;
  }
  .char-name {
    font-family: var(--font-title);
    font-size: 34px;
    line-height: 1.05;
    color: var(--heading);
  }
  .portrait-frame {
    width: 96px;
    height: 96px;
    flex: none;
    align-self: center;
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
    background: var(--bg);
    overflow: hidden;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s;
  }
  .portrait-frame:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .portrait-frame:disabled {
    cursor: default;
  }
  .portrait-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .portrait-frame.empty {
    border-style: dashed;
  }
  .portrait-initial {
    font-family: var(--font-title);
    font-size: 34px;
    color: var(--text-3);
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
  .char-meta-item {
    min-width: 0;
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
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex-wrap: wrap;
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
    grid-template-columns: 178px 242px 1fr 1fr;
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
    line-height: 1.2;
  }
  .carac-value {
    color: var(--text-2);
    font-size: 12px;
    line-height: 1.1;
    display: flex;
    align-items: baseline;
    justify-content: center;
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

  .dot {
    font-family: var(--font-body);
    font-size: 12.5px;
    background: none;
    border: none;
    padding: 0;
    color: var(--border);
    line-height: 1;
  }
  .dot.prof { color: var(--accent-text); }
  .dot.clickable { cursor: pointer; }

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
  .langues-title { font-size: 13.5px; font-weight: 500; color: var(--text-2); margin-bottom: 4px; }

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
  .stat-value.big { font-family: var(--font-title); font-size: 23px; line-height: 1.2; }
  .stat-value.accent { color: var(--accent-text); }
  :global(.ed-big) {
    font-family: var(--font-title);
    font-size: 23px;
  }
  :global(.ed-accent) { color: var(--accent-text); }

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
    align-items: baseline;
  }
  .pv-extras span { display: inline-flex; align-items: baseline; gap: 3px; }

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
  .ds-pip {
    font-size: 14px;
    color: var(--border);
    background: none;
    border: none;
    padding: 0 1px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
  }
  .ds-pip:disabled { cursor: default; }
  .ds-pip.ok.filled { color: #8ab58d; }
  .ds-pip.ko.filled { color: var(--accent-text); }

  .attacks-block { border-radius: 12px 235px 14px 245px / 235px 12px 255px 14px; }
  .attacks-header {
    display: grid;
    grid-template-columns: 1fr 58px 1fr 20px;
    gap: 4px 8px;
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
    grid-template-columns: 1fr 58px 1fr 20px;
    gap: 4px 8px;
    padding: 3px 0;
    border-bottom: 1px dashed var(--border-soft);
    font-size: 12.5px;
    cursor: pointer;
    align-items: center;
  }
  .atk-name { font-weight: 600; min-width: 0; }
  .atk-bonus { font-size: 12.5px; color: var(--accent-text); }
  .atk-dmg { font-size: 12px; color: var(--text); }

  .row-x {
    font-family: var(--font-body); font-weight: 700; font-size: 10px;
    width: 17px; height: 17px; padding: 0;
    background: transparent; border: 1.5px dashed transparent; border-radius: 6px;
    color: var(--text-3); cursor: pointer; line-height: 1;
    opacity: 0; transition: opacity 0.12s;
    align-self: center; justify-self: center;
  }
  .attack-row:hover .row-x,
  .trait-item:hover .row-x,
  .equip-row:hover .row-x,
  .sl-header:hover .row-x,
  .row-x:focus { opacity: 1; }
  .row-x:hover { border-color: var(--accent-border); color: var(--accent-text); }

  .add-row {
    font-family: var(--font-body); font-size: 12px; font-weight: 500;
    width: 100%; text-align: left; margin-top: 5px;
    padding: 4px 9px; background: transparent;
    border: 2px dashed var(--border); border-radius: 10px;
    color: var(--text-2); cursor: pointer;
  }
  .add-row:hover { border-color: var(--accent); color: var(--text); }

  .spells-block { border-radius: var(--sketchy-5); }
  .spell-stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-2);
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 6px;
    flex-wrap: wrap;
    align-items: baseline;
  }
  .spell-stats strong { color: var(--text); }
  .spell-stats strong.accent { color: var(--accent-text); }
  .carac-select {
    font-family: var(--font-body);
    font-size: 12px;
    background: var(--bg);
    color: var(--heading);
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    padding: 1px 4px;
    outline: none;
  }
  .spell-level { margin-top: 7px; }
  .sl-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sl-level { font-size: 13.5px; font-weight: 500; color: var(--text-2); }
  .sl-caption { font-size: 12px; color: var(--text-3); }
  .slot-pip {
    font-size: 14px;
    color: var(--border);
    background: none;
    border: none;
    padding: 0 1px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
  }
  .slot-pip:disabled { cursor: default; }
  .slot-pip.used { color: var(--accent-text); }
  .sl-spells { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; align-items: center; }
  .spell-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    padding: 1px 4px 1px 8px;
    border: 2px solid var(--accent-border);
    border-radius: 10px 3px 12px 3px;
    color: var(--accent-text);
    background: var(--bg);
  }
  .chip-x {
    font-family: var(--font-body); font-weight: 700; font-size: 9px;
    background: none; border: none; color: var(--text-3); cursor: pointer; padding: 0 2px;
  }
  .chip-x:hover { color: var(--accent-text); }
  .add-spell {
    font-family: var(--font-body); font-size: 11.5px;
    background: transparent; border: 1.5px dashed var(--border); border-radius: 10px 3px 12px 3px;
    color: var(--text-2); cursor: pointer; padding: 2px 9px;
  }
  .add-spell:hover { border-color: var(--accent); color: var(--accent-text); }

  /* ── Colonne 4 ── */
  .traits-block { border-radius: var(--sketchy-3); }
  .trait-item { padding: 5px 0; border-bottom: 1px dashed var(--border-soft); }
  .trait-name-row { display: flex; align-items: center; gap: 4px; }
  .trait-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; min-width: 0; }
  .trait-desc { font-size: 12px; color: var(--text-2); line-height: 1.45; margin-top: 2px; }

  .persona-block { border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px; }
  .persona-item {
    padding: 3px 0;
    border-bottom: 1px dashed var(--border-soft);
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }
  .persona-key { font-size: 13px; font-weight: 500; color: var(--accent-text); flex: none; }
  :global(.ed-persona) {
    font-style: italic;
    font-size: 12.5px;
    color: var(--text-2);
    flex: 1;
    min-width: 0;
  }

  .equip-block { border-radius: var(--sketchy-5); }
  .bourse {
    display: flex;
    gap: 14px;
    font-size: 13.5px;
    color: var(--text);
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 6px;
  }
  .bourse span { display: inline-flex; align-items: baseline; gap: 3px; }
  .coin { font-size: 10.5px; }
  .coin.po { color: var(--coin-po); }
  .coin.pa { color: var(--coin-pa); }
  .coin.pc { color: var(--coin-pc); }
  .equip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    padding: 2px 0;
    border-bottom: 1px dashed var(--border-soft);
  }
  .equip-name { flex: 1; min-width: 0; }
  .equip-qty { font-size: 12px; color: var(--text-2); display: inline-flex; align-items: center; gap: 2px; }
</style>
