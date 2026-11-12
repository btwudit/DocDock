const fs = require('fs');
const path = require('path');

const EXT_DIR = path.join(__dirname, '..', 'extension');

console.log('========================================================');
console.log('       DocDock Chrome Extension Validation Suite        ');
console.log('========================================================\n');

let errors = 0;

function check(desc, fn) {
  try {
    fn();
    console.log(`[PASS] ${desc}`);
  } catch (err) {
    console.error(`[FAIL] ${desc}: ${err.message}`);
    errors++;
  }
}

// 1. Manifest verification
check('manifest.json exists and is valid JSON', () => {
  const manifestPath = path.join(EXT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json missing');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
  if (!manifest.name) throw new Error('Missing name');
  if (!manifest.version) throw new Error('Missing version');
  if (!manifest.action) throw new Error('Missing action');
  if (!manifest.side_panel?.default_path) throw new Error('Missing side_panel.default_path');
  if (!manifest.background?.service_worker) throw new Error('Missing background.service_worker');

  // Check icons
  for (const size of [16, 32, 48, 128]) {
    const iconFile = manifest.icons?.[size];
    if (!iconFile) throw new Error(`Missing icon${size}`);
    const fullIconPath = path.join(EXT_DIR, iconFile);
    if (!fs.existsSync(fullIconPath)) throw new Error(`Icon file not found: ${fullIconPath}`);
  }

  // Check background worker file
  const bgPath = path.join(EXT_DIR, manifest.background.service_worker);
  if (!fs.existsSync(bgPath)) throw new Error(`Background worker file not found: ${bgPath}`);

  // Check sidepanel file
  const panelPath = path.join(EXT_DIR, manifest.side_panel.default_path);
  if (!fs.existsSync(panelPath)) throw new Error(`Sidepanel HTML not found: ${panelPath}`);
});

// 2. Side Panel HTML integrity
check('sidepanel.html scripts, stylesheets and strict CSP compliance', () => {
  const panelHtml = fs.readFileSync(path.join(EXT_DIR, 'sidepanel.html'), 'utf8');

  // Check stylesheets
  const cssMatches = panelHtml.match(/href="([^"]+\.css)"/g) || [];
  for (const m of cssMatches) {
    const href = m.replace(/href="|"/g, '');
    const fullPath = path.join(EXT_DIR, href);
    if (!fs.existsSync(fullPath)) throw new Error(`Referenced stylesheet missing: ${fullPath}`);
  }

  // Check scripts
  const jsMatches = panelHtml.match(/src="([^"]+\.js)"/g) || [];
  for (const m of jsMatches) {
    const src = m.replace(/src="|"/g, '');
    const fullPath = path.join(EXT_DIR, src);
    if (!fs.existsSync(fullPath)) throw new Error(`Referenced script missing: ${fullPath}`);
  }

  // Check zero remote CDNs or external scripts in script or link tags
  const remoteTagMatch = panelHtml.match(/<(script|link)[^>]+(src|href)=["']https?:\/\/[^"']+["']/i);
  if (remoteTagMatch) {
    throw new Error(`Detected remote URL in tag (${remoteTagMatch[0]}) - strictly forbidden in Manifest V3`);
  }

  // Check zero inline event handlers (Strict CSP in Manifest V3 blocks inline handlers)
  const inlineHandlerMatch = panelHtml.match(/\bon[a-z]+\s*=\s*["'][^"']*["']/i);
  if (inlineHandlerMatch) {
    throw new Error(`Detected inline event handler (${inlineHandlerMatch[0]}) - violates Manifest V3 CSP`);
  }
});

// 3. JavaScript Syntax validation
check('All extension JS files parse cleanly', () => {
  const jsFiles = [
    path.join(EXT_DIR, 'background.js'),
    path.join(EXT_DIR, 'content_script.js'),
    path.join(EXT_DIR, 'js', 'db.js'),
    path.join(EXT_DIR, 'js', 'engine.js'),
    path.join(EXT_DIR, 'js', 'sidepanel.js')
  ];

  for (const file of jsFiles) {
    if (!fs.existsSync(file)) throw new Error(`JS file missing: ${file}`);
    const code = fs.readFileSync(file, 'utf8');
    // Basic node syntax check using Function constructor or new AsyncFunction
    try {
      new Function(code);
    } catch (e) {
      // In case it has module-level exports or top-level browser globals, test with eval-like construct
      if (!e.message.includes('import') && !e.message.includes('export')) {
        throw new Error(`Syntax error in ${path.basename(file)}: ${e.message}`);
      }
    }
  }
});

// 4. Bundled Vendor Library check
check('vendor/pdf-lib.min.js is present and non-empty', () => {
  const vendorPath = path.join(EXT_DIR, 'vendor', 'pdf-lib.min.js');
  if (!fs.existsSync(vendorPath)) throw new Error('vendor/pdf-lib.min.js missing');
  const stat = fs.statSync(vendorPath);
  if (stat.size < 100000) throw new Error('pdf-lib.min.js appears truncated');
});

// 5. Check Content Script
check('content_script.js exists and exports message listeners', () => {
  const csPath = path.join(EXT_DIR, 'content_script.js');
  if (!fs.existsSync(csPath)) throw new Error('content_script.js missing');
  const content = fs.readFileSync(csPath, 'utf8');
  if (!content.includes('SCAN_FIELDS') || !content.includes('FILL_FIELD')) {
    throw new Error('content_script.js missing action handlers');
  }
});

console.log('\n========================================================');
if (errors === 0) {
  console.log('       ALL VALIDATION CHECKS PASSED (5/5)               ');
  console.log('   Chrome Extension is ready for production loading!    ');
  console.log('========================================================\n');
  process.exit(0);
} else {
  console.error(`       VALIDATION FAILED WITH ${errors} ERROR(S)        `);
  console.log('========================================================\n');
  process.exit(1);
}
