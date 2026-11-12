const { PDFDocument, PDFName, PDFNumber, PDFRawStream } = require('pdf-lib');
const sharp = require('sharp');
const zlib = require('zlib');

const COMPRESSION_PROFILES = {
  extreme: {
    maxDimension: 900,
    jpegQuality: 45,
    downsampleThreshold: 1000,
    description: 'Less quality, high compression'
  },
  recommended: {
    maxDimension: 1600,
    jpegQuality: 70,
    downsampleThreshold: 1800,
    description: 'Good quality, good compression'
  },
  low: {
    maxDimension: 2400,
    jpegQuality: 85,
    downsampleThreshold: 2600,
    description: 'High quality, less compression'
  }
};

/**
 * Compress a PDF buffer using intelligent image downsampling and object stream compaction
 * @param {Buffer} pdfBuffer - Input PDF buffer
 * @param {'extreme'|'recommended'|'low'} [level='recommended']
 * @returns {Promise<{ compressedBuffer: Buffer, originalSize: number, compressedSize: number, savedBytes: number, savingsPercent: number, imagesOptimized: number }>}
 */
async function compressPdf(pdfBuffer, level = 'recommended') {
  const profile = COMPRESSION_PROFILES[level] || COMPRESSION_PROFILES.recommended;
  const originalSize = pdfBuffer.length;

  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const context = doc.context;

  let imagesOptimized = 0;

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of('Subtype'));

      if (subtype && subtype.asString() === '/Image') {
        const filter = dict.get(PDFName.of('Filter'));
        const widthObj = dict.get(PDFName.of('Width'));
        const heightObj = dict.get(PDFName.of('Height'));

        const width = widthObj && typeof widthObj.asNumber === 'function' ? widthObj.asNumber() : null;
        const height = heightObj && typeof heightObj.asNumber === 'function' ? heightObj.asNumber() : null;
        const filterStr = filter ? filter.asString() : '';

        try {
          let originalImageBytes = null;
          let isJpeg = filterStr === '/DCTDecode';

          if (isJpeg) {
            originalImageBytes = obj.contents;
          } else if (filterStr === '/FlateDecode' && width && height) {
            // Attempt to decompress Flate stream
            try {
              originalImageBytes = zlib.inflateSync(obj.contents);
            } catch {
              try {
                originalImageBytes = zlib.inflateRawSync(obj.contents);
              } catch {
                originalImageBytes = null;
              }
            }
          }

          if (originalImageBytes) {
            let imgSharp;
            try {
              imgSharp = sharp(originalImageBytes);
            } catch {
              imgSharp = null;
            }

            if (imgSharp) {
              const meta = await imgSharp.metadata().catch(() => null);
              if (meta && meta.width && meta.height) {
                const curW = meta.width;
                const curH = meta.height;
                const maxDim = Math.max(curW, curH);

                let transform = imgSharp;
                if (maxDim > profile.downsampleThreshold) {
                  const scale = profile.maxDimension / maxDim;
                  const newW = Math.max(1, Math.round(curW * scale));
                  const newH = Math.max(1, Math.round(curH * scale));
                  transform = transform.resize({ width: newW, height: newH, fit: 'inside' });
                }

                const compressedImg = await transform
                  .jpeg({ quality: profile.jpegQuality, mozjpeg: true })
                  .toBuffer()
                  .catch(() => null);

                if (compressedImg && compressedImg.length < obj.contents.length) {
                  const newMeta = await sharp(compressedImg).metadata();
                  obj.contents = compressedImg;
                  dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
                  dict.set(PDFName.of('Length'), PDFNumber.of(compressedImg.length));
                  dict.set(PDFName.of('Width'), PDFNumber.of(newMeta.width));
                  dict.set(PDFName.of('Height'), PDFNumber.of(newMeta.height));
                  dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
                  dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
                  imagesOptimized++;
                }
              }
            }
          }
        } catch (err) {
          // If any single image fails, skip and preserve original
          // console.warn('Skipping unhandled image:', err.message);
        }
      }
    }
  }

  // Strip non-essential document metadata
  try {
    const catalog = doc.catalog;
    catalog.delete(PDFName.of('Metadata'));
    catalog.delete(PDFName.of('PieceInfo'));
    catalog.delete(PDFName.of('StructTreeRoot'));
  } catch {}

  // Strip thumbnails and metadata from pages
  try {
    const pages = doc.getPages();
    for (const page of pages) {
      page.node.delete(PDFName.of('Thumb'));
      page.node.delete(PDFName.of('PieceInfo'));
    }
  } catch {}

  // Save with compressed object streams
  const compressedBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });

  const compressedBuffer = Buffer.from(compressedBytes);
  const compressedSize = compressedBuffer.length;
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

module.exports = {
  compressPdf,
  COMPRESSION_PROFILES
};
