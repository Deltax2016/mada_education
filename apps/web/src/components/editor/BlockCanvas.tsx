"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DotsSixVerticalIcon,
  ImageIcon,
  ListBulletsIcon,
  PlusIcon,
  TextHIcon,
  TextTIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";

import type { Dict, Locale } from "@/lib/i18n";

export type Block = { id: string; type: string; data: Record<string, unknown> };

type Kind = "paragraph" | "heading" | "list" | "callout" | "image";

const MENU: { kind: Kind; icon: typeof TextTIcon; keys: string }[] = [
  { kind: "paragraph", icon: TextTIcon, keys: "text p paragraph نص فقرة" },
  { kind: "heading", icon: TextHIcon, keys: "heading h title عنوان" },
  { kind: "list", icon: ListBulletsIcon, keys: "list bullet ul قائمة" },
  { kind: "callout", icon: WarningIcon, keys: "callout note warning تنبيه" },
  { kind: "image", icon: ImageIcon, keys: "image picture photo صورة" },
];

let counter = 0;
function newBlock(kind: Kind): Block {
  counter += 1;
  const id = `b${counter}${Math.random().toString(36).slice(2, 7)}`;
  if (kind === "heading") return { id, type: kind, data: { level: 2, text: "" } };
  if (kind === "list") return { id, type: kind, data: { ordered: false, items: [] } };
  if (kind === "callout") return { id, type: kind, data: { variant: "info", text: "" } };
  if (kind === "image") return { id, type: kind, data: { src: "", alt: "", caption: "" } };
  return { id, type: "paragraph", data: { text: "" } };
}

/** Grows with its content so the editor looks like the finished page, not a form. */
function Grow({
  value,
  onChange,
  onKeyDown,
  className,
  placeholder,
  dir,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className: string;
  placeholder?: string;
  dir: "rtl" | "ltr";
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  useEffect(resize, [value, resize]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      rows={1}
      dir={dir}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-fg-subtle focus:ring-0 ${className}`}
    />
  );
}

export function BlockCanvas({
  blocks,
  onChange,
  locale,
  dict,
  onUploadImage,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  locale: Locale;
  dict: Dict;
  onUploadImage: (file: File) => Promise<string | null>;
}) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState(false);

  function patch(index: number, data: Record<string, unknown>) {
    onChange(blocks.map((b, i) => (i === index ? { ...b, data: { ...b.data, ...data } } : b)));
  }

  function insertAfter(index: number, kind: Kind) {
    const block = newBlock(kind);
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    onChange(next);
    setFocusId(block.id);
    return block;
  }

  function remove(index: number) {
    const previous = blocks[index - 1];
    onChange(blocks.filter((_, i) => i !== index));
    if (previous) setFocusId(previous.id);
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to > blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, moved);
    onChange(next);
  }

  function keys(index: number, block: Block) {
    return (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const text = target.value;

      // Enter at the end of a block starts the next one, the way a document does.
      if (event.key === "Enter" && !event.shiftKey && block.type !== "list") {
        if (target.selectionStart === text.length) {
          event.preventDefault();
          insertAfter(index, "paragraph");
        }
        return;
      }

      // Backspace in an empty block removes it and puts the caret where the
      // writer expects, at the end of what came before.
      if (event.key === "Backspace" && text === "" && blocks.length > 1) {
        event.preventDefault();
        remove(index);
        return;
      }

      // A slash on an empty paragraph is how a block gets inserted without
      // reaching for a toolbar.
      if (event.key === "/" && text === "") {
        setMenuAt(index);
        setMenuQuery("");
      }

      if (event.key === "Escape") setMenuAt(null);
    };
  }

  async function dropFiles(event: React.DragEvent, index: number) {
    const file = event.dataTransfer.files?.[0];
    setFileOver(false);
    if (!file || !file.type.startsWith("image/")) return;
    event.preventDefault();
    const block = insertAfter(index, "image");
    const url = await onUploadImage(file);
    if (url) {
      onChange(
        blocks
          .slice(0, index + 1)
          .concat({ ...block, data: { ...block.data, src: url } }, blocks.slice(index + 1)),
      );
    }
  }

  const filtered = MENU.filter(
    (item) => !menuQuery || item.keys.includes(menuQuery.toLowerCase()),
  );

  return (
    <div
      className={`grid gap-1 rounded-[var(--r-lg)] p-2 transition-colors ${
        fileOver ? "bg-primary-soft ring-2 ring-primary" : ""
      }`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setFileOver(true);
        }
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(event) => void dropFiles(event, blocks.length - 1)}
    >
      {blocks.map((block, index) => (
        <div key={block.id}>
          {dropAt === index ? <div className="h-0.5 rounded bg-primary" /> : null}

          <div
            className="group relative flex items-start gap-1 rounded-[var(--r-sm)] px-1 py-0.5 hover:bg-surface-2"
            onDragOver={(event) => {
              if (dragging !== null) {
                event.preventDefault();
                setDropAt(index);
              }
            }}
            onDrop={(event) => {
              if (dragging !== null) {
                event.preventDefault();
                move(dragging, index);
                setDragging(null);
                setDropAt(null);
              }
            }}
          >
            <div className="flex shrink-0 gap-0.5 pt-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                draggable
                onDragStart={() => setDragging(index)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropAt(null);
                }}
                aria-label={dict.teach.moveUp}
                className="grid size-6 cursor-grab place-items-center rounded text-fg-subtle hover:bg-surface-3 active:cursor-grabbing"
              >
                <DotsSixVerticalIcon size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuAt(index);
                  setMenuQuery("");
                }}
                aria-label={dict.teach.addBlock}
                className="grid size-6 place-items-center rounded text-fg-subtle hover:bg-surface-3"
              >
                <PlusIcon size={14} aria-hidden />
              </button>
            </div>

            <div className="min-w-0 flex-1 py-1">
              {block.type === "heading" ? (
                <Grow
                  dir={dir}
                  autoFocus={focusId === block.id}
                  value={String(block.data.text ?? "")}
                  onChange={(text) => patch(index, { text })}
                  onKeyDown={keys(index, block)}
                  placeholder={dict.teach.blockHeading}
                  className="text-[1.35rem] font-bold leading-snug text-fg"
                />
              ) : null}

              {block.type === "paragraph" ? (
                <Grow
                  dir={dir}
                  autoFocus={focusId === block.id}
                  value={String(block.data.text ?? "")}
                  onChange={(text) => patch(index, { text })}
                  onKeyDown={keys(index, block)}
                  placeholder={dict.teach.slashHint}
                  className="leading-[1.85] text-fg-muted"
                />
              ) : null}

              {block.type === "list" ? (
                <Grow
                  dir={dir}
                  autoFocus={focusId === block.id}
                  value={((block.data.items as string[]) ?? []).join("\n")}
                  onChange={(value) =>
                    patch(index, { items: value.split("\n").filter((line) => line.trim()) })
                  }
                  onKeyDown={keys(index, block)}
                  placeholder={dict.teach.blockItems}
                  className="leading-[1.85] text-fg-muted"
                />
              ) : null}

              {block.type === "callout" ? (
                <div
                  className={`flex gap-3 rounded-[var(--r-md)] border-s-[3px] p-3 ${
                    block.data.variant === "warning"
                      ? "border-s-warning bg-warning-soft"
                      : "border-s-primary bg-primary-soft"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      patch(index, {
                        variant: block.data.variant === "warning" ? "info" : "warning",
                      })
                    }
                    aria-label={dict.teach.blockVariant}
                    className="mt-0.5 shrink-0 text-fg-muted"
                  >
                    <WarningIcon size={18} aria-hidden />
                  </button>
                  <Grow
                    dir={dir}
                    autoFocus={focusId === block.id}
                    value={String(block.data.text ?? "")}
                    onChange={(text) => patch(index, { text })}
                    onKeyDown={keys(index, block)}
                    placeholder={dict.teach.blockCallout}
                    className="leading-[1.75] text-fg"
                  />
                </div>
              ) : null}

              {block.type === "image" ? (
                <div className="grid gap-2">
                  {block.data.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={String(block.data.src)}
                      alt=""
                      className="w-full rounded-[var(--r-md)] border border-border"
                    />
                  ) : (
                    <label className="flex h-28 cursor-pointer items-center justify-center rounded-[var(--r-md)] border border-dashed border-border-strong text-sm text-fg-subtle hover:bg-surface-2">
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const url = await onUploadImage(file);
                          if (url) patch(index, { src: url });
                        }}
                      />
                      {dict.media.uploadImage}
                    </label>
                  )}
                  <Grow
                    dir={dir}
                    value={String(block.data.caption ?? "")}
                    onChange={(caption) => patch(index, { caption })}
                    placeholder={dict.media.imageCaption}
                    className="text-sm text-fg-subtle"
                  />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={dict.teach.removeBlock}
              className="mt-1 grid size-6 shrink-0 place-items-center rounded text-fg-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
            >
              <TrashIcon size={14} aria-hidden />
            </button>
          </div>

          {menuAt === index ? (
            <div className="relative">
              <div className="absolute z-20 mt-1 w-64 overflow-hidden rounded-[var(--r-md)] border border-border bg-surface shadow-[var(--shadow-lg)]">
                <input
                  autoFocus
                  value={menuQuery}
                  onChange={(event) => setMenuQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setMenuAt(null);
                    if (event.key === "Enter" && filtered[0]) {
                      event.preventDefault();
                      insertAfter(index, filtered[0].kind);
                      setMenuAt(null);
                    }
                  }}
                  placeholder={dict.teach.slashSearch}
                  className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
                />
                <ul className="max-h-60 overflow-y-auto py-1">
                  {filtered.map(({ kind, icon: Icon }) => (
                    <li key={kind}>
                      <button
                        type="button"
                        onClick={() => {
                          insertAfter(index, kind);
                          setMenuAt(null);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm hover:bg-surface-2"
                      >
                        <Icon size={16} className="text-fg-subtle" aria-hidden />
                        {
                          dict.teach[
                            `block${kind[0].toUpperCase()}${kind.slice(1)}` as "blockParagraph"
                          ]
                        }
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                aria-label={dict.common.close}
                onClick={() => setMenuAt(null)}
                className="fixed inset-0 z-10 cursor-default"
              />
            </div>
          ) : null}
        </div>
      ))}

      {dropAt === blocks.length ? <div className="h-0.5 rounded bg-primary" /> : null}

      <button
        type="button"
        onClick={() => insertAfter(blocks.length - 1, "paragraph")}
        onDragOver={(event) => {
          if (dragging !== null) {
            event.preventDefault();
            setDropAt(blocks.length);
          }
        }}
        className="mt-1 flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-3 text-start text-sm text-fg-subtle hover:bg-surface-2"
      >
        <PlusIcon size={15} aria-hidden />
        {dict.teach.slashHint}
      </button>
    </div>
  );
}
