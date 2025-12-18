const path = require("path");
const { GlobalFonts } = require("@napi-rs/canvas");

GlobalFonts.registerFromPath(
  path.join(__dirname, "../fonts/Goldman-Bold.ttf"),
  "Goldman"
);