"use client";

import { useRef, useState } from "react";
import { CloudArrowUpIcon, XIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/Button";
import type { Dict } from "@/lib/i18n";

type Result = { assetId: string; url: string | null };

const ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/avif",
  video: "video/mp4,video/webm,video/quicktime",
  document: "application/pdf",
};

const MAX_BYTES: Record<string, number> = {
  image: 20_000_000,
  video: 5_000_000_000,
  document: 100_000_000,
};

/**
 * Upload straight to object storage.
 *
 * The file never passes through the application: the API signs a URL and the
 * browser writes to the bucket itself. Progress therefore comes from XHR, which
 * reports it, rather than fetch, which does not.
 */
export function MediaUpload({
  kind,
  dict,
  label,
  onUploaded,
}: {
  kind: "image" | "video" | "document";
  dict: Dict;
  label: string;
  onUploaded: (result: Result) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_BYTES[kind]) {
      setError(dict.media.tooLarge);
      return;
    }

    setProgress(0);
    try {
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
        setError(start.code === "upload.unsupported_type" ? dict.media.wrongType : dict.media.failed);
        return;
      }

      // Without configured storage the API serves from local disk, and that
      // endpoint lives behind the same proxy as everything else.
      const target = start.local
        ? start.url.replace("/api/v1/", "/api/proxy/")
        : start.url;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", target);
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`storage returned ${xhr.status}`));
        xhr.onerror = () => reject(new Error("storage refused the connection"));
        xhr.send(file);
      });

      const doneRes = await fetch(`/api/proxy/media/uploads/${start.assetId}/complete`, {
        method: "POST",
      });
      const done = await doneRes.json();
      if (!doneRes.ok) {
        setError(dict.media.failed);
        return;
      }
      onUploaded({ assetId: done.assetId, url: done.url ?? null });
    } catch {
      // The usual cause in production is the bucket refusing a cross origin PUT,
      // which the browser reports as a generic network failure.
      setError(dict.media.storageUnreachable);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {progress === null ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => input.current?.click()}
        >
          <CloudArrowUpIcon size={16} aria-hidden />
          {label}
        </Button>
      ) : (
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[inline-size] duration-200"
              style={{ inlineSize: `${progress}%` }}
            />
          </div>
          <span className="tnum shrink-0 text-xs text-fg-muted">{progress}%</span>
        </div>
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <XIcon size={15} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
