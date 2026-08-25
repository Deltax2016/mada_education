import {
  InfoIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Block } from "@/lib/types";

/**
 * Lesson content is an ordered list of typed blocks, not an HTML blob. Adding a
 * new kind of content means adding a component here plus a schema on the API
 * side; it never means a database migration.
 *
 * Unknown types render as nothing rather than throwing, so an older client
 * survives content authored after it shipped.
 */

type Props = { block: Block };

function Heading({ block }: Props) {
  const level = (block.data.level as number) ?? 2;
  const text = block.data.text as string;
  const Tag = (level === 3 ? "h3" : "h2") as "h2" | "h3";
  return (
    <Tag
      className={
        level === 3
          ? "mt-8 text-lg font-semibold text-fg"
          : "mt-10 text-[1.35rem] font-bold text-fg"
      }
    >
      {text}
    </Tag>
  );
}

function Paragraph({ block }: Props) {
  return (
    <p className="mt-4 max-w-[68ch] leading-[1.85] text-fg-muted">
      {block.data.text as string}
    </p>
  );
}

function List({ block }: Props) {
  const items = (block.data.items as string[]) ?? [];
  const ordered = Boolean(block.data.ordered);
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={`prose-rtl mt-5 max-w-[68ch] space-y-2.5 ps-6 text-fg-muted ${
        ordered ? "list-decimal" : "list-disc"
      } marker:text-primary`}
    >
      {items.map((item, index) => (
        <li key={index} className="ps-1.5 leading-[1.8]">
          {item}
        </li>
      ))}
    </Tag>
  );
}

function Callout({ block }: Props) {
  const variant = (block.data.variant as string) ?? "info";
  const warning = variant === "warning";
  const Icon = warning ? WarningIcon : InfoIcon;
  return (
    <aside
      className={`mt-6 flex max-w-[70ch] gap-3.5 rounded-[var(--r-md)] border-s-[3px] p-4 ${
        warning
          ? "border-s-warning bg-warning-soft"
          : "border-s-primary bg-primary-soft"
      }`}
    >
      <Icon
        size={20}
        weight="fill"
        className={`mt-0.5 shrink-0 ${warning ? "text-warning" : "text-primary"}`}
        aria-hidden
      />
      <p className="text-[0.95rem] leading-[1.75] text-fg">{block.data.text as string}</p>
    </aside>
  );
}

function Table({ block }: Props) {
  const headers = (block.data.headers as string[]) ?? [];
  const rows = (block.data.rows as string[][]) ?? [];
  return (
    // Wide content scrolls inside its own container so the page body never does.
    <div className="mt-6 overflow-x-auto rounded-[var(--r-md)] border border-border">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-3 text-start font-semibold text-fg"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-4 py-3 text-fg-muted ${
                    // Numbers stay left to right and line up on the decimal,
                    // including inside an Arabic table.
                    cellIndex > 0 ? "tnum ltr-island text-end" : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageBlock({ block }: Props) {
  const src = block.data.src as string;
  const alt = (block.data.alt as string) ?? "";
  const caption = block.data.caption as string | undefined;
  if (!src) return null;
  return (
    <figure className="mt-6">
      {/* A plain img rather than next/image: these point at a bucket whose
          hostname is configured per deployment, and next/image would refuse any
          host not listed at build time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full rounded-[var(--r-md)] border border-border"
      />
      {caption ? (
        <figcaption className="mt-2 text-sm text-fg-subtle">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

const registry: Record<string, (props: Props) => React.ReactElement | null> = {
  image: ImageBlock,
  heading: Heading,
  paragraph: Paragraph,
  list: List,
  callout: Callout,
  table: Table,
};

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="[&>*:first-child]:mt-0">
      {blocks.map((block) => {
        const Component = registry[block.type];
        if (!Component) return null;
        return (
          <div key={block.id} data-block-id={block.id}>
            <Component block={block} />
          </div>
        );
      })}
    </div>
  );
}
