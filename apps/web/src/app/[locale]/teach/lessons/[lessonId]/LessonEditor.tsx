"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  FilmSlateIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { MediaUpload } from "@/components/media/MediaUpload";

import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/Field";
import { LOCALES, type Dict, type Locale } from "@/lib/i18n";

type Block = { id: string; type: string; data: Record<string, unknown> };

export type LessonContent = {
  lessonId: string;
  title: Record<string, string>;
  durationMinutes: number;
  isPreview: boolean;
  type: string;
  video: { assetId: string; status: string; durationSeconds: number; sizeBytes: number } | null;
  blocks: Record<string, Block[]>;
};

const BLOCK_TYPES = ["paragraph", "heading", "list", "callout", "image"] as const;

function emptyBlock(type: string, index: number): Block {
  const id = `b${index + 1}-${Math.round(performance.now())}`;
  if (type === "heading") return { id, type, data: { level: 2, text: "" } };
  if (type === "list") return { id, type, data: { ordered: false, items: [] } };
  if (type === "callout") return { id, type, data: { variant: "info", text: "" } };
  if (type === "image") return { id, type, data: { src: "", alt: "", caption: "" } };
  return { id, type: "paragraph", data: { text: "" } };
}

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

  function update(next: Block[]) {
    setBlocks((b) => ({ ...b, [tab]: next }));
    setSaved(false);
  }

  function patch(index: number, data: Record<string, unknown>) {
    update(current.map((b, i) => (i === index ? { ...b, data: { ...b.data, ...data } } : b)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
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

      <div className="mt-6 grid gap-4">
        {current.length === 0 ? (
          <Empty title={dict.teach.noBlocks} body={dict.teach.noBlocksBody} />
        ) : null}

        {current.map((block, index) => (
          <div
            key={block.id}
            className="rounded-[var(--r-lg)] border border-border bg-surface p-4 sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                {dict.teach[
                  `block${block.type[0].toUpperCase()}${block.type.slice(1)}` as "blockParagraph"
                ] ?? block.type}
              </span>
              <div className="flex gap-1">
                <button onClick={() => move(index, -1)} aria-label={dict.teach.moveUp}
                        className="grid size-8 cursor-pointer place-items-center rounded-[var(--r-sm)] text-fg-subtle hover:bg-surface-2 hover:text-fg">
                  <CaretUpIcon size={15} aria-hidden />
                </button>
                <button onClick={() => move(index, 1)} aria-label={dict.teach.moveDown}
                        className="grid size-8 cursor-pointer place-items-center rounded-[var(--r-sm)] text-fg-subtle hover:bg-surface-2 hover:text-fg">
                  <CaretDownIcon size={15} aria-hidden />
                </button>
                <button onClick={() => update(current.filter((_, i) => i !== index))}
                        aria-label={dict.teach.removeBlock}
                        className="grid size-8 cursor-pointer place-items-center rounded-[var(--r-sm)] text-fg-subtle hover:bg-danger-soft hover:text-danger">
                  <TrashIcon size={15} aria-hidden />
                </button>
              </div>
            </div>

            {block.type === "heading" ? (
              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <select
                  aria-label={dict.teach.blockVariant}
                  className={selectClass}
                  value={String(block.data.level ?? 2)}
                  onChange={(e) => patch(index, { level: Number(e.target.value) })}
                >
                  <option value="2">H2</option>
                  <option value="3">H3</option>
                </select>
                <input
                  aria-label={dict.teach.blockText}
                  className={inputClass}
                  dir={tab === "ar" ? "rtl" : "ltr"}
                  value={String(block.data.text ?? "")}
                  onChange={(e) => patch(index, { text: e.target.value })}
                />
              </div>
            ) : null}

            {block.type === "paragraph" ? (
              <textarea
                aria-label={dict.teach.blockText}
                className={textareaClass}
                dir={tab === "ar" ? "rtl" : "ltr"}
                value={String(block.data.text ?? "")}
                onChange={(e) => patch(index, { text: e.target.value })}
              />
            ) : null}

            {block.type === "list" ? (
              <textarea
                aria-label={dict.teach.blockItems}
                placeholder={dict.teach.blockItems}
                className={textareaClass}
                dir={tab === "ar" ? "rtl" : "ltr"}
                value={((block.data.items as string[]) ?? []).join("\n")}
                onChange={(e) =>
                  patch(index, {
                    items: e.target.value.split("\n").filter((line) => line.trim().length),
                  })
                }
              />
            ) : null}

            {block.type === "image" ? (
              <div className="grid gap-3">
                {block.data.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={String(block.data.src)}
                    alt=""
                    className="max-h-56 w-full rounded-[var(--r-md)] border border-border object-cover"
                  />
                ) : null}
                <MediaUpload
                  kind="image"
                  dict={dict}
                  label={dict.media.uploadImage}
                  onUploaded={({ url }) => patch(index, { src: url ?? "" })}
                />
                <input
                  aria-label={dict.media.imageAlt}
                  placeholder={dict.media.imageAlt}
                  className={inputClass}
                  dir={tab === "ar" ? "rtl" : "ltr"}
                  value={String(block.data.alt ?? "")}
                  onChange={(e) => patch(index, { alt: e.target.value })}
                />
                <input
                  aria-label={dict.media.imageCaption}
                  placeholder={dict.media.imageCaption}
                  className={inputClass}
                  dir={tab === "ar" ? "rtl" : "ltr"}
                  value={String(block.data.caption ?? "")}
                  onChange={(e) => patch(index, { caption: e.target.value })}
                />
              </div>
            ) : null}

            {block.type === "callout" ? (
              <div className="grid gap-3">
                <select
                  aria-label={dict.teach.blockVariant}
                  className={selectClass}
                  value={String(block.data.variant ?? "info")}
                  onChange={(e) => patch(index, { variant: e.target.value })}
                >
                  <option value="info">{dict.teach.variantInfo}</option>
                  <option value="warning">{dict.teach.variantWarning}</option>
                </select>
                <textarea
                  aria-label={dict.teach.blockText}
                  className={textareaClass}
                  dir={tab === "ar" ? "rtl" : "ltr"}
                  value={String(block.data.text ?? "")}
                  onChange={(e) => patch(index, { text: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {BLOCK_TYPES.map((type) => (
          <Button
            key={type}
            variant="secondary"
            size="sm"
            onClick={() => update([...current, emptyBlock(type, current.length)])}
          >
            {dict.teach[`block${type[0].toUpperCase()}${type.slice(1)}` as "blockParagraph"]}
          </Button>
        ))}
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
