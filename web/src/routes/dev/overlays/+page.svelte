<!--
  SPIKE — jetable. Supprimer ce fichier (et sa route) à la fin de la validation.

  But : prouver (ou infirmer) qu'un menu / popover / dialogue peut se poser
  au-dessus d'une carte qui porte `transform: scale(2.5)` sans être lui-même
  mis à l'échelle ni mal positionné.

  Référence : docs/atlas-benchmark/05-architecture-svelte.md §1

  Le diagnostic est objectif, pas visuel :
    - `offsetWidth`             = largeur de mise en page (JAMAIS transformée)
    - `getBoundingClientRect()` = largeur à l'écran (transformée)
  Si le 2e est ~zoom × le 1er, l'overlay est resté dans le parent transformé.
-->
<script lang="ts">
  import { BitsConfig, ContextMenu, Dialog, Popover } from 'bits-ui';

  type Verdict = 'ok' | 'ko' | 'neutre';

  interface Report {
    label: string;
    escapedTree: Verdict;
    notScaled: Verdict;
    anchored: Verdict;
    rectW: number;
    layoutW: number;
    note: string;
  }

  let zoom = $state(2.5);
  let report = $state<Report | null>(null);

  const nbFail = $derived(
    report ? [report.escapedTree, report.notScaled, report.anchored].filter((v) => v === 'ko').length : 0
  );

  /** Mesure l'overlay ouvert dont la racine porte `data-spike`, puis compare
   *  à son ancre si fournie. */
  function measure(label: string, anchorSelector: string | null, note: string): void {
    const root = document.querySelector<HTMLElement>('[data-spike="open"]');
    if (!root) {
      report = null;
      return;
    }

    const layoutW = root.offsetWidth;
    const rect = root.getBoundingClientRect();
    const rectW = rect.width;

    // 1. L'overlay est-il encore dans l'arbre du conteneur transformé ?
    const escapedTree = root.closest('[data-scaled]') === null ? 'ok' : 'ko';

    // 2. Est-il agrandi par le transform ?
    const ratio = layoutW > 0 ? rectW / layoutW : 1;
    const notScaled = ratio > zoom * 0.85 && ratio < zoom * 1.15 ? 'ko' : 'ok';

    // 3. Est-il ancré juste sous son déclencheur, en coordonnées viewport ?
    let anchored: Verdict = 'neutre';
    let fullNote = note;
    if (anchorSelector) {
      const anchor = document.querySelector<HTMLElement>(anchorSelector);
      if (!anchor) {
        anchored = 'ko';
        fullNote += ' — ancre introuvable';
      } else {
        const a = anchor.getBoundingClientRect();
        const dx = Math.abs(rect.left - a.left);
        const dy = Math.abs(rect.top - a.bottom);
        // tolère l'écart de placement propre à chaque composant (centrage, offset)
        const near = dx < 12 && dy < 24;
        anchored = near ? 'ok' : 'ko';
        fullNote += ` — écart à l'ancre : ${dx.toFixed(0)}px horiz / ${dy.toFixed(0)}px vert`;
      }
    }

    report = { label, escapedTree, notScaled, anchored, rectW: Math.round(rectW), layoutW, note: fullNote };
  }

  function clear(): void {
    report = null;
  }
</script>

<svelte:head>
  <title>Spike overlays — docs/atlas-benchmark</title>
</svelte:head>

<BitsConfig defaultPortalTo="body" />

<div class="page">
  <header>
    <h1>Spike — overlays au-dessus d'une carte transformée</h1>
    <p>
      Le bloc quadrillé à gauche simule <code>.map-zoom</code> : il porte
      <code>transform: scale({zoom})</code>. Les déclencheurs sont <em>à l'intérieur</em> de
      ce bloc — c'est le cas difficile. Un overlay correct est positionné sur le viewport,
      à sa taille réelle, juste sous son déclencheur. Le diagnostic est calculé à
      l'ouverture, automatiquement.
    </p>
  </header>

  <div class="stage">
    <div class="controls">
      <span class="muted">Zoom de la carte :</span>
      {#each [1, 2, 2.5, 3] as z}
        <button class="zbtn" class:on={zoom === z} onclick={() => (zoom = z)}>{z}×</button>
      {/each}
    </div>

    <div class="viewport">
      <div class="map-frame" data-scaled style="transform: scale({zoom}); transform-origin: 0 0;">
        <div class="map-surface">
          <div class="map-bg"></div>
          <div class="fake-token" style="left: 10%; top: 18%;">A</div>
          <div class="fake-token" style="left: 58%; top: 40%;">B</div>
          <div class="fake-token" style="left: 26%; top: 66%;">C</div>

          <!-- T3 : ContextMenu sur le faux pion B (le cas le plus dur) -->
          <ContextMenu.Root onOpenChange={(open) => open && measure('T3 · ContextMenu', '[data-anchor="t3"]', 'pion B')}>
            <ContextMenu.Trigger
              data-anchor="t3"
              class="ctx-trigger">B</ContextMenu.Trigger
            >
            <ContextMenu.Portal>
              <ContextMenu.Content data-spike="open" strategy="fixed" class="menu">
                <ContextMenu.Item class="item">Apparaître</ContextMenu.Item>
                <ContextMenu.Item class="item">Retirer</ContextMenu.Item>
                <ContextMenu.Item class="item">Supprimer</ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>

          <div class="triggers">
            <!-- T1 : Dialog -->
            <Dialog.Root onOpenChange={(open) => open && measure('T1 · Dialog', null, 'largeur fixe 300px')}>
              <Dialog.Trigger data-anchor="t1" class="tbtn">T1 · Dialog</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay class="ovl" />
                <Dialog.Content data-spike="open" class="dialog">
                  <Dialog.Title class="dlg-title">T1 · Dialog</Dialog.Title>
                  <Dialog.Description class="muted">
                    Largeur fixe : 300&nbsp;px. Si le diagnostic rapporte ≈ 750&nbsp;px, l'overlay
                    est multiplié par le zoom → échec.
                  </Dialog.Description>
                  <Dialog.Close class="tbtn">Fermer</Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            <!-- T2 : Popover ancré sur son bouton -->
            <Popover.Root onOpenChange={(open) => open && measure('T2 · Popover', '[data-anchor="t2"]', 'ancré sous le bouton')}>
              <Popover.Trigger data-anchor="t2" class="tbtn">T2 · Popover</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content data-spike="open" strategy="fixed" class="menu menu--pop">
                  Largeur 260&nbsp;px, doit se poser exactement sous « T2 · Popover ».
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <!-- T4 : popover NATIF (top layer par la spec) -->
            <button
              id="t4trigger"
              data-anchor="t4"
              class="tbtn"
              popovertarget="t4pop"
              onclick={() => setTimeout(() => measure('T4 · popover natif', '[data-anchor="t4"]', 'top layer natif'), 30)}
              >T4 · popover natif</button
            >
          </div>

          <!-- enfant DOM de la carte transformée, MAIS dans le top layer -->
          <div id="t4pop" popover class="menu menu--pop" style="width: 240px; margin: 0;">
            Élément enfant de la carte transformée, mais en <em>top layer</em> → ne doit pas être
            mis à l'échelle.
          </div>
        </div>
      </div>
    </div>
  </div>

  <aside class="diag">
    <h2>Tests</h2>
    <p class="muted">
      Le diagnostic se remplit tout seul à l'ouverture de chaque overlay. Change le zoom et
      réessaie : le diagnostic doit rester vert.
    </p>

    <ul class="list">
      <li>
        <strong>T1 · Dialog</strong> — <em>clic sur « T1 · Dialog »</em><br />
        <span class="muted">Contrôle le fond : l'overlay ne doit pas être multiplié par le zoom.</span>
      </li>
      <li>
        <strong>T2 · Popover</strong> — <em>clic sur « T2 · Popover »</em><br />
        <span class="muted">Contrôle l'ancrage : doit être collé sous son bouton.</span>
      </li>
      <li>
        <strong>T3 · ContextMenu</strong> — <em>clic droit sur le pion B</em><br />
        <span class="muted">Le cas le plus dur : positionné sur les coordonnées du pointeur.</span>
      </li>
      <li>
        <strong>T4 · popover natif</strong> — <em>clic sur « T4 · popover natif »</em><br />
        <span class="muted">La solution normative, sans dépendance.</span>
      </li>
    </ul>

    {#if report}
      <div class="report" class:report--fail={nbFail > 0}>
        <div class="report-head">
          <strong>{report.label}</strong>
          {#if nbFail > 0}
            <span class="fail">{nbFail} échec{nbFail > 1 ? 's' : ''}</span>
          {:else}
            <span class="pass">OK</span>
          {/if}
        </div>
        <table>
          <tbody>
            <tr>
              <td>Hors de l'arbre transformé</td>
              <td class="v-{report.escapedTree}">{report.escapedTree}</td>
            </tr>
            <tr>
              <td>Taille non mise à l'échelle</td>
              <td class="v-{report.notScaled}">{report.notScaled}</td>
            </tr>
            <tr>
              <td>Ancrage correct</td>
              <td class="v-{report.anchored}">{report.anchored}</td>
            </tr>
            <tr>
              <td>largeur écran / mise en page</td>
              <td class="num">{report.rectW} / {report.layoutW} px</td>
            </tr>
          </tbody>
          <tbody>
            <tr>
              <td>Hors de l'arbre transformé</td>
              <td class="v-{report.escapedTree}">{report.escapedTree}</td>
            </tr>
            <tr>
              <td>Taille non mise à l'échelle</td>
              <td class="v-{report.notScaled}">{report.notScaled}</td>
            </tr>
            <tr>
              <td>Ancrage correct</td>
              <td class="v-{report.anchored}">{report.anchored}</td>
            </tr>
            <tr>
              <td>largeur écran / mise en page</td>
              <td class="num">{report.rectW} / {report.layoutW} px</td>
            </tr>
          </tbody>
        </table>
        <p class="muted note">{report.note}</p>
      </div>
      <button class="tbtn clear" onclick={clear}>Effacer le diagnostic</button>
    {:else}
      <p class="muted">Aucun overlay ouvert.</p>
    {/if}

    <div class="manual">
      <h3>À vérifier à l'œil</h3>
      <ol>
        <li>Les couleurs sont-elles correctes ? (les tokens héritent à travers le portail)</li>
        <li><kbd>Échap</kbd> et le clic extérieur ferment-ils ?</li>
        <li>Répéter sur <strong>Safari</strong> et <strong>Firefox</strong> — le top layer n'a pas le même comportement partout.</li>
      </ol>
    </div>
  </aside>
</div>

<style>
  /* ─── chrome de la page ─── */
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 14px;
    height: 100vh;
    padding: 14px;
    box-sizing: border-box;
    color: var(--text);
    font-family: var(--font-body);
    background: var(--bg);
  }

  header {
    grid-column: 1 / -1;
  }

  h1 {
    font: 700 22px var(--font-title);
    margin: 0 0 6px;
    color: var(--heading);
  }

  h2 {
    font: 700 18px var(--font-title);
    margin: 0 0 8px;
  }

  h3 {
    font: 700 14px var(--font-title);
    margin: 0 0 6px;
  }

  header p {
    margin: 0;
    max-width: 78ch;
    line-height: 1.5;
  }

  code {
    background: var(--selected);
    padding: 1px 5px;
    border-radius: 4px;
  }

  kbd {
    background: var(--selected);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 11px;
  }

  .muted {
    color: var(--text-2);
  }

  /* ─── scène ─── */
  .stage {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  .controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .zbtn {
    padding: 4px 11px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .zbtn.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent-border);
  }

  .viewport {
    position: relative;
    overflow: hidden;
    background: #111;
    border: 2px solid var(--border);
    border-radius: 8px;
    min-height: 0;
  }

  .map-frame {
    width: 100%;
    height: 100%;
  }

  .map-surface {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--map-bg);
    overflow: hidden;
  }

  .map-bg {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, var(--map-line) 1px, transparent 1px),
      linear-gradient(to bottom, var(--map-line) 1px, transparent 1px);
    background-size: var(--map-grid-size) var(--map-grid-size);
  }

  .fake-token {
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
    background: var(--map-token-bg);
    border: 3px solid var(--accent);
    color: var(--map-token-fg);
    display: grid;
    place-items: center;
    font: 700 16px var(--font-title);
    transform: translate(-50%, -50%);
  }

  .ctx-trigger {
    position: absolute;
    left: 58%;
    top: 40%;
    width: 48px;
    height: 48px;
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
    background: var(--map-token-bg);
    border: 3px solid var(--accent);
    color: var(--map-token-fg);
    display: grid;
    place-items: center;
    font: 700 18px var(--font-title);
    transform: translate(-50%, -50%);
    cursor: context-menu;
  }

  .triggers {
    position: absolute;
    left: 6%;
    top: 84%;
    display: flex;
    gap: 8px;
  }

  .tbtn {
    padding: 5px 11px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .tbtn:hover {
    background: var(--selected);
  }

  /* ─── overlays : styles en :global() car le contenu est portalé hors du
         sous-arbre stylé par Svelte. C'est une contrainte à retenir pour la suite. ─── */
  :global(.ovl) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }

  :global(.dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    padding: 18px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 12px 40px var(--shadow-2);
    color: var(--text);
  }

  :global(.dlg-title) {
    margin: 0 0 8px;
    font: 700 16px var(--font-title);
  }

  :global(.dialog p) {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.45;
  }

  :global(.menu) {
    min-width: 210px;
    padding: 6px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 12px 40px var(--shadow-2);
    color: var(--text);
    font-family: var(--font-body);
  }

  :global(.menu--pop) {
    width: 260px;
    padding: 14px;
    font-size: 13px;
    line-height: 1.45;
  }

  :global(.item) {
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    outline: none;
  }

  :global(.item[data-highlighted]) {
    background: var(--accent);
    color: var(--accent-fg);
  }

  /* ─── panneau de diagnostic ─── */
  .diag {
    background: var(--panel);
    border: 2px solid var(--border-soft);
    border-radius: 12px;
    padding: 14px;
    overflow: auto;
    min-height: 0;
  }

  .list {
    margin: 10px 0 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.6;
  }

  .list li {
    margin-bottom: 8px;
  }

  .report {
    margin-top: 14px;
    padding: 12px;
    border: 2px solid var(--accent);
    border-radius: 12px;
    background: var(--bg);
  }

  .report--fail {
    border-color: #c0392b;
  }

  .report-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .pass {
    color: #6fbf73;
    font-weight: 700;
  }

  .fail {
    color: #e06c60;
    font-weight: 700;
  }

  .report table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 8px 0;
  }

  .report td {
    padding: 2px 0;
  }

  .report td:first-child {
    color: var(--text-2);
  }

  .report td:last-child {
    text-align: right;
  }

  .v-ok {
    color: #6fbf73;
    font-weight: 700;
  }

  .v-ko {
    color: #e06c60;
    font-weight: 700;
  }

  .v-neutre {
    color: var(--text-3);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    font-size: 12px;
  }

  .clear {
    margin-top: 8px;
  }

  .manual {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-soft);
  }

  .manual ol {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-2);
  }
</style>