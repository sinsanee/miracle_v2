const path = require("path");
const { GlobalFonts } = require("@napi-rs/canvas");

GlobalFonts.registerFromPath(
  path.join(__dirname, "../fonts/Goldman-Bold.ttf"),
  "Goldman"
);

// Export font CSS for SVG usage
const fontCSS = `
  @font-face {
    font-family: 'Goldman';
    src: url('${path.join(__dirname, "../fonts/Goldman-Bold.ttf")}');
  }
`;

module.exports = { fontCSS };
