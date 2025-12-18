const sharp = require("sharp");
const { drawTextLayer } = require("./textCanvas");

const CANVAS_WIDTH = 675;
const CANVAS_HEIGHT = 910;
const IMAGE_WIDTH = 550;
const IMAGE_HEIGHT = 600;

async function cardGen(imageBuffer, data, cropMode = "centre") {
  const isStretch = cropMode === "stretch";

  const resizedImage = await sharp(imageBuffer)
    .resize(550, 600, {
      fit: isStretch ? "fill" : "cover",
      position: isStretch ? undefined : cropMode
    })
    .toBuffer();

  const textLayer = drawTextLayer(data);

  return sharp({
    create: {
      width: 675,
      height: 910,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: resizedImage, left: 62, top: 62 },
      { input: "./src/img/borders/atpl2.png" },
      { input: textLayer }
    ])
    .png()
    .toBuffer();
}

async function cardGenFromCropped(croppedImage, data) {
  const textLayer = drawTextLayer(data);

  return sharp({
    create: {
      width: 675,
      height: 910,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: croppedImage, left: 62, top: 62 },
      { input: "./src/img/borders/atpl2.png" },
      { input: textLayer }
    ])
    .png()
    .toBuffer();
}

module.exports = { cardGen, cardGenFromCropped };