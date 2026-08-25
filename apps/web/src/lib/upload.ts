export type UploadKind = "image" | "video" | "document";
export type Uploaded = { assetId: string; url: string | null };

export const UPLOAD_ACCEPT: Record<UploadKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/avif",
  video: "video/mp4,video/webm,video/quicktime",
  document: "application/pdf",
};

export const UPLOAD_MAX_BYTES: Record<UploadKind, number> = {
  image: 20_000_000,
  video: 5_000_000_000,
  document: 100_000_000,
};

/** Reasons a caller needs to tell apart, so it can pick the right message. */
export type UploadFailure = "tooLarge" | "wrongType" | "unreachable" | "failed";

export class UploadError extends Error {
  constructor(readonly reason: UploadFailure) {
    super(reason);
  }
}

/**
 * Upload straight to object storage.
 *
 * The file never passes through the application: the API signs a URL and the
 * browser writes to the bucket itself. Progress therefore comes from XHR, which
 * reports it, rather than fetch, which does not.
 */
export async function uploadToStorage(
  kind: UploadKind,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Uploaded> {
  if (file.size > UPLOAD_MAX_BYTES[kind]) throw new UploadError("tooLarge");

  onProgress?.(0);

  const startRes = await fetch("/api/proxy/media/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });
  const start = await startRes.json();
  if (!startRes.ok) {
    throw new UploadError(start.code === "upload.unsupported_type" ? "wrongType" : "failed");
  }

  // Without configured storage the API serves from local disk, and that endpoint
  // lives behind the same proxy as everything else.
  const target = start.local ? start.url.replace("/api/v1/", "/api/proxy/") : start.url;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : // The usual cause in production is the bucket refusing a cross origin
          // PUT, which the browser reports as a generic network failure.
          reject(new UploadError("unreachable"));
    xhr.onerror = () => reject(new UploadError("unreachable"));
    xhr.send(file);
  });

  const doneRes = await fetch(`/api/proxy/media/uploads/${start.assetId}/complete`, {
    method: "POST",
  });
  const done = await doneRes.json();
  if (!doneRes.ok) throw new UploadError("failed");

  return { assetId: done.assetId, url: done.url ?? null };
}
