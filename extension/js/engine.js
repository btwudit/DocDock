/**
 * DocDock Client-Side Processing Engine
 * 100% In-Browser Image-to-PDF Conversion and PDF Compression
 * Powered by PDF-Lib and HTML5 Canvas API
 */

const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  letter: { width: 612.0, height: 792.0 }
};

const COMPRESSION_PROFILES = {
  extreme: {
    maxDimension: 900,
    jpegQuality: 0.45,
    downsampleThreshold: 1000,
    description: 'Less quality, high compression'
  },
  recommended: {
    maxDimension: 1600,
    jpegQuality: 0.70,
    downsampleThreshold: 1800,
    description: 'Good quality, good compression'
  },
  low: {
    maxDimension: 2400,
    jpegQuality: 0.85,
    downsampleThreshold: 2600,
    description: 'High quality, less compression'
  }
};

/**
 * Load an image source into an HTMLImageElement
 */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image in canvas'));
    img.src = src;
  });
}

/**
 * Process and rotate an image using Canvas, returning JPEG Uint8Array
 */
async function processImageToJpeg(fileOrBlob, rotation = 0, maxDim = null, quality = 0.90) {
  let objectUrl = null;
  if (typeof fileOrBlob === 'string') {
    objectUrl = fileOrBlob;
  } else if (fileOrBlob instanceof Blob || fileOrBlob instanceof File) {
    objectUrl = URL.createObjectURL(fileOrBlob);
  } else if (fileOrBlob instanceof ArrayBuffer || fileOrBlob instanceof Uint8Array) {
    const blob = new Blob([fileOrBlob]);
    objectUrl = URL.createObjectURL(blob);
  } else {
    throw new Error('Unsupported image input type');
  }

  try {
    const img = await loadImageElement(objectUrl);
    let origW = img.naturalWidth || img.width;
    let origH = img.naturalHeight || img.height;

    // Apply max dimension constraint if requested
    let targetW = origW;
    let targetH = origH;
    if (maxDim && Math.max(origW, origH) > maxDim) {
      const ratio = maxDim / Math.max(origW, origH);
      targetW = Math.max(1, Math.round(origW * ratio));
      targetH = Math.max(1, Math.round(origH * ratio));
    }

    const rad = ((rotation % 360) * Math.PI) / 180;
    const isRotated90or270 = (rotation % 180) !== 0;

    const canvas = document.createElement('canvas');
    canvas.width = isRotated90or270 ? targetH : targetW;
    canvas.height = isRotated90or270 ? targetW : targetH;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    const arrayBuffer = await blob.arrayBuffer();
    return {
      bytes: new Uint8Array(arrayBuffer),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    if (objectUrl && !objectUrl.startsWith('data:')) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Convert images to PDF completely client-side in the browser
 */
async function clientConvertImagesToPdf(images, options = {}) {
  const {
    orientation = 'portrait',
    pageSize = 'fit',
    margin = 0,
    merge = true,
    quality = 0.90
  } = options;

  if (!images || images.length === 0) {
    throw new Error('No images provided for conversion.');
  }

  const { PDFDocument } = window.PDFLib;

  async function addImagePage(imageItem, targetDoc) {
    const rotation = Number(imageItem.rotation || 0) % 360;
    const processed = await processImageToJpeg(imageItem.file || imageItem.buffer, rotation, null, quality);

    let pageWidth, pageHeight;
    const imgW = processed.width;
    const imgH = processed.height;

    if (pageSize === 'fit') {
      const isImgLandscape = imgW > imgH;
      if (orientation === 'landscape' && !isImgLandscape) {
        pageWidth = imgH;
        pageHeight = imgW;
      } else if (orientation === 'portrait' && isImgLandscape) {
        pageWidth = imgH;
        pageHeight = imgW;
      } else {
        pageWidth = imgW;
        pageHeight = imgH;
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
    const embedded = await targetDoc.embedJpg(processed.bytes);

    const marginNum = Math.max(0, Number(margin) || 0);
    const availW = Math.max(10, pageWidth - marginNum * 2);
    const availH = Math.max(10, pageHeight - marginNum * 2);

    const scale = Math.min(availW / embedded.width, availH / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;

    const x = marginNum + (availW - drawW) / 2;
    const y = marginNum + (availH - drawH) / 2;

    page.drawImage(embedded, {
      x,
      y,
      width: drawW,
      height: drawH
    });
  }

  if (merge) {
    const doc = await PDFDocument.create();
    for (const img of images) {
      await addImagePage(img, doc);
    }
    const pdfBytes = await doc.save({ useObjectStreams: true });
    return {
      mergedBuffer: pdfBytes.buffer,
      pageCount: images.length
    };
  } else {
    const files = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const doc = await PDFDocument.create();
      await addImagePage(img, doc);
      const pdfBytes = await doc.save({ useObjectStreams: true });
      const baseName = (img.name || img.filename || `image_${i + 1}`).replace(/\.[^/.]+$/, '');
      files.push({
        name: `${baseName}.pdf`,
        buffer: pdfBytes.buffer
      });
    }
    return { files };
  }
}

/**
 * Compress PDF completely client-side in the browser
 */
async function clientCompressPdf(pdfArrayBuffer, level = 'recommended') {
  const profile = COMPRESSION_PROFILES[level] || COMPRESSION_PROFILES.recommended;
  const originalSize = pdfArrayBuffer.byteLength;

  const { PDFDocument, PDFName, PDFNumber, PDFRawStream } = window.PDFLib;
  const doc = await PDFDocument.load(pdfArrayBuffer, { ignoreEncryption: true });
  const context = doc.context;

  let imagesOptimized = 0;

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of('Subtype'));

      if (subtype && subtype.asString() === '/Image') {
        const filter = dict.get(PDFName.of('Filter'));
        const filterStr = filter ? filter.asString() : '';

        // Handle JPEG image streams (/DCTDecode)
        if (filterStr === '/DCTDecode' && obj.contents && obj.contents.length > 5000) {
          try {
            const rawBytes = obj.contents;
            const recompressed = await processImageToJpeg(
              rawBytes,
              0,
              profile.maxDimension,
              profile.jpegQuality
            );

            if (recompressed && recompressed.bytes.length < rawBytes.length) {
              obj.contents = recompressed.bytes;
              dict.set(PDFName.of('Length'), PDFNumber.of(recompressed.bytes.length));
              dict.set(PDFName.of('Width'), PDFNumber.of(recompressed.width));
              dict.set(PDFName.of('Height'), PDFNumber.of(recompressed.height));
              imagesOptimized++;
            }
          } catch (e) {
            // Skip problematic image streams safely
          }
        }
      }
    }
  }

  // Strip non-essential metadata
  try {
    const catalog = doc.catalog;
    catalog.delete(PDFName.of('Metadata'));
    catalog.delete(PDFName.of('PieceInfo'));
    catalog.delete(PDFName.of('StructTreeRoot'));
  } catch {}

  // Strip thumbnails from pages
  try {
    const pages = doc.getPages();
    for (const page of pages) {
      page.node.delete(PDFName.of('Thumb'));
      page.node.delete(PDFName.of('PieceInfo'));
    }
  } catch {}

  // Compacting object streams
  const compressedBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });

  const compressedBuffer = compressedBytes.buffer;
  const compressedSize = compressedBuffer.byteLength;
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const savingsPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 1000) / 10 : 0;

  return {
    compressedBuffer,
    originalSize,
    compressedSize,
    savedBytes,
    savingsPercent,
    imagesOptimized,
    level,
    description: profile.description
  };
}

/**
 * Compress and convert an image file/blob to target format (JPEG, PNG, WebP)
 */
async function clientCompressAndConvertImage(fileOrBlob, options = {}) {
  const {
    format = 'jpeg', // 'jpeg' | 'png' | 'webp'
    quality = 0.75,  // 0.1 to 1.0
    maxDimension = null
  } = options;

  let objectUrl = null;
  let originalSize = 0;
  let originalName = 'image';

  if (fileOrBlob instanceof File) {
    originalSize = fileOrBlob.size;
    originalName = fileOrBlob.name;
    objectUrl = URL.createObjectURL(fileOrBlob);
  } else if (fileOrBlob instanceof Blob) {
    originalSize = fileOrBlob.size;
    objectUrl = URL.createObjectURL(fileOrBlob);
  } else if (fileOrBlob instanceof ArrayBuffer || fileOrBlob instanceof Uint8Array) {
    originalSize = fileOrBlob.byteLength;
    const blob = new Blob([fileOrBlob]);
    objectUrl = URL.createObjectURL(blob);
  } else {
    throw new Error('Unsupported image input type');
  }

  try {
    const img = await loadImageElement(objectUrl);
    let origW = img.naturalWidth || img.width;
    let origH = img.naturalHeight || img.height;

    let targetW = origW;
    let targetH = origH;
    if (maxDimension && Math.max(origW, origH) > maxDimension) {
      const ratio = maxDimension / Math.max(origW, origH);
      targetW = Math.max(1, Math.round(origW * ratio));
      targetH = Math.max(1, Math.round(origH * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const mimeMap = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    };
    const targetMime = mimeMap[format.toLowerCase()] || 'image/jpeg';
    const ext = format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase();

    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outBlob = await new Promise((res) => canvas.toBlob(res, targetMime, quality));
    const arrayBuffer = await outBlob.arrayBuffer();
    const newSize = arrayBuffer.byteLength;
    const savedBytes = Math.max(0, originalSize - newSize);
    const savingsPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 1000) / 10 : 0;

    const baseName = originalName.replace(/\.[^/.]+$/, '');
    const outFilename = `${baseName}_converted.${ext}`;

    return {
      buffer: arrayBuffer,
      blob: outBlob,
      originalSize,
      newSize,
      savedBytes,
      savingsPercent,
      format: ext,
      mimeType: targetMime,
      filename: outFilename,
      width: targetW,
      height: targetH
    };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Generate a thumbnail data URL for a file
 */
async function generateThumbnail(fileOrBuffer, type) {
  try {
    if (type.startsWith('image/')) {
      const { bytes } = await processImageToJpeg(fileOrBuffer, 0, 160, 0.7);
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
  } catch {}
  return '';
}

window.DocDockEngine = {
  clientConvertImagesToPdf,
  clientCompressPdf,
  clientCompressAndConvertImage,
  generateThumbnail,
  COMPRESSION_PROFILES,
  PAGE_SIZES
};
