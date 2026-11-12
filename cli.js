#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { convertImagesToPdf } = require('./lib/imageToPdf');
const { compressPdf } = require('./lib/pdfCompressor');
const { compressAndConvertImage } = require('./lib/imageProcessor');

function printUsage() {
  console.log(`
======================================================
  DocDock CLI - Image to PDF & PDF Compressor Tool
======================================================

Usage:
  node cli.js img2pdf <images...> [options]
  node cli.js compress <input.pdf> [options]
  node cli.js img-process <images...> [options]

Commands:
  img2pdf <images...>
    Convert one or more images into PDF format.
    Options:
      -o, --output <file>       Output PDF path (default: output.pdf)
      --orientation <type>      'portrait' (default), 'landscape', or 'auto'
      --pagesize <size>         'fit' (default), 'A4', or 'letter'
      --margin <number>         '0' (default), '20' (small), or '40' (big)
      --no-merge                Output separate PDFs instead of merged PDF

  compress <input.pdf>
    Compress a PDF file with intelligent downsampling and stream compaction.
    Options:
      -o, --output <file>       Output compressed PDF path (default: <name>_compressed.pdf)
      --level <level>           'extreme', 'recommended' (default), or 'low'

  img-process <images...>
    Compress images and/or change image format (JPG, PNG, WebP).
    Options:
      -f, --format <format>     'jpeg', 'png', or 'webp' (default: jpeg)
      -q, --quality <number>    Quality from 1 to 100 (default: 75)
      --max-dim <number>        Max width/height in pixels
      -o, --output <file>       Output file path (for single file)

Examples:
  node cli.js img2pdf photo1.jpg photo2.png -o my_document.pdf --pagesize A4 --margin 20
  node cli.js compress heavy_scans.pdf -o compact.pdf --level extreme
  node cli.js img-process photo.png --format webp --quality 70 -o photo.webp
`);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0].toLowerCase();

  if (command === 'img2pdf' || command === 'image-to-pdf') {
    let output = 'output.pdf';
    let orientation = 'portrait';
    let pageSize = 'fit';
    let margin = 0;
    let merge = true;
    const imagePaths = [];

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-o' || arg === '--output') {
        output = args[++i];
      } else if (arg === '--orientation') {
        orientation = args[++i];
      } else if (arg === '--pagesize') {
        pageSize = args[++i];
      } else if (arg === '--margin') {
        margin = Number(args[++i]) || 0;
      } else if (arg === '--no-merge') {
        merge = false;
      } else if (!arg.startsWith('-')) {
        imagePaths.push(arg);
      }
    }

    if (imagePaths.length === 0) {
      console.error('Error: Please provide at least one image file.');
      process.exit(1);
    }

    console.log(`Processing ${imagePaths.length} image(s)...`);
    const images = imagePaths.map(p => {
      const absPath = path.resolve(p);
      if (!fs.existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}`);
      }
      return {
        filename: path.basename(absPath),
        buffer: fs.readFileSync(absPath),
        rotation: 0
      };
    });

    const result = await convertImagesToPdf(images, {
      orientation,
      pageSize,
      margin,
      merge
    });

    if (result.mergedBuffer) {
      const outPath = path.resolve(output);
      fs.writeFileSync(outPath, result.mergedBuffer);
      console.log(`Successfully generated PDF: ${outPath} (${(result.mergedBuffer.length / 1024).toFixed(1)} KB)`);
    } else if (result.files) {
      for (const item of result.files) {
        const outPath = path.resolve(item.filename);
        fs.writeFileSync(outPath, item.buffer);
        console.log(`Generated: ${outPath} (${(item.buffer.length / 1024).toFixed(1)} KB)`);
      }
    }
  } else if (command === 'compress' || command === 'compress-pdf') {
    let input = null;
    let output = null;
    let level = 'recommended';

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-o' || arg === '--output') {
        output = args[++i];
      } else if (arg === '--level') {
        level = args[++i];
      } else if (!arg.startsWith('-') && !input) {
        input = arg;
      }
    }

    if (!input) {
      console.error('Error: Please provide an input PDF file.');
      process.exit(1);
    }

    const inputPath = path.resolve(input);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: File not found: ${inputPath}`);
      process.exit(1);
    }

    if (!output) {
      const parsed = path.parse(inputPath);
      output = path.join(parsed.dir, `${parsed.name}_compressed${parsed.ext}`);
    }

    console.log(`Compressing PDF: ${inputPath} [Level: ${level}]...`);
    const pdfBuffer = fs.readFileSync(inputPath);
    const result = await compressPdf(pdfBuffer, level);

    const outputPath = path.resolve(output);
    fs.writeFileSync(outputPath, result.compressedBuffer);

    console.log(`\n================== Compression Results ==================`);
    console.log(`Original size:    ${(result.originalSize / 1024).toFixed(1)} KB`);
    console.log(`Compressed size:  ${(result.compressedSize / 1024).toFixed(1)} KB`);
    console.log(`Savings:          ${result.savingsPercent}% (-${(result.savedBytes / 1024).toFixed(1)} KB)`);
    console.log(`Images Optimized: ${result.imagesOptimized}`);
    console.log(`Saved output to:  ${outputPath}`);
  } else if (command === 'img-process' || command === 'compress-img' || command === 'convert-img') {
    let output = null;
    let format = 'jpeg';
    let quality = 75;
    let maxDim = null;
    const imagePaths = [];

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-o' || arg === '--output') {
        output = args[++i];
      } else if (arg === '-f' || arg === '--format') {
        format = args[++i];
      } else if (arg === '-q' || arg === '--quality') {
        quality = parseInt(args[++i], 10);
      } else if (arg === '--max-dim') {
        maxDim = parseInt(args[++i], 10);
      } else if (!arg.startsWith('-')) {
        imagePaths.push(arg);
      }
    }

    if (imagePaths.length === 0) {
      console.error('Error: Please provide at least one image file.');
      process.exit(1);
    }

    for (const imgPath of imagePaths) {
      const absPath = path.resolve(imgPath);
      if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        continue;
      }

      const inputBuffer = fs.readFileSync(absPath);
      const result = await compressAndConvertImage(inputBuffer, {
        format,
        quality,
        maxDimension: maxDim
      });

      const parsed = path.parse(absPath);
      const ext = result.format === 'jpeg' ? 'jpg' : result.format;
      const targetOut = output || path.join(parsed.dir, `${parsed.name}_processed.${ext}`);
      fs.writeFileSync(path.resolve(targetOut), result.buffer);

      console.log(`\nProcessed: ${path.basename(absPath)} -> ${path.basename(targetOut)}`);
      console.log(`Format:    ${result.format.toUpperCase()} (${result.width}x${result.height})`);
      console.log(`Original:  ${(result.originalSize / 1024).toFixed(1)} KB`);
      console.log(`New size:  ${(result.newSize / 1024).toFixed(1)} KB`);
      console.log(`Savings:   ${result.savingsPercent}% (-${(result.savedBytes / 1024).toFixed(1)} KB)`);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Operation failed:', err);
  process.exit(1);
});
