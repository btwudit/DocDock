const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const archiver = require('archiver');
const { convertImagesToPdf } = require('./lib/imageToPdf');
const { compressPdf, COMPRESSION_PROFILES } = require('./lib/pdfCompressor');
const { compressAndConvertImage } = require('./lib/imageProcessor');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for in-memory file uploads (max 100MB per file)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// API: System status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    app: 'DocDock',
    version: '1.1.0',
    features: ['image_to_pdf', 'compress_pdf', 'image_compress_convert'],
    compressionLevels: Object.keys(COMPRESSION_PROFILES),
    imageFormats: ['jpeg', 'png', 'webp']
  });
});

// API: Image to PDF
app.post('/api/image-to-pdf', upload.array('images', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files uploaded.' });
    }

    const orientation = req.body.orientation || 'portrait';
    const pageSize = req.body.pagesize || req.body.pageSize || 'fit';
    const margin = Number(req.body.margin) || 0;
    const merge = req.body.merge_after === undefined ? true : (req.body.merge_after === 'true' || req.body.merge_after === '1' || req.body.merge_after === true);

    let rotations = [];
    if (req.body.rotations) {
      try {
        rotations = JSON.parse(req.body.rotations);
      } catch {
        rotations = [];
      }
    }

    const images = req.files.map((file, idx) => ({
      buffer: file.buffer,
      filename: file.originalname,
      rotation: rotations[idx] || 0
    }));

    const result = await convertImagesToPdf(images, {
      orientation,
      pageSize,
      margin,
      merge
    });

    if (merge && result.mergedBuffer) {
      const filename = `docdock_converted_${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Output-Size', result.mergedBuffer.length);
      res.setHeader('X-Page-Count', images.length);
      return res.send(result.mergedBuffer);
    } else if (result.files) {
      // Return a zip containing the individual PDFs
      const archive = archiver('zip', { zlib: { level: 9 } });
      const zipName = `docdock_pdfs_${Date.now()}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      archive.pipe(res);
      for (const item of result.files) {
        archive.append(item.buffer, { name: item.filename });
      }
      return archive.finalize();
    }
  } catch (err) {
    console.error('Image to PDF error:', err);
    res.status(500).json({ error: err.message || 'Image to PDF conversion failed.' });
  }
});

// API: Compress PDF
app.post('/api/compress-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    const level = req.body.compression_level || 'recommended';
    const originalBuffer = req.file.buffer;

    const result = await compressPdf(originalBuffer, level);

    const baseName = req.file.originalname.replace(/\.pdf$/i, '');
    const filename = `${baseName}_compressed.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Original-Size', result.originalSize);
    res.setHeader('X-Compressed-Size', result.compressedSize);
    res.setHeader('X-Saved-Bytes', result.savedBytes);
    res.setHeader('X-Savings-Percent', result.savingsPercent);
    res.setHeader('X-Images-Optimized', result.imagesOptimized);
    res.setHeader('Access-Control-Expose-Headers', 'X-Original-Size, X-Compressed-Size, X-Saved-Bytes, X-Savings-Percent, X-Images-Optimized, Content-Disposition');

    return res.send(result.compressedBuffer);
  } catch (err) {
    console.error('PDF Compress error:', err);
    res.status(500).json({ error: err.message || 'PDF compression failed.' });
  }
});

// API: Image Compress & Format Convert
app.post('/api/image-process', upload.array('images', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files uploaded.' });
    }

    const format = (req.body.format || 'jpeg').toLowerCase();
    const quality = parseInt(req.body.quality, 10) || 75;
    const maxDimension = req.body.max_dimension ? parseInt(req.body.max_dimension, 10) : null;

    if (req.files.length === 1) {
      const file = req.files[0];
      const result = await compressAndConvertImage(file.buffer, {
        format,
        quality,
        maxDimension
      });

      const mimeMap = {
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp'
      };
      const contentType = mimeMap[result.format] || 'image/jpeg';
      const baseName = file.originalname.replace(/\.[^/.]+$/, '');
      const ext = result.format === 'jpeg' ? 'jpg' : result.format;
      const filename = `${baseName}_converted.${ext}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Original-Size', result.originalSize);
      res.setHeader('X-New-Size', result.newSize);
      res.setHeader('X-Saved-Bytes', result.savedBytes);
      res.setHeader('X-Savings-Percent', result.savingsPercent);
      res.setHeader('Access-Control-Expose-Headers', 'X-Original-Size, X-New-Size, X-Saved-Bytes, X-Savings-Percent, Content-Disposition');

      return res.send(result.buffer);
    } else {
      // Multiple files: stream zip archive
      const archive = archiver('zip', { zlib: { level: 9 } });
      const zipName = `docdock_images_${Date.now()}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      archive.pipe(res);

      for (const file of req.files) {
        const result = await compressAndConvertImage(file.buffer, {
          format,
          quality,
          maxDimension
        });
        const baseName = file.originalname.replace(/\.[^/.]+$/, '');
        const ext = result.format === 'jpeg' ? 'jpg' : result.format;
        archive.append(result.buffer, { name: `${baseName}.${ext}` });
      }

      return archive.finalize();
    }
  } catch (err) {
    console.error('Image Process error:', err);
    res.status(500).json({ error: err.message || 'Image processing failed.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  DocDock Server running at http://localhost:${PORT}`);
  console.log(`  - Image to PDF: http://localhost:${PORT}/#image-to-pdf`);
  console.log(`  - PDF Compressor: http://localhost:${PORT}/#compress-pdf`);
  console.log(`======================================================\n`);
});
