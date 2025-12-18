const { createCanvas, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

registerFont(
  path.join(__dirname, "src/fonts/Goldman-Bold.ttf"),
  { family: "GoldmanBold" }
);

const canvas = createCanvas(400, 200);
const ctx = canvas.getContext("2d");

ctx.font = "60px GoldmanBold";
console.log(ctx.font);

ctx.fillStyle = "white";
ctx.fillRect(0, 0, 400, 200);
ctx.fillStyle = "black";
ctx.fillText("TEST", 50, 120);

fs.writeFileSync("out.png", canvas.toBuffer());