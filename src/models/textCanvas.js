const { createCanvas } = require("@napi-rs/canvas");

const CANVAS_WIDTH = 675;
const CANVAS_HEIGHT = 910;

function drawTextLayer({ name, subtitle }) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "white";

  ctx.font = "60px Goldman";
  ctx.fillText(name, CANVAS_WIDTH / 2, 672);

  ctx.font = "25px Goldman";
  ctx.fillText(subtitle, CANVAS_WIDTH / 2, 720);

  return canvas.toBuffer("image/png");
}

module.exports = { drawTextLayer };