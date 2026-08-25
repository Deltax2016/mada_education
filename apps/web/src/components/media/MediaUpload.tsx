"use client";

import { useRef, useState } from "react";
import { CloudArrowUpIcon, XIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/Button";
import type { Dict } from "@/lib/i18n";
import {
  UPLOAD_ACCEPT,
  UploadError,
  uploadToStorage,
  type UploadFailure,
  type UploadKind,
  type Uploaded,
} from "@/lib/upload";

/** Each failure needs its own message; a single "failed" hides the fixable ones. */
const REASON: Record<UploadFailure, "tooLarge" | "wrongType" | "storageUnreachable" | "failed"> = {
  tooLarge: "tooLarge",
  wrongType: "wrongType",
  unreachable: "storageUnreachable",
  failed: "failed",
};

export function MediaUpload({
  kind,
  dict,
  label,
  onUploaded,
}: {
  kind: UploadKind;
  dict: Dict;
  label: string;
  onUploaded: (result: Uploaded) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    try {
      onUploaded(await uploadToStorage(kind, file, setProgress));
    } catch (cause) {
      setError(dict.media[cause instanceof UploadError ? REASON[cause.reason] : "failed"]);
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
        accept={UPLOAD_ACCEPT[kind]}
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
