"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  FilmSlateIcon,
} from "@phosphor-icons/react";

import { BlockCanvas, type Block } from "@/components/editor/BlockCanvas";
import { MediaUpload } from "@/components/media/MediaUpload";

import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { LOCALES, type Dict, type Locale } from "@/lib/i18n";
import { uploadToStorage } from "@/lib/upload";

export type LessonContent = {
  lessonId: string;
  title: Record<string, string>;
  durationMinutes: number;
  isPreview: boolean;
  type: string;
  video: { assetId: string; status: string; durationSeconds: number; sizeBytes: number } | null;
  blocks: Record<string, Block[]>;
};

export function LessonEditor({
  locale,
  dict,
  initial,
}: {
  locale: Locale;
  dict: Dict;
  initial: LessonContent;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Locale>(locale);
  const [blocks, setBlocks] = useState<Record<string, Block[]>>(initial.blocks);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [video, setVideo] = useState(initial.video);

  async function attachVideo({ assetId }: { assetId: string }) {
    await fetch(`/api/proxy/teach/lessons/${initial.lessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaAssetId: assetId }),
    });
    setVideo({ assetId, status: "ready", durationSeconds: 0, sizeBytes: 0 });
    router.refresh();
  }

  async function detachVideo() {
    await fetch(`/api/proxy/teach/lessons/${initial.lessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaAssetId: "" }),
    });
    setVideo(null);
    router.refresh();
  }

  const current = blocks[tab] ?? [];

  /** The canvas only needs a URL back; failures surface as a missing image. */
  async function uploadImage(file: File) {
    try {
      return (await uploadToStorage("image", file)).url;
    } catch {
      return null;
    }
  }

  function update(next: Block[]) {
    setBlocks((b) => ({ ...b, [tab]: next }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    try {
      // Empty blocks are dropped rather than saved: a blank paragraph renders as a
      // gap the learner cannot explain, and it would also let an author publish a
      // lesson that looks written but is not.
      const cleaned = current.filter((b) => {
        if (b.type === "list") return ((b.data.items as string[]) ?? []).length > 0;
        if (b.type === "image") return String(b.data.src ?? "").length > 0;
        return String(b.data.text ?? "").trim().length > 0;
      });
      const res = await fetch(
        `/api/proxy/teach/lessons/${initial.lessonId}/content?locale=${tab}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: cleaned }),
        },
      );
      if (res.ok) {
        update(cleaned);
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[820px] px-5 py-10 sm:px-8 lg:py-14">
      <button
        onClick={() => router.back()}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowRightIcon size={15} className="rotate-180 flip-rtl" aria-hidden />
        {dict.common.back}
      </button>

      <h1 className="mt-4 text-[1.7rem] font-bold leading-tight">
        {initial.title[locale] || initial.title.ar}
      </h1>
      <p className="mt-1 text-sm text-fg-subtle">{dict.teach.contentTitle}</p>

      <section className="mt-7 rounded-[var(--r-lg)] border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">{dict.media.uploadVideo}</h2>
        {video ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <FilmSlateIcon size={18} aria-hidden />
              {dict.media.videoAttached}
              {video.sizeBytes ? (
                <span className="tnum text-fg-subtle">
                  {Math.max(1, Math.round(video.sizeBytes / 1_000_000))} MB
                </span>
              ) : null}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={detachVideo}>
              {dict.media.removeVideo}
            </Button>
          </div>
        ) : null}
        <div className="mt-3">
          <MediaUpload
            kind="video"
            dict={dict}
            label={video ? dict.media.replaceVideo : dict.media.uploadVideo}
            onUploaded={attachVideo}
          />
        </div>
      </section>

      <div
        role="tablist"
        aria-label={dict.teach.contentTitle}
        className="mt-7 inline-flex gap-1 rounded-[var(--r-md)] bg-surface-2 p-1"
      >
        {LOCALES.map((code) => (
          <button
            key={code}
            role="tab"
            aria-selected={tab === code}
            onClick={() => setTab(code)}
            className={`h-9 cursor-pointer rounded-[var(--r-sm)] px-4 text-sm font-medium transition-colors ${
              tab === code ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted"
            }`}
          >
            {code.toUpperCase()}
            {(blocks[code] ?? []).length ? (
              <span className="tnum ms-1.5 text-xs text-fg-subtle">
                {(blocks[code] ?? []).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <div className="mt-6">
          <Empty title={dict.teach.noBlocks} body={dict.teach.noBlocksBody} />
        </div>
      ) : null}

      <div className="mt-4">
        <BlockCanvas
          key={tab}
          blocks={current}
          onChange={update}
          locale={tab as Locale}
          dict={dict}
          onUploadImage={uploadImage}
        />
      </div>

      <div className="sticky bottom-0 mt-8 flex items-center gap-3 border-t border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] py-4 backdrop-blur-md">
        <Button size="lg" onClick={save} disabled={busy}>
          {busy ? dict.teach.saving : dict.teach.save}
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <CheckIcon size={16} weight="bold" aria-hidden />
            {dict.teach.saved}
          </span>
        ) : null}
      </div>
    </div>
  );
}
