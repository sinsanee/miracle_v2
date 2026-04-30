const sharp = require("sharp");
const path  = require("path");
const { drawTextLayer } = require("./textCanvas");

const CANVAS_WIDTH  = 675;
const CANVAS_HEIGHT = 910;

const WEAR_IMAGE_PATH     = path.join(__dirname, "../img/cards/wear.png");
const DEFAULT_BORDER_PATH = path.join(__dirname, "../img/borders/default.png");

// ── Condition wear overlay ────────────────────────────────────────────────────

const CONDITION_OPACITY = {
  1: 0.70,
  2: 0.50,
  3: 0.35,
  4: 0.15,
  5: 0
};

async function buildWearOverlay(condition) {
  const opacity = CONDITION_OPACITY[condition];
  if (!opacity) return null;

  return sharp(WEAR_IMAGE_PATH)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      for (let i = 3; i < data.length; i += 4) {
        data[i] = Math.round(data[i] * opacity);
      }
      return sharp(Buffer.from(data), {
        raw: { width: info.width, height: info.height, channels: 4 }
      }).png().toBuffer();
    });
}

// ── Paint color system ────────────────────────────────────────────────────────

/**
 * Named color anchors.
 * `weight` is a RARITY SCORE — higher = rarer = less likely to roll.
 * Probability of picking an anchor = (1/weight) / sum(1/weight for all anchors).
 */
const COLOR_ANCHORS = [
  // ── Named colors from spec ────────────────────────────────────────────────
  { name: "Black",       r:   0, g:   0, b:   0, weight: 100000 },
  { name: "Pure Red",    r: 255, g:   0, b:   0, weight:  10000 },
  { name: "Pure Blue",   r:   0, g:   0, b: 255, weight:   8000 },
  { name: "Pure Purple", r: 128, g:   0, b: 128, weight:   2000 },
  { name: "Pure Green",  r:   0, g: 128, b:   0, weight:   2000 },
  { name: "Pure Cyan",   r:   0, g: 255, b: 255, weight:    200 },
  { name: "Gray",        r: 128, g: 128, b: 128, weight:    100 },
  { name: "Lime",        r:   0, g: 255, b:   0, weight:     75 },
  { name: "Brown",       r: 139, g:  69, b:  19, weight:     60 },
  { name: "White",       r: 255, g: 255, b: 255, weight:     50 },
  { name: "Orange",      r: 255, g: 165, b:   0, weight:     10 },
  { name: "Yellow",      r: 255, g: 255, b:   0, weight:      1 },

  // ── Mid-spectrum fill anchors (weight 3–20, common-ish) ───────────────────
  { name: "Rose",        r: 255, g:   0, b: 128, weight:     15 },
  { name: "Magenta",     r: 255, g:   0, b: 255, weight:     12 },
  { name: "Azure",       r:   0, g: 128, b: 255, weight:     12 },
  { name: "Teal",        r:   0, g: 128, b: 128, weight:      8 },
  { name: "Olive",       r: 128, g: 128, b:   0, weight:      8 },
  { name: "Maroon",      r: 128, g:   0, b:   0, weight:     10 },
  { name: "Navy",        r:   0, g:   0, b: 128, weight:     10 },
  { name: "Indigo",      r:  75, g:   0, b: 130, weight:     15 },
  { name: "Salmon",      r: 250, g: 128, b: 114, weight:      6 },
  { name: "Gold",        r: 255, g: 215, b:   0, weight:      3 },
  { name: "Chartreuse",  r: 128, g: 255, b:   0, weight:      5 },
  { name: "SpringGreen", r:   0, g: 255, b: 128, weight:      5 },
  { name: "DodgerBlue",  r:  30, g: 144, b: 255, weight:      7 },
  { name: "HotPink",     r: 255, g: 105, b: 180, weight:      4 },
  { name: "Coral",       r: 255, g: 127, b:  80, weight:      4 },
  { name: "Violet",      r: 238, g: 130, b: 238, weight:      6 },
  { name: "Turquoise",   r:  64, g: 224, b: 208, weight:      5 },
  { name: "Wheat",       r: 245, g: 222, b: 179, weight:      7 },
  { name: "Lavender",    r: 230, g: 230, b: 250, weight:      6 },
  { name: "Mint",        r: 189, g: 252, b: 201, weight:      5 },
  { name: "Peach",       r: 255, g: 218, b: 185, weight:      5 },
  { name: "Steel",       r:  70, g: 130, b: 180, weight:      7 },
];

// Pre-compute inverted weight total
const TOTAL_INV_WEIGHT = COLOR_ANCHORS.reduce((s, a) => s + 1 / a.weight, 0);

const JITTER = 30;

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/**
 * Roll a random RGB color, weighted inversely by anchor rarity score.
 * Higher weight = rarer = less likely.
 */
function rollPaintColor() {
  let rand = Math.random() * TOTAL_INV_WEIGHT;
  let anchor = COLOR_ANCHORS[COLOR_ANCHORS.length - 1];
  for (const a of COLOR_ANCHORS) {
    rand -= 1 / a.weight;
    if (rand <= 0) { anchor = a; break; }
  }

  const jitter = () => (Math.random() * 2 - 1) * JITTER;
  return {
    r: clamp(anchor.r + jitter()),
    g: clamp(anchor.g + jitter()),
    b: clamp(anchor.b + jitter()),
    anchorName: anchor.name
  };
}

/**
 * Roll effects independently. Each is 1/100.
 * Returns { mirror, grayscale, effectCode }
 */
function rollEffects() {
  const mirror    = Math.random() < 0.01;
  const grayscale = Math.random() < 0.01;
  let effectCode  = null;
  if (mirror && grayscale) effectCode = "MG";
  else if (mirror)         effectCode = "M";
  else if (grayscale)      effectCode = "G";
  return { mirror, grayscale, effectCode };
}

// ── Border resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the correct border buffer for a card, applying tint if painted.
 *
 * Rules:
 *  - borderType null + no paint/effect  → set border from webserver (setBorderUrl)
 *  - borderType null + paint or effect   → default.png from disk, then tinted
 *  - borderType other                    → fetch that border image from webserver, then tinted
 *
 * @param {string|null} borderType    null or a custom border name
 * @param {string}      setBorderUrl  Full URL to the set's border on the webserver
 * @param {string|null} customBorderUrl Full URL to the custom border image (if not null)
 * @param {number|null} paintR
 * @param {number|null} paintG
 * @param {number|null} paintB
 * @param {Function}    resolveImageBuffer  The existing image-fetching helper
 */
async function resolveBorderBuffer(borderType, setBorderUrl, customBorderUrl, paintR, paintG, paintB, resolveImageBuffer) {
  const hasPaint = paintR != null && paintG != null && paintB != null;

  if (borderType === null || borderType === undefined) {
    if (!hasPaint) {
      // Plain set border, no tinting needed
      return resolveImageBuffer(setBorderUrl);
    } else {
      // Tint the local default border
      const raw = await sharp(DEFAULT_BORDER_PATH).png().toBuffer();
      return tintBorder(raw, paintR, paintG, paintB);
    }
  } else {
    // Custom border — fetch from webserver, then tint if painted
    const raw = await resolveImageBuffer(customBorderUrl);
    if (hasPaint) {
      return tintBorder(raw, paintR, paintG, paintB);
    }
    return raw;
  }
}

/**
 * Tint a border buffer with the given RGB color.
 * Near-black pixels (all channels ≤ 10) are left untouched.
 */
async function tintBorder(borderBuffer, r, g, b) {
  const { data, info } = await sharp(borderBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const fr = r / 255;
  const fg = g / 255;
  const fb = b / 255;

  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    if (pr <= 10 && pg <= 10 && pb <= 10) continue;
    data[i]     = clamp(pr * fr);
    data[i + 1] = clamp(pg * fg);
    data[i + 2] = clamp(pb * fb);
  }

  return sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();
}

// ── Effects ───────────────────────────────────────────────────────────────────

async function applyEffects(imageBuffer, effect) {
  const mirror    = effect?.includes("M") ?? false;
  const grayscale = effect?.includes("G") ?? false;
  let img = sharp(imageBuffer);
  if (mirror)    img = img.flop();
  if (grayscale) img = img.grayscale();
  return (mirror || grayscale) ? img.png().toBuffer() : imageBuffer;
}

// ── Core card generation ──────────────────────────────────────────────────────

/**
 * Generate a card from a raw (uncropped) image buffer.
 *
 * @param {Buffer}      imageBuffer
 * @param {object}      data          { name, subtitle, footer }
 * @param {string}      cropMode
 * @param {Buffer}      borderBuffer  Pre-resolved border (use resolveBorderBuffer before calling)
 * @param {number}      condition     1–5
 * @param {string|null} effect        null | 'M' | 'G' | 'MG'
 */
async function cardGen(imageBuffer, data, cropMode = "centre", borderBuffer, condition = 5, effect = null) {
  const isStretch = cropMode === "stretch";

  let cardImageBuffer = await sharp(imageBuffer)
    .resize(550, 600, {
      fit: isStretch ? "fill" : "cover",
      position: isStretch ? undefined : cropMode
    })
    .toBuffer();

  cardImageBuffer = await applyEffects(cardImageBuffer, effect);

  const textLayer   = drawTextLayer(data);
  const wearOverlay = await buildWearOverlay(condition);

  const layers = [
    { input: cardImageBuffer, left: 62, top: 62 },
    { input: borderBuffer },
    { input: textLayer }
  ];
  if (wearOverlay) layers.push({ input: wearOverlay, left: 0, top: 0 });

  return sharp({
    create: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(layers).png().toBuffer();
}

/**
 * Generate a card from a pre-cropped image buffer.
 *
 * @param {Buffer}      croppedImage
 * @param {object}      data          { name, subtitle, footer }
 * @param {Buffer}      borderBuffer  Pre-resolved border (use resolveBorderBuffer before calling)
 * @param {number}      condition     1–5
 * @param {string|null} effect        null | 'M' | 'G' | 'MG'
 */
async function cardGenFromCropped(croppedImage, data, borderBuffer, condition = 5, effect = null) {
  const cardImageBuffer = await applyEffects(croppedImage, effect);

  const textLayer   = drawTextLayer(data);
  const wearOverlay = await buildWearOverlay(condition);

  const layers = [
    { input: cardImageBuffer, left: 62, top: 62 },
    { input: borderBuffer },
    { input: textLayer }
  ];
  if (wearOverlay) layers.push({ input: wearOverlay, left: 0, top: 0 });

  return sharp({
    create: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(layers).png().toBuffer();
}

module.exports = { cardGen, cardGenFromCropped, resolveBorderBuffer, rollPaintColor, rollEffects };
