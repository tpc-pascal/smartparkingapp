export function changeContrast(
  imageData: ImageData,
): ImageData {
  const { data, width, height } = imageData;
  const lum = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    lum[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }

  const hist = new Array(256).fill(0);
  for (let i = 0; i < lum.length; i++) {
    hist[lum[i]]++;
  }

  const cdf = new Array(256).fill(0);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + hist[i];
  }

  const total = width * height;
  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    if (cdf[i] > 0) {
      cdfMin = cdf[i];
      break;
    }
  }

  const eq = new Array(256).fill(0);
  for (let i = 0; i < 256; i++) {
    eq[i] = Math.round(((cdf[i] - cdfMin) / (total - cdfMin)) * 255);
  }

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const l = eq[lum[i]];
    output[idx] = Math.min(255, Math.round(l * 1.1));
    output[idx + 1] = l;
    output[idx + 2] = Math.min(255, Math.round(l * 0.9));
    output[idx + 3] = 255;
  }

  return new ImageData(output, width, height);
}
