const sharp = require("sharp");
const { drawTextLayer } = require("./textCanvas");

const CANVAS_WIDTH = 675;
const CANVAS_HEIGHT = 910;
const IMAGE_WIDTH = 550;
const IMAGE_HEIGHT = 600;

async function cardGen(imageBuffer, data) {
  const resizedImage = await sharp(imageBuffer)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: "cover" })
    .toBuffer();

  const textLayer = drawTextLayer(data);

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: resizedImage,
        left: Math.floor((CANVAS_WIDTH - IMAGE_WIDTH) / 2),
        top: 62
      },
      { input: "./src/img/borders/atpl2.png" },
      { input: textLayer }
    ])
    .png()
    .toBuffer();
}

module.exports = { cardGen };