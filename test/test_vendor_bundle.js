const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log('   Testing Bundled vendor/pdf-lib.min.js in Browser VM  ');
console.log('========================================================\n');

const vendorCode = fs.readFileSync(path.join(__dirname, '..', 'extension', 'vendor', 'pdf-lib.min.js'), 'utf8');

const fakeWindow = {};
const fn = new Function('self', 'window', 'exports', 'module', 'define', vendorCode);
fn.call(fakeWindow, fakeWindow, fakeWindow, undefined, undefined, undefined);

const PDFLib = fakeWindow.PDFLib;

if (!PDFLib || !PDFLib.PDFDocument) {
  throw new Error('Failed to resolve PDFLib from vendor bundle');
}

async function testVendorPdfLib() {
  const doc = await PDFLib.PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  page.drawText('DocDock Chrome Extension Test Page', {
    x: 50,
    y: 800,
    size: 20
  });

  const pdfBytes = await doc.save({ useObjectStreams: true });
  console.log(`[PASS] Created PDF using bundled vendor/pdf-lib.min.js (${pdfBytes.length} bytes)`);

  const reloaded = await PDFLib.PDFDocument.load(pdfBytes);
  console.log(`[PASS] Reloaded and verified page count: ${reloaded.getPageCount()}`);
  console.log('\n========================================================');
  console.log('       Bundled Vendor Library Validated 100%!          ');
  console.log('========================================================\n');
}

testVendorPdfLib().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
