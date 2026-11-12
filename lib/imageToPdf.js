const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

// Standard page dimensions in points (72 points = 1 inch)
const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  letter: { width: 612.0, height: 792.0 },
};

/**
 * Convert one or more images into a single PDF or individual PDFs
 * @param {Array<{ buffer: Buffer, filename: string, rotation?: number }>} images
 * @param {Object} options
 * @param {'portrait'|'landscape'|'auto'} [options.orientation='portrait']
 * @param {'fit'|'A4'|'letter'} [options.pageSize='fit']
 * @param {number} [options.margin=0] - 0, 20, 40 points
 * @param {boolean} [options.merge=true] - Merge all images into one PDF
 * @param {number} [options.quality=85] - JPEG quality
 * @returns {Promise<{ mergedBuffer?: Buffer, files?: Array<{ filename: string, buffer: Buffer }> }>}
 */
async function convertImagesToPdf(images, options = {}) {
  const {
    orientation = 'portrait',
    pageSize = 'fit',
    margin = 0,
    merge = true,
    quality = 85
  } = options;

  if (!images || images.length === 0) {
    throw new Error('No images provided for conversion.');
  }

  // Helper to process a single image into a PDF page
  async function processImage(imageItem, targetDoc) {
    const rawBuffer = imageItem.buffer;
    const itemRotation = Number(imageItem.rotation || 0) % 360;

    // Use Sharp to normalize image, handle rotation and EXIF orientation
    let pipeline = sharp(rawBuffer);
    if (itemRotation !== 0) {
      pipeline = pipeline.rotate(itemRotation);
    } else {
      pipeline = pipeline.rotate(); // auto-rotate based on EXIF orientation
    }

    // Convert to optimized JPEG buffer
    const processedBuffer = await pipeline
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const metadata = await sharp(processedBuffer).metadata();
    const imgWidth = metadata.width;
    const imgHeight = metadata.height;

    let pageWidth, pageHeight;

    if (pageSize === 'fit') {
      // In fit mode, page size equals image dimensions (at 72 dpi)
      // If user forced portrait/landscape, respect that
      const isImgLandscape = imgWidth > imgHeight;
      if (orientation === 'landscape' && !isImgLandscape) {
        pageWidth = imgHeight;
        pageHeight = imgWidth;
      } else if (orientation === 'portrait' && isImgLandscape) {
        pageWidth = imgHeight;
        pageHeight = imgWidth;
      } else {
        pageWidth = imgWidth;
        pageHeight = imgHeight;
      }
    } else {
      const base = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
      if (orientation === 'landscape') {
        pageWidth = Math.max(base.width, base.height);
        pageHeight = Math.min(base.width, base.height);
      } else {
        pageWidth = Math.min(base.width, base.height);
        pageHeight = Math.max(base.width, base.height);
      }
    }

    const page = targetDoc.addPage([pageWidth, pageHeight]);
    const embeddedImage = await targetDoc.embedJpg(processedBuffer);

    // Compute bounding box respecting margins
    const marginNum = Math.max(0, Number(margin) || 0);
    const availWidth = Math.max(10, pageWidth - marginNum * 2);
    const availHeight = Math.max(10, pageHeight - marginNum * 2);

    // Maintain aspect ratio within available area
    const scale = Math.min(availWidth / embeddedImage.width, availHeight / embeddedImage.height);
    const drawWidth = embeddedImage.width * scale;
    const drawHeight = embeddedImage.height * scale;

    // Center image on the page
    const x = marginNum + (availWidth - drawWidth) / 2;
    const y = marginNum + (availHeight - drawHeight) / 2;

    page.drawImage(embeddedImage, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }

  if (merge) {
    const doc = await PDFDocument.create();
    for (const img of images) {
      await processImage(img, doc);
    }
    const mergedBuffer = await doc.save({ useObjectStreams: true });
    return { mergedBuffer };
  } else {
    // Generate individual PDFs
    const results = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const doc = await PDFDocument.create();
      await processImage(img, doc);
      const buffer = await doc.save({ useObjectStreams: true });
      const baseName = (img.filename || `image_${i + 1}`).replace(/\.[^/.]+$/, '');
      results.push({
        filename: `${baseName}.pdf`,
        buffer: Buffer.from(buffer)
      });
    }
    return { files: results };
  }
}

module.exports = {
  convertImagesToPdf,
  PAGE_SIZES
};
