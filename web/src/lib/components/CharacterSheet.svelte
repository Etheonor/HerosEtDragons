<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getNextXpThreshold, type CaracKey } from '$lib/char-utils';
  import { ARMOR_KINDS, type ArmorKind, type CharacterDetail, type CharacterSheet } from '$lib/api';
  import Editable from '$lib/ds/Editable.svelte';
  import { api } from '$lib/api';
  import { loadPortraits, portraitUrl, portraitsByRace, type PortraitEntry } from '$lib/portraits';
  import {
    findRace,
    findClass,
    racialBonus,
    freeChoiceCandidates,
    RACES,
    CLASSES,
    spellSlotsFor,
    type Carac,
  } from '@rollwith/shared/hd';
  import { xpThreshold } from '$shared/rules';
  import ChoicePicker, { type ChoiceOption } from '$lib/components/ChoicePicker.svelte';
  import { bonusRacialText, classSummary, CARAC_LABELS_SHORT } from '$lib/hd-text';
  import { suggestedPvMax, suggestedCa } from '$lib/char-utils';
  import SheetCaracs from '$lib/components/SheetCaracs.svelte';
  import SheetSaves from '$lib/components/SheetSaves.svelte';
  import SheetCombat from '$lib/components/SheetCombat.svelte';
  import SheetTraits from '$lib/components/SheetTraits.svelte';

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

  function num(v: unknown, min: number, max: number, fb: number): number {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb;
  }
  function txt(v: unknown, max: number, fb = ''): string {
    return v === undefined || v === null ? fb : String(v).slice(0, max);
  }

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
      sheet = { ...char.sheet, armures: char.sheet.armures ?? [] };
    }
    pv = char.pv;
    pvTemp = char.pvTemp;
  });

  const readonly = $derived(!char.canEdit);

  // Nom trop long : la police suit la longueur (34→18px), le textarea autorise
  // 2 lignes si vraiment nécessaire — rien ne déborde du cadre.
  const nameFont = $derived(
    Math.max(18, Math.min(34, 34 - Math.max(0, (sheet.identite.nom || '').length - 10) * 1.1)),
  );

  // ── Apport course/classe (hd.ts, données officielles DRS) ────
  const raceInfo = $derived(findRace(sheet.identite?.race));

  // PV auto : temps que le joueur ne les a pas forcés, pvMax suit
  // DV + niveau + CON effective (modification instantanée, autosave).
  const pvAutoOn = $derived(sheet.pvAuto !== false);
  const pvSuggested = $derived(suggestedPvMax(sheet));
  $effect(() => {
    if (readonly || !pvAutoOn || pvSuggested === null) return;
    if (sheet.pvMax !== pvSuggested) {
      sheet.pvMax = pvSuggested;
      touch();
    }
  });
  function setPvAuto(on: boolean) {
    sheet.pvAuto = on;
    if (on && pvSuggested !== null) sheet.pvMax = pvSuggested;
    touch();
  }

  // ── CA auto : une armure équipée (+ bouclier) détermine la CA. ──
  // Règle d'or : aucune action requise — dès qu'on équipe une armure, la CA
  // suit. Tant qu'aucune armure n'est équipée on ne touche pas à une CA
  // manuelle (moine, armure naturelle…) ; l'échappatoire = caAuto=false.
  const hasEquippedArmor = $derived((sheet.armures ?? []).some((a) => a.equipee));
  const caAutoOn = $derived(
    sheet.caAuto === true || (sheet.caAuto === undefined && hasEquippedArmor),
  );
  $effect(() => {
    if (readonly || !caAutoOn) return;
    const s = suggestedCa(sheet);
    if (sheet.ca !== s) {
      sheet.ca = s;
      touch();
    }
  });
  function setCaAuto(on: boolean) {
    sheet.caAuto = on;
    if (on) sheet.ca = suggestedCa(sheet);
    touch();
  }

  // ── Bonus raciaux : TOUJOURS calculés, aucune action requise ──
  const freeNeeded = $derived(raceInfo?.bonus.free?.count ?? 0);
  const freeCandidates = $derived(raceInfo ? freeChoiceCandidates(raceInfo) : []);
  const freeAssigned = $derived.by(() => {
    if (!freeNeeded) return true;
    const saved = sheet.racial;
    if (!saved) return false;
    const fixedMin = Object.values(racialBonus(raceInfo!)).reduce<number>((a, b) => a + (b ?? 0), 0);
    const savedTotal = Object.values(saved).reduce<number>((a, b) => a + (b ?? 0), 0);
    return savedTotal >= fixedMin + freeNeeded;
  });
  const freeMissing = $derived(!!raceInfo && freeNeeded > 0 && !freeAssigned);

  let freeChosen = $state<Carac[]>([]);
  function toggleFreePick(c: Carac) {
    if (freeChosen.includes(c)) freeChosen = freeChosen.filter((x) => x !== c);
    else if (freeChosen.length < freeNeeded) freeChosen = [...freeChosen, c];
  }
  function saveFreePicks() {
    if (!raceInfo) return;
    sheet.racial = { ...racialBonus(raceInfo, freeChosen) };
    touch();
  }
  function rechooseFree() {
    sheet.racial = null;
    freeChosen = [];
    touch();
  }

  const compLink = (cat: string, slug: string) =>
    `/compendium?campaign=${encodeURIComponent(char.campaignId)}&cat=${cat}&slug=${slug}`;

  const raceChoices = $derived<ChoiceOption[]>(
    RACES.map((r) => ({ title: r.label, sub: bonusRacialText(r), link: compLink('races', r.key) })),
  );
  const classChoices = $derived<ChoiceOption[]>(
    CLASSES.map((c) => ({ title: c.label, sub: classSummary(c), link: compLink('classes', c.key) })),
  );

  // historiques : depuis le compendium
  let backgroundChoices = $state<ChoiceOption[]>([]);
  $effect(() => {
    const cid = char.campaignId;
    if (!cid || backgroundChoices.length) return;
    void api.compendium
      .entries(cid, { category: 'historiques', limit: 50 })
      .then((res) => {
        backgroundChoices = res.entries.map((e) => {
          const m = (e.meta ?? {}) as Record<string, unknown>;
          return {
            title: e.title,
            sub: Array.isArray(m.skills) ? (m.skills as string[]).join(' · ') : undefined,
            link: compLink('historiques', e.slug),
          };
        });
      })
      .catch(() => {
        /* grille vide : le mode personnalisé du picker suffit */
      });
  });

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

  /** Copie normalisée (bornes, types) de la feuille pour l'envoi serveur. */
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
      armures: (s.armures ?? []).slice(0, 30).map((a) => ({
        id: a.id,
        name: txt(a.name, 100) || 'Armure',
        ca: num(a.ca, 0, 40, 10),
        kind: ARMOR_KINDS.includes(a.kind as ArmorKind) ? (a.kind as ArmorKind) : 'legere',
        equipee: !!a.equipee,
      })),
      caAuto: s.caAuto,
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

  function commitNiveau() {
    sheet.identite.niveau = num(sheet.identite.niveau, 1, 20, 1);
    sheet.desDeVie.total = sheet.identite.niveau;
    if (sheet.desDeVie.restants > sheet.desDeVie.total) {
      sheet.desDeVie.restants = sheet.desDeVie.total;
    }
    touch();
  }

  // ── Montée de niveau (9c) : action dédiée, pas l'édition du champ ──
  const classInfo = $derived(findClass(sheet.identite?.classe));
  const canLevelUp = $derived.by(() => {
    const lvl = sheet.identite.niveau;
    if (readonly || lvl >= 20) return false;
    return sheet.identite.xp >= xpThreshold(lvl + 1);
  });
  const nextLevelThreshold = $derived(
    sheet.identite.niveau < 20 ? xpThreshold(sheet.identite.niveau + 1) : null,
  );

  /** Applique le niveau suivant : DV +1, emplacements de sorts (table DRS),
   *  aptitudes du niveau depuis le compendium (si joignable). Les PV suivent
   *  automatiquement (pvAuto → suggestedPvMax). */
  async function levelUp() {
    if (!canLevelUp || !classInfo) return;
    const newLevel = sheet.identite.niveau + 1;
    sheet.identite.niveau = newLevel;
    sheet.desDeVie.total = newLevel;
    sheet.desDeVie.restants = Math.min(sheet.desDeVie.restants + 1, newLevel);

    // Emplacements : table officielle du nouveau niveau (paliers disparus retirés).
    const slots = spellSlotsFor(classInfo.key, newLevel);
    sheet.sorts = {
      ...sheet.sorts,
      emplacements: slots
        .map((max, i) => ({ level: i + 1, max, used: 0 }))
        .filter((s) => s.max > 0)
        .map((s) => {
          const old = sheet.sorts.emplacements.find((e) => e.level === s.level);
          return old ? { ...s, used: Math.min(old.used, s.max) } : s;
        }),
    };
    touch();

    // Aptitudes du nouveau niveau (compendium) : ajoutées aux capacités.
    try {
      const entry = await api.compendium.entry(char.campaignId, 'classes', classInfo.key);
      const evolution = (entry.meta as { evolution?: { level: number; aptitudes: string[] }[] | undefined })
        ?.evolution;
      const gained = evolution?.find((e) => e.level === newLevel)?.aptitudes ?? [];
      if (gained.length > 0) {
        sheet.capacites = [
          ...sheet.capacites,
          ...gained.map((name) => ({
            id: crypto.randomUUID(),
            name: `${name} (niv. ${newLevel})`,
            description: '—',
          })),
        ];
        touch();
      }
    } catch {
      /* compendium indisponible : la montée reste complète (PV/DV/slots) */
    }
  }

  const pvPct = $derived(
    Math.max(0, Math.min(100, (pv / Math.max(1, num(sheet.pvMax, 0, 1000, 1))) * 100)),
  );
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
        <div class="char-name" style="font-size: {nameFont}px;">
          <Editable {readonly} type="area" autosize bare value={sheet.identite.nom} onchange={(v) => (sheet.identite.nom = String(v))} oncommit={touch} ontype={touch} placeholder="nom" />
        </div>
        <div class="char-citation">
          <span class="q-mark">«</span>
          <Editable {readonly} type="area" autosize bare className="ed-citation" value={sheet.identite.citation ?? ''} onchange={(v) => (sheet.identite.citation = String(v))} placeholder="citation" oncommit={touch} ontype={touch} />
          <span class="q-mark">»</span>
        </div>
      </div>
      <div class="char-divider"></div>
      <div class="char-meta-col">
      <div class="char-meta-grid">
        <div class="char-meta-item">
          <div class="meta-label">Classe & niveau</div>
          <div class="meta-value">
            <ChoicePicker {readonly} value={sheet.identite.classe} options={classChoices} onpick={(t) => { sheet.identite.classe = t; touch(); }} />
            <Editable {readonly} type="number" min={1} max={20} w={34} align="center" value={sheet.identite.niveau} onchange={(v) => (sheet.identite.niveau = Number(v))} oncommit={commitNiveau} ontype={touch} />
            {#if !readonly && sheet.identite.niveau < 20}
              <button
                class="levelup-btn"
                disabled={!canLevelUp}
                title={canLevelUp
                  ? 'Monter au niveau ' + (sheet.identite.niveau + 1) + ' : DV +1, PV (règle officielle), emplacements de sorts et aptitudes'
                  : 'XP insuffisante — il faut ' + (nextLevelThreshold ?? 0).toLocaleString('fr') + ' XP'}
                onclick={levelUp}
              >↑ niv {sheet.identite.niveau + 1}</button>
            {/if}
          </div>
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Race</div>
          <div class="meta-value"><ChoicePicker {readonly} value={sheet.identite.race} options={raceChoices} onpick={(t) => { sheet.identite.race = t; touch(); }} /></div>
          {#if raceInfo && freeMissing}
            <div class="free-meta">
              <span class="free-warn">+{freeNeeded} au choix</span>
              <span class="free-inline">
                {#each freeCandidates as c (c)}
                  <button class="free-pick" class:on={freeChosen.includes(c)} disabled={freeChosen.length >= freeNeeded && !freeChosen.includes(c)} onclick={() => toggleFreePick(c)}>
                    {CARAC_LABELS_SHORT[c]}
                  </button>
                {/each}
                <button class="racial-apply solid" disabled={freeChosen.length < freeNeeded} onclick={saveFreePicks}>Valider</button>
              </span>
            </div>
          {:else if raceInfo && freeNeeded}
            <button class="racial-undo" title="Redésigner les bonus libres" onclick={rechooseFree}>redésigner</button>
          {/if}
        </div>
        <div class="char-meta-item">
          <div class="meta-label">Historique</div>
          <div class="meta-value"><ChoicePicker {readonly} value={sheet.identite.historique} options={backgroundChoices} onpick={(t) => { sheet.identite.historique = t; touch(); }} /></div>
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
      </div>
  </div>
  </div>

  <!-- Corps 4 colonnes -->
  <div class="sheet-body">
    <SheetCaracs {sheet} {readonly} {touch} {onRoll} charId={char.id} {saveState} />
    <SheetSaves {sheet} {readonly} {touch} {onRoll} />
    <SheetCombat
      {sheet}
      {readonly}
      {touch}
      {onRoll}
      {onPvDelta}
      charId={char.id}
      {pv}
      {pvTemp}
      setPvTemp={(v) => (pvTemp = v)}
      {caAutoOn}
      {setCaAuto}
      {pvAutoOn}
      {pvSuggested}
      {setPvAuto}
      {pvPct}
    />
    <SheetTraits {sheet} {readonly} {touch} />
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
  /* ── Styles partagés des colonnes (appliqués aux sous-composants) ── */
  :global(.block) {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 10px 13px;
    position: relative;
  }
  :global(.mini-label) {
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text-2);
    letter-spacing: 0.06em;
  }
  :global(.dot) {
    font-family: var(--font-body);
    font-size: 12.5px;
    background: none;
    border: none;
    padding: 0;
    color: var(--border);
    line-height: 1;
  }
  :global(.dot.prof) { color: var(--accent-text); }
  :global(.dot.clickable) { cursor: pointer; }
  :global(.row-x) {
    font-family: var(--font-body); font-weight: 700; font-size: 10px;
    width: 17px; height: 17px; padding: 0;
    background: transparent; border: 1.5px dashed transparent; border-radius: 6px;
    color: var(--text-3); cursor: pointer; line-height: 1;
    opacity: 0; transition: opacity 0.12s;
    align-self: center; justify-self: center;
  }
  :global(.attack-row:hover .row-x),
  :global(.trait-item:hover .row-x),
  :global(.equip-row:hover .row-x),
  :global(.armor-row:hover .row-x),
  :global(.sl-header:hover .row-x),
  :global(.row-x:focus) { opacity: 1; }
  :global(.row-x:hover) { border-color: var(--accent-border); color: var(--accent-text); }
  :global(.add-row) {
    font-family: var(--font-body); font-size: 12px; font-weight: 500;
    width: 100%; text-align: left; margin-top: 5px;
    padding: 4px 9px; background: transparent;
    border: 2px dashed var(--border); border-radius: 10px;
    color: var(--text-2); cursor: pointer;
  }
  :global(.add-row:hover) { border-color: var(--accent); color: var(--text); }
  :global(.pv-auto-chip) {
    font-family: var(--font-body); font-size: 9.5px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; color: var(--accent-text); border: 1.5px solid var(--accent-border);
    border-radius: 8px 3px 8px 3px; background: transparent; padding: 0 6px; cursor: pointer;
    line-height: 1.6;
  }
  :global(.pv-auto-chip:hover) { background: var(--bg); }
  :global(.pv-manual-chip) {
    font-family: var(--font-body); font-size: 9.5px; font-weight: 700;
    color: var(--text-3); border: 1.5px dashed var(--border); border-radius: 8px 3px 8px 3px;
    background: transparent; padding: 0 6px; cursor: pointer; line-height: 1.6;
  }
  :global(.pv-manual-chip:hover) { color: var(--accent-text); border-color: var(--accent-border); }
  :global(.ed-big) {
    font-family: var(--font-title);
    font-size: 23px;
  }
  :global(.ed-accent) { color: var(--accent-text); }
  :global(.ed-persona) {
    font-style: italic;
    font-size: 12.5px;
    color: var(--text-2);
    flex: 1;
    min-width: 0;
  }
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
    flex: 2 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .free-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    margin-top: 3px;
  }
  .free-inline { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .free-warn { color: var(--coin-po); }
  .free-pick:disabled { opacity: .4; cursor: default; }
  .racial-apply {
    font-family: var(--font-body); font-size: 11px; font-weight: 700;
    background: transparent; border: 1.5px dashed var(--accent-border);
    border-radius: var(--sketchy-badge); padding: 2px 9px; color: var(--accent-text); cursor: pointer;
  }
  .racial-apply:hover:not(:disabled) { border-style: solid; background: var(--bg); }
  .racial-apply:disabled { opacity: .5; cursor: default; }
  .racial-apply.solid { border-style: solid; background: var(--accent); border-color: var(--accent-border); color: var(--accent-fg); }
  .racial-undo {
    font-family: var(--font-body); font-size: 11px;
    background: none; border: none; cursor: pointer; color: var(--text-3);
    text-decoration: underline dotted;
  }
  .racial-undo:hover { color: var(--accent-text); }
  .free-picks { display: flex; gap: 5px; flex-wrap: wrap; }
  .free-pick {
    font-family: var(--font-body); font-size: 11.5px; font-weight: 500; padding: 3px 10px;
    background: var(--bg); border: 2px solid var(--border); border-radius: 10px 3px 12px 3px;
    color: var(--text-2); cursor: pointer;
  }
  .free-pick.on { border-color: var(--accent); color: var(--accent-text); }
  .char-name-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1 1 0;
    min-width: 260px;
  }
  .char-name {
    font-family: var(--font-title);
    font-size: 34px;
    line-height: 1.08;
    color: var(--heading);
    min-width: 0;
  }
  .char-name :global(.ed) {
    line-height: 1.08;
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
  }
  .portrait-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
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
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin-top: 2px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-2);
    min-width: 0;
  }
  .q-mark {
    color: var(--text-3);
    font-weight: 700;
    line-height: 1.35;
    flex: none;
  }
  :global(.ed-citation) {
    flex: 1;
    min-width: 0;
    line-height: 1.45;
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
  .levelup-btn {
    font-family: var(--font-body); font-size: 10.5px; font-weight: 700;
    background: var(--bg); border: 1.5px solid var(--accent-border);
    border-radius: 8px 3px 8px 3px; color: var(--accent-text);
    padding: 1px 7px; cursor: pointer; line-height: 1.5;
  }
  .levelup-btn:hover:not(:disabled) { background: var(--accent); color: var(--accent-fg); }
  .levelup-btn:disabled { opacity: 0.45; cursor: default; }

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
</style>