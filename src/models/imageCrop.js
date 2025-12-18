const sharp = require("sharp");

async function cropImage(buffer, cropMode) {
  const isStretch = cropMode === "stretch";

  return sharp(buffer)
    .resize(550, 600, {
      fit: isStretch ? "fill" : "cover",
      position: isStretch ? undefined : cropMode
    })
    .png()
    .toBuffer();
}

module.exports = { cropImage };