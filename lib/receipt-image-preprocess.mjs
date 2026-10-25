/**
 * Apply local adaptive binarization to a grayscale canvas ImageData object.
 * A coarse grid keeps the operation bounded for tall, high-resolution receipts.
 */
export function adaptiveBinarizeImageData(imageData, {
  blockSize = 24,
  windowRadius = 2,
  thresholdOffset = 12
} = {}) {
  const width = Number(imageData?.width);
  const height = Number(imageData?.height);
  const pixels = imageData?.data;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      !pixels || pixels.length !== width * height * 4) {
    throw new TypeError('Expected a non-empty RGBA ImageData object.');
  }
  if (!Number.isInteger(blockSize) || blockSize < 4 ||
      !Number.isInteger(windowRadius) || windowRadius < 1 ||
      !Number.isFinite(thresholdOffset) || thresholdOffset < 0) {
    throw new RangeError('Invalid adaptive threshold settings.');
  }

  const columns = Math.ceil(width / blockSize);
  const rows = Math.ceil(height / blockSize);
  const localMeans = new Float32Array(columns * rows);
  for (let cellY = 0; cellY < rows; cellY++) {
    const yStart = cellY * blockSize;
    const yEnd = Math.min(height, yStart + blockSize);
    for (let cellX = 0; cellX < columns; cellX++) {
      const xStart = cellX * blockSize;
      const xEnd = Math.min(width, xStart + blockSize);
      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          sum += pixels[(y * width + x) * 4];
          count++;
        }
      }
      localMeans[cellY * columns + cellX] = count ? sum / count : 255;
    }
  }

  const smoothedMeans = new Float32Array(localMeans.length);
  for (let cellY = 0; cellY < rows; cellY++) {
    for (let cellX = 0; cellX < columns; cellX++) {
      let sum = 0;
      let count = 0;
      for (let y = Math.max(0, cellY - windowRadius); y <= Math.min(rows - 1, cellY + windowRadius); y++) {
        for (let x = Math.max(0, cellX - windowRadius); x <= Math.min(columns - 1, cellX + windowRadius); x++) {
          sum += localMeans[y * columns + x];
          count++;
        }
      }
      smoothedMeans[cellY * columns + cellX] = count ? sum / count : 255;
    }
  }

  for (let y = 0; y < height; y++) {
    const cellY = Math.min(rows - 1, Math.floor(y / blockSize));
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const threshold = smoothedMeans[cellY * columns + Math.min(columns - 1, Math.floor(x / blockSize))] - thresholdOffset;
      const value = pixels[index] < threshold ? 0 : 255;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
    }
  }
  return imageData;
}