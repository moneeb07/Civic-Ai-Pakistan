"use client";

/*
 * Browser-side image preparation.
 *
 * CivicAI's citizens are largely on inexpensive Android phones and metered
 * connections, and a modern phone camera produces 4–8MB files. Everything is
 * resized and re-encoded before it leaves the device: it makes uploads fast on
 * a weak connection, and it means we never ship more of a sensitive document
 * over the network than the extraction actually needs.
 */

export interface PreparedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    /*
     * `imageOrientation: "from-image"` applies the EXIF rotation tag.
     *
     * Without it — the previous behaviour — a photograph taken in portrait on
     * a phone decodes at its raw sensor orientation, which is landscape with a
     * rotation flag the decoder ignored. The card then arrives at the model
     * rotated 90°, and a sideways CNIC reads as unreadable text. That is the
     * gallery-upload rejection: the image was fine, we were sending it on its
     * side. The camera path never hit it because a live video frame carries no
     * EXIF to ignore.
     */
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older engines reject the options object rather than ignoring it.
      return createImageBitmap(file);
    }
  }

  // Safari fallback.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    image.src = url;
  });
}

async function encode(
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
  quality: number,
  mimeType: "image/jpeg" | "image/webp",
): Promise<PreparedImage> {
  const sourceWidth = "width" in source ? source.width : 0;
  const sourceHeight = "height" in source ? source.height : 0;

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process image.");

  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );

  if (!blob) throw new Error("Could not process image.");

  const dataUrl = canvas.toDataURL(mimeType, quality);

  if ("close" in source && typeof source.close === "function") source.close();

  return { blob, dataUrl, width, height };
}

/**
 * A CNIC image captured by the camera.
 *
 * A long edge of 1800px at high quality. The camera path crops to the card
 * before this runs (lib/cnic-capture-crop.ts), so nearly every one of those
 * pixels lands on the card itself rather than on the desk around it — which is
 * what makes the smallest print on the card, the Urdu address on the back,
 * legible to the model.
 *
 * The quality figure is deliberately high for a photograph of this size: JPEG
 * artefacts land hardest on exactly the thin, high-contrast strokes that Urdu
 * diacritics are made of, and a smudged diacritic is a field the accuracy gate
 * then throws away.
 */
export async function prepareCnicImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  return encode(bitmap, 1800, 0.92, "image/jpeg");
}

/**
 * A CNIC image chosen from the gallery.
 *
 * Kept substantially larger than the camera path, and the reason is geometry
 * rather than generosity. A camera capture is cropped to the guide, so the
 * card fills the frame; an uploaded photograph is whatever the person shot,
 * and the card might occupy a third of it. Downscaling both to the same long
 * edge leaves the uploaded card at a fraction of the resolution — small enough
 * that the Urdu address stops resolving, which reads downstream as "not
 * readable" for an image that was perfectly good.
 *
 * 2600px keeps a card occupying a third of the frame at roughly the same
 * on-card resolution a cropped capture gets, and the file is still far smaller
 * than the 8MB original.
 */
export async function prepareCnicUpload(file: Blob): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  return encode(bitmap, 2600, 0.94, "image/jpeg");
}

/**
 * A profile photo. Square-ish, 512px, moderate quality — this is an avatar and
 * is carried inside the registration session as a data URL.
 */
export async function prepareProfileImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  return encode(bitmap, 512, 0.82, "image/jpeg");
}

/**
 * A civic-issue report photo. Kept larger than a profile photo — this is the
 * evidence a vision model reads to identify the problem — but still well
 * short of a raw phone-camera file, at a long edge that preserves the detail
 * a pothole or a broken fixture actually needs without shipping 6MB over a
 * citizen's mobile connection.
 */
export async function prepareReportImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  return encode(bitmap, 1600, 0.88, "image/jpeg");
}
