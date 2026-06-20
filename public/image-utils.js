const MAX_IMAGE_LONG_EDGE = 2048;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const JPEG_QUALITY = 0.85;
const MIN_JPEG_QUALITY = 0.5;

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };

    img.src = url;
  });
}

function scaleDimensions(width, height, maxLongEdge) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Could not compress image'));
    }, 'image/jpeg', quality);
  });
}

async function prepareImageForUpload(source, filename = 'photo.jpg') {
  const file = source instanceof File
    ? source
    : new File([source], filename, { type: source.type || 'image/jpeg' });

  const img = await loadImageElement(file);
  const { width, height } = scaleDimensions(
    img.naturalWidth,
    img.naturalHeight,
    MAX_IMAGE_LONG_EDGE,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare image');
  }

  context.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);

  while (blob.size > MAX_IMAGE_BYTES && quality > MIN_JPEG_QUALITY) {
    quality -= 0.1;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

window.prepareImageForUpload = prepareImageForUpload;
