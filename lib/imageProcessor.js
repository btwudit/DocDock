const sharp = require('sharp');

/**
 * Compress and/or convert an image buffer
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {Object} options
 * @param {'jpeg'|'png'|'webp'} [options.format='jpeg'] - Target format
 * @param {number} [options.quality=75] - Quality from 1 to 100
 * @param {number|null} [options.maxDimension=null] - Max width or height constraint
 * @returns {Promise<{ buffer: Buffer, originalSize: number, newSize: number, savedBytes: number, savingsPercent: number, format: string, width: number, height: number }>}
 */
async function compressAndConvertImage(inputBuffer, options = {}) {
  const {
    format = 'jpeg',
    quality = 75,
    maxDimension = null
  } = options;

  const originalSize = inputBuffer.length;
  let pipeline = sharp(inputBuffer).rotate(); // auto-rotate based on EXIF

  const metadata = await pipeline.metadata();
  let targetWidth = metadata.width;
  let targetHeight = metadata.height;

  if (maxDimension && Math.max(metadata.width, metadata.height) > maxDimension) {
    const scale = maxDimension / Math.max(metadata.width, metadata.height);
    targetWidth = Math.max(1, Math.round(metadata.width * scale));
    targetHeight = Math.max(1, Math.round(metadata.height * scale));
    pipeline = pipeline.resize({ width: targetWidth, height: targetHeight, fit: 'inside' });
  }

  const normalizedFormat = format.toLowerCase().trim();

  if (normalizedFormat === 'png') {
    pipeline = pipeline.png({
      compressionLevel: 9,
      quality: Math.min(100, Math.max(1, quality)),
      effort: 7
    });
  } else if (normalizedFormat === 'webp') {
    pipeline = pipeline.webp({
      quality: Math.min(100, Math.max(1, quality)),
      effort: 6
    });
  } else {
    // Default to JPEG
    pipeline = pipeline.jpeg({
      quality: Math.min(100, Math.max(1, quality)),
      mozjpeg: true
    });
  }

  const outputBuffer = await pipeline.toBuffer();
  const newSize = outputBuffer.length;
  const savedBytes = Math.max(0, originalSize - newSize);
  const savingsPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 1000) / 10 : 0;

  const outMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    originalSize,
    newSize,
    savedBytes,
    savingsPercent,
    format: normalizedFormat,
    width: outMeta.width,
    height: outMeta.height
  };
}

module.exports = {
  compressAndConvertImage
};
