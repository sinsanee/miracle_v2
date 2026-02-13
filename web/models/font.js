const path = require("path");
const { GlobalFonts } = require("@napi-rs/canvas");

// Use absolute path resolution
const fontPath = path.resolve(__dirname, "../fonts/Goldman-Bold.ttf");

console.log("🔤 Loading font from:", fontPath);

try {
  GlobalFonts.registerFromPath(fontPath, "Goldman");
  console.log("✅ Font registered successfully");
  
  // Verify font is available
  const families = GlobalFonts.families;
  if (families.some(f => f.family === "Goldman")) {
    console.log("✅ Goldman font is available");
  } else {
    console.error("❌ Goldman font not found in registered families");
    console.log("Available fonts:", families.map(f => f.family));
  }
} catch (error) {
  console.error("❌ Failed to register font:", error.message);
  console.error("Font path attempted:", fontPath);
  
  // Check if file exists
  const fs = require('fs');
  if (fs.existsSync(fontPath)) {
    console.log("File exists but failed to load - may be corrupted or wrong format");
  } else {
    console.log("File does not exist at this path");
    
    // Try to find it
    const fontsDir = path.dirname(fontPath);
    if (fs.existsSync(fontsDir)) {
      console.log("Fonts directory contents:");
      fs.readdirSync(fontsDir).forEach(file => console.log(" -", file));
    }
  }
}

// Export font CSS for SVG usage (if needed)
const fontCSS = `
  @font-face {
    font-family: 'Goldman';
    src: url('${fontPath}');
  }
`;

module.exports = { fontCSS };
