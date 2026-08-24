import Image from "next/image";

/**
 * A course without a cover is the normal state right after an author creates it,
 * so the empty slot has to look deliberate rather than broken. The placeholder is
 * derived from the slug, which keeps a given course looking the same everywhere it
 * appears instead of shuffling on every render.
 */
const TINTS = [
  "from-[#0F766E] to-[#134E4A]",
  "from-[#155E75] to-[#0C4A6E]",
  "from-[#3F6212] to-[#1A2E05]",
  "from-[#7C2D12] to-[#431407]",
  "from-[#4C1D95] to-[#2E1065]",
  "from-[#164E63] to-[#083344]",
];

function tintFor(seed: string): string {
  let total = 0;
  for (const char of seed) total = (total + char.codePointAt(0)!) % 997;
  return TINTS[total % TINTS.length];
}

export function CourseCover({
  src,
  slug,
  title,
  sizes,
  className = "",
}: {
  src: string | null;
  slug: string;
  title: string;
  sizes: string;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${tintFor(slug)}`}
    >
      <span className="px-4 text-center text-lg font-semibold leading-tight text-white/85 line-clamp-3">
        {title}
      </span>
    </div>
  );
}
