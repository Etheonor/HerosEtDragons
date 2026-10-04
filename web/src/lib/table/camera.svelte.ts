/**
 * Caméra de la carte : un objet unique (panoramique + zoom) qui possède TOUTES
 * les mutations de cadrage, les animations et le clamp.
 *
 * - les gestes (molette, panoramique) passent en instantané ;
 * - les commandes (`reset`, `centerOn`) sont animées 400 ms ;
 * - `prefers-reduced-motion` annule les animations ;
 * - le cadrage reste STRICTEMENT local (aucune diffusion serveur) : chaque
 *   joueur a le sien, persisté par carte dans localStorage (voir la page).
 */

export interface CameraPose {
  /** Centre de la vue en fraction (0..1) de la surface. */
  fx: number;
  fy: number;
  zoom: number;
}

export interface CameraMoveOptions {
  /** true = saut immédiat (gestes) ; false = animation 400 ms (commandes). */
  instant?: boolean;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
/** Marge de vide autorisée autour de la carte, en fraction du cadre. */
const VIEW_SLACK = 0.2;
const DURATION = 400;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * `onFrame` est appelé après chaque mutation du cadrage (geste, frame
 * d'animation) : la page y branche le redraw du brouillard et la sauvegarde,
 * tous deux déjà regroupés.
 */
export function createCamera(onFrame?: () => void) {
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);
  let surfaceW = 0;
  let surfaceH = 0;
  let frameW = 0;
  let frameH = 0;
  let raf: number | null = null;

  function surfaceLeft(): number {
    return (frameW - surfaceW) / 2;
  }

  function surfaceTop(): number {
    return (frameH - surfaceH) / 2;
  }

  /** Empêche de perdre la carte, sans casser l'ancrage « zoom sur le curseur ».
   *  Sans marge, dès que la carte couvre le cadre, le clamp refusait tout vide
   *  et le point sous la souris glissait de plusieurs % au premier palier. On
   *  autorise donc le cadre à dépasser de VIEW_SLACK de sa taille. */
  function clampPose(px: number, py: number, z: number): { panX: number; panY: number } {
    if (!surfaceW || !surfaceH || !frameW || !frameH) return { panX: px, panY: py };
    const sx = surfaceLeft();
    const sy = surfaceTop();
    const slackX = frameW * VIEW_SLACK;
    const slackY = frameH * VIEW_SLACK;
    return {
      panX:
        z * surfaceW >= frameW
          ? Math.min(-z * sx + slackX, Math.max(frameW - z * (sx + surfaceW) - slackX, px))
          : (frameW * (1 - z)) / 2,
      panY:
        z * surfaceH >= frameH
          ? Math.min(-z * sy + slackY, Math.max(frameH - z * (sy + surfaceH) - slackY, py))
          : (frameH * (1 - z)) / 2,
    };
  }

  function clampPan(): void {
    const c = clampPose(panX, panY, zoom);
    panX = c.panX;
    panY = c.panY;
  }

  function panForPose(p: CameraPose): { panX: number; panY: number; zoom: number } {
    const z = clampZoom(p.zoom);
    return {
      panX: frameW / 2 - z * (surfaceLeft() + surfaceW * p.fx),
      panY: frameH / 2 - z * (surfaceTop() + surfaceH * p.fy),
      zoom: z,
    };
  }

  function stopAnim(): void {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function apply(target: { panX: number; panY: number; zoom: number }, instant: boolean): void {
    stopAnim();
    if (instant || prefersReducedMotion()) {
      panX = target.panX;
      panY = target.panY;
      zoom = target.zoom;
      clampPan();
      onFrame?.();
      return;
    }
    const from = { panX, panY, zoom };
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / DURATION);
      const e = easeInOutCubic(t);
      panX = from.panX + (target.panX - from.panX) * e;
      panY = from.panY + (target.panY - from.panY) * e;
      zoom = from.zoom + (target.zoom - from.zoom) * e;
      onFrame?.();
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        raf = null;
        clampPan();
        onFrame?.();
      }
    };
    raf = requestAnimationFrame(step);
  }

  function setPose(p: CameraPose, opts: CameraMoveOptions = {}): void {
    if (!surfaceW || !surfaceH || !frameW || !frameH) return;
    const t = panForPose(p);
    const c = clampPose(t.panX, t.panY, t.zoom);
    // Cible déjà atteinte après clamp : ne rien faire. C'est le cas quand la
    // carte tient entièrement dans le cadre — le clamp recentre, donc un
    // recadrage sur un pion est un non-événement (sinon l'animation part et
    // revient).
    if (t.zoom === zoom && Math.abs(c.panX - panX) <= 0.5 && Math.abs(c.panY - panY) <= 0.5) {
      return;
    }
    apply({ panX: c.panX, panY: c.panY, zoom: t.zoom }, opts.instant ?? true);
  }

  function reset(opts: CameraMoveOptions = {}): void {
    setPose({ fx: 0.5, fy: 0.5, zoom: 1 }, { instant: opts.instant ?? false });
  }

  function panBy(dx: number, dy: number): void {
    stopAnim();
    panX += dx;
    panY += dy;
    clampPan();
    onFrame?.();
  }

  /** Zoom ancré : le point du cadre (fx, fy) reste sous le pointeur. */
  function zoomAtPoint(fx: number, fy: number, factor: number, opts: CameraMoveOptions = {}): void {
    if (!surfaceW || !surfaceH || !frameW || !frameH) return;
    const z1 = clampZoom(zoom * factor);
    if (z1 === zoom) return;
    const u = (fx - panX) / zoom;
    const v = (fy - panY) / zoom;
    apply({ panX: fx - z1 * u, panY: fy - z1 * v, zoom: z1 }, opts.instant ?? true);
  }

  function zoomBy(factor: number, opts: CameraMoveOptions = {}): void {
    zoomAtPoint(frameW / 2, frameH / 2, factor, opts);
  }

  function centerOn(
    fx: number,
    fy: number,
    opts: CameraMoveOptions & { zoom?: number } = {},
  ): void {
    setPose({ fx, fy, zoom: opts.zoom ?? zoom }, { instant: opts.instant ?? false });
  }

  return {
    get panX(): number {
      return panX;
    },
    get panY(): number {
      return panY;
    },
    get zoom(): number {
      return zoom;
    },
    get pose(): CameraPose {
      if (!surfaceW || !surfaceH || !frameW || !frameH) return { fx: 0.5, fy: 0.5, zoom };
      return {
        fx: ((frameW / 2 - panX) / zoom - surfaceLeft()) / surfaceW,
        fy: ((frameH / 2 - panY) / zoom - surfaceTop()) / surfaceH,
        zoom,
      };
    },
    setViewport(w: number, h: number): void {
      frameW = Math.max(0, w);
      frameH = Math.max(0, h);
      clampPan();
    },
    setSurface(w: number, h: number): void {
      surfaceW = Math.max(0, w);
      surfaceH = Math.max(0, h);
      clampPan();
    },
    setPose,
    reset,
    panBy,
    zoomAtPoint,
    zoomBy,
    centerOn,
  };
}

export type Camera = ReturnType<typeof createCamera>;
