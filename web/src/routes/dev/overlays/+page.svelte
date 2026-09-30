<!--
  SPIKE - jetable. Supprimer ce fichier (et sa route) avant toute mise en prod :
  adapter-static le publierait tel quel.

  But : prouver (ou infirmer) qu'un menu / popover / dialogue peut se poser
  au-dessus d'une carte qui porte `transform: scale(N)` sans etre lui-meme mis a
  l'echelle ni mal positionne.

  Reference : docs/atlas-benchmark/05-architecture-svelte.md §1

  Deux groupes de tests, parce qu'ils ne se valent pas :

  · GROUPE 1 - declencheurs HORS de la carte (dans le « chrome »).
    C'est la que vivront la barre d'outils et les panneaux dans la nouvelle
    architecture : ils sont freres de la couche carte, pas descendants. Ils ne
    devraient donc JAMAIS poser probleme. Ce sont des temoins de controle.

  · GROUPE 2 - declencheurs DANS la carte transformee.
    Le seul cas reellement difficile, et le seul qui se produira en vrai : menu
    contextuel sur un pion, popover sur un lien de zone, apercu au survol.

  · T6 est un temoin negatif : meme chose que T4 mais SANS Portal et SANS
    strategy="fixed". Il DOIT echouer. S'il passe, le harnais ne teste rien.

  Diagnostic numerique, pas visuel :
    offsetWidth = largeur de mise en page (jamais transformee)
    getBoundingClientRect().width = largeur a l'ecran (transformee)
  Si le 2e vaut environ zoom fois le 1er, l'overlay est reste dans le parent.
-->
<script lang="ts">
  import { BitsConfig, ContextMenu, Dialog, Popover } from 'bits-ui';

  type Verdict = 'ok' | 'ko' | 'neutre';

  interface Report {
    label: string;
    expected: 'ok' | 'ko';
    escapedTree: Verdict;
    notScaled: Verdict;
    anchored: Verdict;
    rectW: number;
    layoutW: number;
    note: string;
  }

  let zoom = $state(1.5);
  let pan = $state({ x: 0, y: 0 });
  let report = $state<Report | null>(null);

  let dragging = $state(false);
  let grab = { px: 0, py: 0, ox: 0, oy: 0 };

  const nbFail = $derived(
    report ? [report.escapedTree, report.notScaled, report.anchored].filter((v) => v === 'ko').length : 0
  );
  const conforme = $derived(
    report ? (nbFail === 0 ? report.expected === 'ok' : report.expected === 'ko') : false
  );

  /* panoramique : la carte doit rester atteignable quel que soit le zoom */
  function panDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('[data-no-pan]')) return;
    dragging = true;
    grab = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function panMove(e: PointerEvent): void {
    if (!dragging) return;
    pan = { x: grab.ox + (e.clientX - grab.px), y: grab.oy + (e.clientY - grab.py) };
  }
  function panUp(): void {
    dragging = false;
  }
  function resetPan(): void {
    pan = { x: 0, y: 0 };
  }

  /** Mesure l'overlay ouvert (racine portant data-spike) face a son ancre. */
  function measure(label: string, expected: 'ok' | 'ko', anchorSelector: string | null, note: string): void {
    const root = document.querySelector<HTMLElement>('[data-spike="open"]');
    if (!root) {
      report = null;
      return;
    }

    const layoutW = root.offsetWidth;
    const rect = root.getBoundingClientRect();
    const rectW = rect.width;

    // 1. L'overlay a-t-il quitte l'arbre du conteneur transforme ?
    const escapedTree = root.closest('[data-scaled]') === null ? 'ok' : 'ko';

    // 2. Est-il agrandi par le transform ?
    const ratio = layoutW > 0 ? rectW / layoutW : 1;
    const notScaled = ratio > zoom * 0.85 && ratio < zoom * 1.15 ? 'ko' : 'ok';

    // 3. Est-il ancre juste sous son declencheur, en coordonnees viewport ?
    let anchored: Verdict = 'neutre';
    let fullNote = note;
    if (anchorSelector) {
      const el = document.querySelector<HTMLElement>(anchorSelector);
      if (!el) {
        anchored = 'ko';
        fullNote += ' - ancre introuvable';
      } else {
        const a = el.getBoundingClientRect();
        const dx = Math.abs(rect.left - a.left);
        const dy = Math.abs(rect.top - a.bottom);
        anchored = dx < 14 && dy < 26 ? 'ok' : 'ko';
        fullNote += ' - ecart a l ancre : ' + dx.toFixed(0) + ' px horiz / ' + dy.toFixed(0) + ' px vert';
      }
    }

    report = {
      label: label,
      expected: expected,
      escapedTree: escapedTree,
      notScaled: notScaled,
      anchored: anchored,
      rectW: Math.round(rectW),
      layoutW: layoutW,
      note: fullNote,
    };
    }

  /*
   * Styles inline pour le contenu portalé : le portail sort du sous-arbre stylé
   * par Svelte, les styles scopés ne le suivent pas. Constat important.
   */
  const PANEL =
    'position:fixed;background:var(--panel);border:2px solid var(--border);border-radius:14px;' +
    'box-shadow:0 12px 40px var(--shadow-2);color:var(--text);font-family:var(--font-body);' +
    'padding:14px;width:260px;font-size:13px;line-height:1.45;';
  const MENU =
    'position:fixed;min-width:200px;padding:6px;background:var(--panel);border:2px solid var(--border);' +
    'border-radius:14px;box-shadow:0 12px 40px var(--shadow-2);color:var(--text);font-family:var(--font-body);';
  const ITEM = 'padding:6px 10px;border-radius:8px;font-size:13px;outline:none;';
  const DLG =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:300px;padding:18px;' +
    'background:var(--panel);border:2px solid var(--border);border-radius:16px;' +
    'box-shadow:0 12px 40px var(--shadow-2);color:var(--text);font-family:var(--font-body);';
</script>

<svelte:head>
  <title>Spike overlays — docs/atlas-benchmark</title>
</svelte:head>

<BitsConfig defaultPortalTo="body" />

<div class="page">
  <header>
    <h1>Spike — overlays au-dessus d'une carte transformée</h1>
    <p>
      <strong>Glisse sur la carte pour la déplacer</strong> et change le zoom : tout doit rester
      atteignable. Le groupe 1 est hors de la carte (témoins, ça doit toujours marcher). Le
      groupe 2 est <em>dans</em> la carte transformée — le seul cas réel. <strong>T6 doit
      échouer</strong> : c'est le témoin négatif qui prouve que le diagnostic détecte le
      problème.
    </p>
  </header>

  <div class="stage">
    <div class="chrome-bar">
      <span class="tag">groupe 1 · hors carte</span>

      <Dialog.Root onOpenChange={(o) => o && measure('T1 · Dialog', 'ok', null, 'modal centré, 300 px')}>
        <Dialog.Trigger class="tbtn">T1 · Dialog</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay style="position:fixed;inset:0;background:var(--overlay);" />
          <Dialog.Content data-spike="open" style={DLG}>
            <div style="margin-bottom:10px;font:700 16px var(--font-title);color:var(--heading);">T1 · Dialog</div>
            <p style="margin:0 0 14px;font-size:13px;line-height:1.45;color:var(--text-2);">
              Largeur fixe : 300&nbsp;px. Si le diagnostic rapporte environ 300 fois le zoom,
              l'overlay est multiplié → échec.
            </p>
            <Dialog.Close class="tbtn">Fermer</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Popover.Root onOpenChange={(o) => o && measure('T2 · Popover', 'ok', '[data-anchor="t2"]', 'hors carte')}>
        <Popover.Trigger data-anchor="t2" class="tbtn">T2 · Popover</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content data-spike="open" strategy="fixed" style={PANEL}>
            Ancré sous son bouton, hors de la carte : témoin de contrôle.
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        id="t3trigger"
        data-anchor="t3"
        class="tbtn"
        popovertarget="t3pop"
        onclick={() => setTimeout(() => measure('T3 · popover natif', 'ok', '[data-anchor="t3"]', 'top layer par la spec'), 30)}
        >T3 · popover natif</button
      >

      <button class="tbtn" onclick={resetPan}>Recadrer</button>

      <span class="sp muted">zoom {zoom}× · pan {Math.round(pan.x)},{Math.round(pan.y)}</span>
      {#each [1, 1.5, 2, 3] as z}
        <button class="zbtn" class:on={zoom === z} onclick={() => (zoom = z)}>{z}×</button>
      {/each}
    </div>

    <div
      class="map-window"
      class:grabbing={dragging}
      role="application"
      aria-label="Carte simulée — glisser pour déplacer"
      onpointerdown={panDown}
      onpointermove={panMove}
      onpointerup={panUp}
      onpointercancel={panUp}
    >
      <div
        class="map-frame"
        data-scaled
        style="transform: translate({pan.x}px, {pan.y}px) scale({zoom}); transform-origin: 0 0;"
      >
        <div class="map-surface">
          <div class="map-bg"></div>

          <div class="fake-token" style="left: 74%; top: 26%;">A</div>
          <div class="fake-token" style="left: 82%; top: 74%;">C</div>

          <span class="tag tag--inmap inmap-label">groupe 2 · dans la carte</span>

          <Popover.Root
            onOpenChange={(o) =>
              o && measure('T4 · Popover dans la carte', 'ok', '[data-anchor="t4"]', 'ancré dans la carte transformée')
            }
          >
            <Popover.Trigger data-anchor="t4" data-no-pan class="tbtn inmap" style="left: 10%; top: 20%;">
              T4 · Popover
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content data-spike="open" strategy="fixed" style={PANEL}>
                Doit rester à sa taille et se poser juste sous le bouton, <b>malgré</b> le zoom.
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <ContextMenu.Root
            onOpenChange={(o) => o && measure('T5 · ContextMenu sur un pion', 'ok', '[data-anchor="t5"]', 'pion B')}
          >
            <ContextMenu.Trigger data-anchor="t5" data-no-pan class="tok tok--live">B</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content data-spike="open" strategy="fixed" style={MENU}>
                <ContextMenu.Item style={ITEM}>Apparaître</ContextMenu.Item>
                <ContextMenu.Item style={ITEM}>Retirer</ContextMenu.Item>
                <ContextMenu.Item style={ITEM}>Supprimer</ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>

          <Popover.Root
            onOpenChange={(o) =>
              o && measure('T6 · Popover SANS Portal (temoin)', 'ko', '[data-anchor="t6"]', 'ce test doit echouer')
            }
          >
            <Popover.Trigger data-anchor="t6" data-no-pan class="tbtn inmap" style="left: 10%; top: 34%;">
              T6 · sans Portal
            </Popover.Trigger>
            <Popover.Content data-spike="open" style={PANEL}>
              Ce popover n'a <b>ni Portal ni strategy</b>. Il reste dans l'arbre transformé : il doit
              être mis à l'échelle et mal ancré.
            </Popover.Content>
          </Popover.Root>
        </div>
      </div>
    </div>
  </div>

  <aside class="diag">
    <h2>Diagnostic</h2>

    <div class="grp">
      <span class="tag">groupe 1 · hors carte</span>
      <dl>
        <dt>T1 · Dialog</dt>
        <dd>modal centré, largeur fixe 300 px — à ouvrir</dd>
        <dt>T2 · Popover</dt>
        <dd>ancré sous son bouton — à ouvrir</dd>
        <dt>T3 · popover natif</dt>
        <dd>top layer par la spec — à ouvrir</dd>
      </dl>
    </div>

    <div class="grp">
      <span class="tag tag--inmap">groupe 2 · dans la carte</span>
      <dl>
        <dt>T4 · Popover</dt>
        <dd>ancré à un bouton posé <em>dans</em> la carte — à ouvrir</dd>
        <dt>T5 · ContextMenu</dt>
        <dd>clic droit sur le pion B</dd>
      </dl>
    </div>

    <div class="grp grp--ko">
      <span class="tag tag--ko">témoin négatif</span>
      <p class="muted">Doit <b>échouer</b>. S'il passe, le diagnostic ne teste rien.</p>
      <dl>
        <dt>T6 · sans Portal</dt>
        <dd>même popover, ni Portal ni strategy</dd>
      </dl>
    </div>

    {#if report}
      <div class="report" class:report--bad={!conforme}>
        <div class="report-head">
          <strong>{report.label}</strong>
          {#if conforme}
            <span class="pass">conforme</span>
          {:else}
            <span class="fail">inattendu</span>
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
        </table>
        <p class="note muted">{report.note}</p>
        <p class="attendu muted">
          Attendu pour ce test : {report.expected === 'ok' ? 'aucun échec' : 'au moins un échec'}.
        </p>
      </div>
      <button class="tbtn clear" onclick={() => (report = null)}>Effacer</button>
    {:else}
      <p class="muted">Aucun overlay ouvert.</p>
    {/if}

    <div class="manual">
      <h3>À vérifier à l'œil</h3>
      <ol>
        <li>Les couleurs sont-elles bonnes ? (les tokens héritent à travers le portail)</li>
        <li><kbd>Échap</kbd> et le clic extérieur ferment-ils ?</li>
        <li>Répéter sur <strong>Safari</strong> et <strong>Firefox</strong> — le top layer ne se comporte pas partout pareil.</li>
      </ol>
    </div>
  </aside>
</div>

<div
  id="t3pop"
  popover
  style="position:fixed;background:var(--panel);border:2px solid var(--border);border-radius:14px;
         box-shadow:0 12px 40px var(--shadow-2);color:var(--text);font-family:var(--font-body);
         padding:14px;width:250px;font-size:13px;line-height:1.45;margin:0;"
>
  Top layer natif, hors de la carte : témoin de contrôle.
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
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
    font: 700 21px var(--font-title);
    margin: 0 0 6px;
    color: var(--heading);
  }

  h2 {
    font: 700 17px var(--font-title);
    margin: 0 0 10px;
  }

  h3 {
    font: 700 13px var(--font-title);
    margin: 0 0 6px;
  }

  header p {
    margin: 0;
    max-width: 88ch;
    font-size: 14px;
    line-height: 1.5;
  }

  .muted {
    color: var(--text-2);
  }

  kbd {
    background: var(--selected);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 11px;
  }

  .tag {
    font: 700 10px var(--font-body);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 9px;
    white-space: nowrap;
  }

  .tag--inmap {
    color: var(--accent-text);
    border-color: var(--accent-border);
  }

  .tag--ko {
    color: #e06c60;
    border-color: #c0392b;
  }

  .stage {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  .chrome-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .sp {
    margin-left: auto;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
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

  .zbtn {
    padding: 4px 10px;
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

  .map-window {
    position: relative;
    overflow: hidden;
    background: #111;
    border: 2px solid var(--border);
    border-radius: 8px;
    min-height: 0;
    cursor: grab;
    touch-action: none;
  }

  .map-window.grabbing {
    cursor: grabbing;
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

  .inmap {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .inmap-label {
    left: 10%;
    top: 10%;
  }

  .tok--live {
    position: absolute;
    left: 42%;
    top: 26%;
    width: 54px;
    height: 54px;
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
    background: var(--map-token-bg);
    border: 3px solid var(--accent);
    color: var(--map-token-fg);
    display: grid;
    place-items: center;
    font: 700 19px var(--font-title);
    transform: translate(-50%, -50%);
    cursor: context-menu;
  }

  .diag {
    background: var(--panel);
    border: 2px solid var(--border-soft);
    border-radius: 12px;
    padding: 14px;
    overflow: auto;
    min-height: 0;
  }

  .grp {
    border-top: 1px solid var(--border-soft);
    padding: 9px 0;
  }

  .grp dl {
    margin: 7px 0 0;
    font-size: 12px;
    line-height: 1.55;
  }

  .grp dt {
    color: var(--text);
    font-weight: 700;
    margin-top: 5px;
  }

  .grp dd {
    margin: 0 0 0 10px;
    color: var(--text-2);
  }

  .grp p {
    margin: 7px 0 0;
    font-size: 12px;
  }

  .report {
    margin-top: 12px;
    padding: 12px;
    border: 2px solid var(--accent);
    border-radius: 12px;
    background: var(--bg);
  }

  .report--bad {
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

  .attendu {
    margin: 6px 0 0;
    font-size: 11px;
  }

  .clear {
    margin-top: 8px;
  }

  .manual {
    margin-top: 14px;
    padding-top: 11px;
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