const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { convertImagesToPdf } = require('../lib/imageToPdf');
const { compressPdf } = require('../lib/pdfCompressor');
const { compressAndConvertImage } = require('../lib/imageProcessor');
const { execSync } = require('child_process');

async function runTestSuite() {
  console.log('========================================================');
  console.log('       DocDock Verification & Automated Test Suite       ');
  console.log('========================================================\n');

  const testDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // 1. Create fixture images
  console.log('[Test 1] Generating test fixture images (JPG & PNG)...');
  const img1Path = path.join(testDir, 'sample1.jpg');
  const img2Path = path.join(testDir, 'sample2.png');

  await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 66, g: 133, b: 244 } }
  }).jpeg({ quality: 90 }).toFile(img1Path);

  await sharp({
    create: { width: 800, height: 1200, channels: 4, background: { r: 234, g: 67, b: 53, alpha: 1 } }
  }).png().toFile(img2Path);

  console.log('  -> Fixtures generated successfully.');

  // 2. Test Image to PDF (Merged, Portrait, A4, Margin 20)
  console.log('\n[Test 2] Testing Image to PDF (A4 Portrait, Margin 20, 2 images merged)...');
  const images = [
    { filename: 'sample1.jpg', buffer: fs.readFileSync(img1Path), rotation: 0 },
    { filename: 'sample2.png', buffer: fs.readFileSync(img2Path), rotation: 90 }
  ];

  const result1 = await convertImagesToPdf(images, {
    orientation: 'portrait',
    pageSize: 'A4',
    margin: 20,
    merge: true
  });

  if (!result1.mergedBuffer || result1.mergedBuffer.length === 0) {
    throw new Error('Image to PDF produced empty buffer');
  }

  // Validate PDF with pdf-lib
  const parsedPdf1 = await PDFDocument.load(result1.mergedBuffer);
  const pageCount1 = parsedPdf1.getPageCount();
  if (pageCount1 !== 2) {
    throw new Error(`Expected 2 pages, got ${pageCount1}`);
  }
  const page1Size = parsedPdf1.getPage(0).getSize();
  console.log(`  -> Success! Generated PDF: ${result1.mergedBuffer.length} bytes, Pages: ${pageCount1}`);
  console.log(`  -> Page 1 Dimensions: ${page1Size.width} x ${page1Size.height} (A4: 595.28 x 841.89)`);

  // 3. Test Image to PDF (Separate files, Fit mode)
  console.log('\n[Test 3] Testing Image to PDF (Separate files, Fit mode)...');
  const result2 = await convertImagesToPdf(images, {
    pageSize: 'fit',
    margin: 0,
    merge: false
  });

  if (!result2.files || result2.files.length !== 2) {
    throw new Error(`Expected 2 separate PDF files, got ${result2.files?.length}`);
  }
  console.log(`  -> Success! Generated ${result2.files.length} individual PDFs.`);

  // 4. Create a heavy uncompressed PDF for testing PDF compressor
  console.log('\n[Test 4] Generating heavy PDF with high-res images for Compressor testing...');
  const heavyDoc = await PDFDocument.create();

  // Add 3 high-res uncompressed photo pages
  for (let i = 0; i < 3; i++) {
    const photoBuffer = await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 3,
        background: { r: 50 + i * 40, g: 100 + i * 30, b: 150 - i * 20 }
      }
    }).jpeg({ quality: 98 }).toBuffer();

    const embedded = await heavyDoc.embedJpg(photoBuffer);
    const p = heavyDoc.addPage([600, 400]);
    p.drawImage(embedded, { x: 0, y: 0, width: 600, height: 400 });
  }

  const heavyPdfBuffer = Buffer.from(await heavyDoc.save({ useObjectStreams: false }));
  const heavyPath = path.join(testDir, 'heavy_document.pdf');
  fs.writeFileSync(heavyPath, heavyPdfBuffer);
  console.log(`  -> Heavy PDF created: ${(heavyPdfBuffer.length / 1024).toFixed(1)} KB`);

  // 5. Test PDF Compressor - Recommended level
  console.log('\n[Test 5] Testing PDF Compressor [Level: Recommended]...');
  const compRecommended = await compressPdf(heavyPdfBuffer, 'recommended');
  console.log(`  -> Original:   ${(compRecommended.originalSize / 1024).toFixed(1)} KB`);
  console.log(`  -> Compressed: ${(compRecommended.compressedSize / 1024).toFixed(1)} KB`);
  console.log(`  -> Savings:    ${compRecommended.savingsPercent}% (-${(compRecommended.savedBytes / 1024).toFixed(1)} KB)`);
  console.log(`  -> Images Optimized: ${compRecommended.imagesOptimized}`);

  // Validate the compressed PDF loads properly
  const validatedComp = await PDFDocument.load(compRecommended.compressedBuffer);
  if (validatedComp.getPageCount() !== 3) {
    throw new Error('Compressed PDF corrupted page count');
  }

  // 6. Test PDF Compressor - Extreme level
  console.log('\n[Test 6] Testing PDF Compressor [Level: Extreme]...');
  const compExtreme = await compressPdf(heavyPdfBuffer, 'extreme');
  console.log(`  -> Original:   ${(compExtreme.originalSize / 1024).toFixed(1)} KB`);
  console.log(`  -> Compressed: ${(compExtreme.compressedSize / 1024).toFixed(1)} KB`);
  console.log(`  -> Savings:    ${compExtreme.savingsPercent}% (-${(compExtreme.savedBytes / 1024).toFixed(1)} KB)`);

  // Clean up fixtures
  fs.rmSync(testDir, { recursive: true, force: true });

  console.log('\n[Test 7] Executing Chrome Extension Manifest & Structure Validator...');
  execSync('node scripts/validate_extension.js', { stdio: 'inherit' });

  console.log('\n[Test 8] Executing Chrome Extension Assistant DOM Test...');
  execSync('node test/test_extension_assistant.js', { stdio: 'inherit' });

  console.log('\n[Test 9] Executing Extension Bundled Vendor Library Test...');
  execSync('node test/test_vendor_bundle.js', { stdio: 'inherit' });

  // 10. Test Image Processor (Compression & Format Conversion)
  console.log('\n[Test 10] Testing Image Compressor & Format Converter (PNG -> WebP & JPG)...');
  const sampleRawImg = await sharp({
    create: { width: 1400, height: 900, channels: 3, background: { r: 80, g: 140, b: 220 } }
  }).png().toBuffer();

  const toWebp = await compressAndConvertImage(sampleRawImg, {
    format: 'webp',
    quality: 70,
    maxDimension: 1200
  });

  if (toWebp.format !== 'webp' || !toWebp.buffer || toWebp.buffer.length === 0) {
    throw new Error('WebP conversion failed');
  }
  console.log(`  -> PNG (${(sampleRawImg.length / 1024).toFixed(1)} KB) -> WebP (${(toWebp.newSize / 1024).toFixed(1)} KB), Savings: ${toWebp.savingsPercent}%`);

  const toJpg = await compressAndConvertImage(sampleRawImg, {
    format: 'jpeg',
    quality: 75
  });

  if (toJpg.format !== 'jpeg' || !toJpg.buffer || toJpg.buffer.length === 0) {
    throw new Error('JPEG conversion failed');
  }
  console.log(`  -> PNG (${(sampleRawImg.length / 1024).toFixed(1)} KB) -> JPEG (${(toJpg.newSize / 1024).toFixed(1)} KB), Savings: ${toJpg.savingsPercent}%`);

  console.log('\n========================================================');
  console.log('     ALL TESTS PASSED SUCCESSFULLY! (10/10 passing)     ');
  console.log('========================================================\n');
}

runTestSuite().catch(err => {
  console.error('\nTest failure:', err);
  process.exit(1);
});
