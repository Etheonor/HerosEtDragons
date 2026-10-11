/**
 * Géométrie du cadrage d'avatar (recadrage carré type « cover »).
 *
 * Modèle : l'image est dessinée dans un carré de côté `v` (le viewport de
 * prévisualisation) ; `scale` = pixels affichés par pixel image, avec un
 * minimum « cover » (l'image couvre toujours le carré). L'utilisateur déplace
 * l'image (`ox`, `oy` = coin haut-gauche en px viewport) et zoome (facteur
 * appliqué au cover). Toute la géométrie vit ici, pure et testée ; le composant
 * ne fait que du canvas, du pointeur et du DOM.
 */

export interface CropOffset {
  /** Coin haut-gauche de l'image, en px du viewport carré. */
  ox: number;
  oy: number;
}

export interface CropRect {
  /** Origine du carré source dans l'image (px image). */
  sx: number;
  sy: number;
  /** Côté du carré source (px image) — toujours > 0. */
  size: number;
}

export const CROP_MIN_ZOOM = 1;
export const CROP_MAX_ZOOM = 4;

/** Échelle minimale pour couvrir un carré `v` (cover), en px image → px écran. */
export function coverScale(iw: number, ih: number, v: number): number {
  if (iw <= 0 || ih <= 0 || v <= 0) return 1;
  return Math.max(v / iw, v / ih);
}

export function clampZoom(z: number, min = CROP_MIN_ZOOM, max = CROP_MAX_ZOOM): number {
  return Math.min(max, Math.max(min, z));
}

/** Offset centré (état initial : l'image couvre le carré, centrée). */
export function centeredOffset(dw: number, dh: number, v: number): CropOffset {
  return { ox: (v - dw) / 2, oy: (v - dh) / 2 };
}

/** Borne l'offset pour que l'image couvre TOUJOURS le carré (pas de vide). */
export function clampOffset(ox: number, oy: number, dw: number, dh: number, v: number): CropOffset {
  const minX = Math.min(0, v - dw);
  const minY = Math.min(0, v - dh);
  return {
    ox: Math.min(0, Math.max(minX, ox)),
    oy: Math.min(0, Math.max(minY, oy)),
  };
}

/** Carré source (px image) correspondant au viewport affiché. */
export function cropRect(ox: number, oy: number, scale: number, v: number): CropRect {
  if (scale <= 0) return { sx: 0, sy: 0, size: 1 };
  const size = v / scale;
  return { sx: -ox / scale, sy: -oy / scale, size };
}

/** Zoom ancré sur un point du viewport : le point sous le pointeur ne bouge pas. */
export function zoomAt(
  px: number,
  py: number,
  ox: number,
  oy: number,
  fromScale: number,
  toScale: number,
): CropOffset {
  const ratio = toScale / fromScale;
  return { ox: px - (px - ox) * ratio, oy: py - (py - oy) * ratio };
}
