// textCanvas.js
const { createCanvas } = require("@napi-rs/canvas");

const CANVAS_WIDTH = 675;
const CANVAS_HEIGHT = 910;
const IMAGE_WIDTH = 550;


function fitTextToWidth(ctx, text, {
  maxWidth,
  fontFamily,
  startSize,
  minSize = 16
}) {
  let fontSize = startSize;

  while (fontSize > minSize) {
    ctx.font = `${fontSize}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) {
      break;
    }
    fontSize--;
  }

  return fontSize;
}

function drawTextLayer({ name, subtitle, footer }) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.textBaseline = "alphabetic";

  // 🔹 NAME (auto-sized, centered)
  ctx.textAlign = "center";
  const nameSize = fitTextToWidth(ctx, name, {
    maxWidth: 520,
    fontFamily: "Goldman",
    startSize: 50,
    minSize: 28
  });

  ctx.font = `${nameSize}px Goldman`;
  ctx.fillText(name, CANVAS_WIDTH / 2, 715);

  // 🔹 SUBTITLE (centered)
  ctx.font = "22px Goldman";
  ctx.fillText(subtitle, CANVAS_WIDTH / 2, 740);

  // 🔹 FOOTER / 3rd TEXT (left-aligned, fixed)
  ctx.textAlign = "left";
  ctx.font = "18px Goldman";
  ctx.fillText(footer, 90, 817);

  return canvas.toBuffer("image/png");
}


module.exports = { drawTextLayer };