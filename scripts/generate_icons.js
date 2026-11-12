const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgTemplate = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff4742"/>
      <stop offset="100%" stop-color="#d92b26"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#grad)"/>
  <g filter="url(#shadow)">
    <!-- Document background -->
    <path d="M40 26 h32 l24 24 v52 a4 4 0 0 1 -4 4 H40 a4 4 0 0 1 -4 -4 V30 a4 4 0 0 1 4 -4 z" fill="#ffffff"/>
    <!-- Folded corner -->
    <path d="M72 26 v20 a4 4 0 0 0 4 4 h20 z" fill="#f0f0f5"/>
    <!-- Accent lines -->
    <rect x="48" y="62" width="32" height="6" rx="3" fill="#e5322d"/>
    <rect x="48" y="74" width="24" height="6" rx="3" fill="#e5322d" opacity="0.8"/>
    <rect x="48" y="86" width="28" height="6" rx="3" fill="#e5322d" opacity="0.6"/>
  </g>
</svg>
`;

async function generate() {
  const iconDir = path.join(__dirname, 'extension', 'icons');
  if (!fs.existsSync(iconDir)) {
    fs.mkdirSync(iconDir, { recursive: true });
  }

  const sizes = [16, 32, 48, 128];
  for (const s of sizes) {
    const outPath = path.join(iconDir, `icon${s}.png`);
    await sharp(Buffer.from(svgTemplate))
      .resize(s, s)
      .png()
      .toFile(outPath);
    console.log(`Generated: icon${s}.png`);
  }
}

generate().catch(console.error);
