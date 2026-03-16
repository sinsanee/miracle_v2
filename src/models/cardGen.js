const sharp = require("sharp");
const path = require("path");
const { drawTextLayer } = require("./textCanvas");

const CANVAS_WIDTH = 675;
const CANVAS_HEIGHT = 910;
const IMAGE_WIDTH = 550;
const IMAGE_HEIGHT = 600;

const WEAR_IMAGE_PATH = path.join(__dirname, "../img/cards/wear.png");

// Maps condition (1-5) to opacity (0–1). Condition 5 = Mint = no overlay.
const CONDITION_OPACITY = {
  1: 0.70,
  2: 0.50,
  3: 0.35,
  4: 0.15,
  5: 0      // Mint — overlay skipped entirely
};

/**
 * Build the wear overlay buffer for a given condition (1–5).
 * Returns null for Mint (condition 5).
 */
async function buildWearOverlay(condition) {
  const opacity = CONDITION_OPACITY[condition];
  if (!opacity) return null; // Mint — skip

  // Resize wear.png to fill the full card canvas, then apply opacity
  return sharp(WEAR_IMAGE_PATH)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      // Multiply every alpha channel byte by the desired opacity
      for (let i = 3; i < data.length; i += 4) {
        data[i] = Math.round(data[i] * opacity);
      }
      return sharp(Buffer.from(data), {
        raw: { width: info.width, height: info.height, channels: 4 }
      })
        .png()
        .toBuffer();
    });
}

async function cardGen(imageBuffer, data, cropMode = "centre", border, condition = 5) {
  const isStretch = cropMode === "stretch";

  const resizedImage = await sharp(imageBuffer)
    .resize(550, 600, {
      fit: isStretch ? "fill" : "cover",
      position: isStretch ? undefined : cropMode
    })
    .toBuffer();

  const textLayer = drawTextLayer(data);
  const wearOverlay = await buildWearOverlay(condition);

  const layers = [
    { input: resizedImage, left: 62, top: 62 },
    { input: border },
    { input: textLayer }
  ];

  if (wearOverlay) {
    layers.push({ input: wearOverlay, left: 0, top: 0 });
  }

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(layers)
    .png()
    .toBuffer();
}

async function cardGenFromCropped(croppedImage, data, border, condition = 5) {
  const textLayer = drawTextLayer(data);
  const wearOverlay = await buildWearOverlay(condition);

  const layers = [
    { input: croppedImage, left: 62, top: 62 },
    { input: border },
    { input: textLayer }
  ];

  if (wearOverlay) {
    layers.push({ input: wearOverlay, left: 0, top: 0 });
  }

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(layers)
    .png()
    .toBuffer();
}

module.exports = { cardGen, cardGenFromCropped };