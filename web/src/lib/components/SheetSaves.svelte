<script lang="ts">
  import {
    getSaveBonus,
    getSkillBonus,
    getPassivePerception,
    formatMod,
    SKILLS,
    SKILL_CARAC,
    type CaracKey,
  } from '$lib/char-utils';
  import { CARAC_NAMES } from '$lib/hd-text';
  import type { CharacterSheet } from '$lib/api';
  import BlockLabel from '$lib/ds/BlockLabel.svelte';
  import Editable from '$lib/ds/Editable.svelte';

  let {
    sheet,
    readonly,
    touch,
    onRoll,
  }: {
    sheet: CharacterSheet;
    readonly: boolean;
    touch: () => void;
    onRoll?: (mod: number, label: string) => void;
  } = $props();

  const caracs: CaracKey[] = ['for', 'dex', 'con', 'int', 'sag', 'cha'];

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
  function onSaveClick(carac: CaracKey) {
    if (onRoll) onRoll(getSaveBonus(sheet, carac), `Sauvegarde de ${CARAC_NAMES[carac].toLowerCase()}`);
  }
  function onSkillClick(skill: (typeof SKILLS)[number]) {
    if (onRoll) onRoll(getSkillBonus(sheet, skill), `${skill}`);
  }
</script>

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
        <span class="save-name">{CARAC_NAMES[c]}</span>
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
    <Editable
      {readonly}
      type="area"
      value={sheet.languesEtMaitrises}
      onchange={(v) => (sheet.languesEtMaitrises = String(v))}
      placeholder="Commun, elfique · armures · outils…"
      oncommit={touch}
      ontype={touch}
    />
  </div>
</div>

<style>
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
</style>