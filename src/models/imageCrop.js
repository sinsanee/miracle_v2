const sharp = require("sharp");

async function cropImage(buffer, cropMode) {
  const isStretch = cropMode === "stretch";

  return sharp(buffer)
    .resize(600, 550, {
      fit: isStretch ? "fill" : "cover",
      position: isStretch ? undefined : cropMode,
      kernel: sharp.kernel.lanczos3, // High-quality resampling
      fastShrinkOnLoad: false // Disable fast shrink for better quality
    })
    .png({
      compressionLevel: 6, // Balance between file size and quality (0-9)
      quality: 100, // Maximum quality
      palette: false // Disable palette-based PNG for better quality
    })
    .toBuffer();
}

module.exports = { cropImage };