const sharp = require('sharp');
const path = require('path');

// Create a default border image (675x910 with transparent center)
async function createDefaultBorder() {
  const width = 675;
  const height = 910;
  const borderWidth = 62;
  
  // Create SVG border
  const svg = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ff006e;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#8338ec;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#00f5ff;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)" rx="20"/>
      <rect x="${borderWidth}" y="${borderWidth}" 
            width="${width - borderWidth * 2}" 
            height="${height - borderWidth * 2}" 
            fill="black" rx="10"/>
      <rect x="${borderWidth}" y="${borderWidth + 600}" 
            width="${width - borderWidth * 2}" 
            height="${height - borderWidth - 600 - borderWidth}" 
            fill="url(#grad)" rx="0"/>
    </svg>
  `;
  
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(__dirname, 'assets', 'border.png'));
  
  console.log('Default border created at assets/border.png');
}

createDefaultBorder().catch(console.error);
