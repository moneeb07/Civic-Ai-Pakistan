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
    return createImageBitmap(file);
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
 * A CNIC image for extraction.
 *
 * Kept at a long edge of 1600px: small enough to upload quickly, large enough
 * that the printed serial and dates stay legible to the model.
 */
export async function prepareCnicImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  return encode(bitmap, 1600, 0.9, "image/jpeg");
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
