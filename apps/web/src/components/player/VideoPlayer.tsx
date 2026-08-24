"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Native controls on purpose.
 *
 * A hand-built control bar has to re-solve keyboard access, captions, picture
 * in picture, AirPlay and the iOS fullscreen behaviour, and it usually gets the
 * direction wrong: the media timeline stays left to right even in an Arabic
 * interface, because time does. The browser already does all of that correctly.
 *
 * What is added here is the part the browser cannot do: resume position, a
 * progress heartbeat that survives a dropped connection, and a watermark tying
 * the stream to the person watching it.
 */

const HEARTBEAT_MS = 20_000;

export function VideoPlayer({
  src,
  poster,
  lessonId,
  startAt = 0,
  subtitles = [],
  watermark,
}: {
  src: string;
  poster: string | null;
  lessonId: string;
  startAt?: number;
  subtitles?: { locale: string; src: string }[];
  watermark?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const watched = useRef(0);
  const lastTick = useRef(0);
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (startAt > 2) {
      video.currentTime = startAt;
    }

    function send(useBeacon: boolean) {
      const node = ref.current;
      if (!node) return;
      const delta = watched.current;
      if (delta < 1 && node.currentTime < 1) return;
      watched.current = 0;

      const payload = JSON.stringify({
        positionSeconds: node.currentTime,
        watchedDelta: delta,
        blocksSeen: [],
      });
      const url = `/api/proxy/learn/lessons/${lessonId}/progress`;

      // sendBeacon survives the tab being closed, which a fetch does not.
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {
          /* progress is best effort; the next heartbeat retries */
        });
      }
    }

    function onTimeUpdate() {
      const node = ref.current;
      if (!node || node.paused) return;
      const now = node.currentTime;
      const step = now - lastTick.current;
      // Only count forward movement of roughly real-time length, so scrubbing
      // through a lesson does not count as having watched it.
      if (step > 0 && step < 2) watched.current += step;
      lastTick.current = now;
    }

    function onSeeked() {
      lastTick.current = ref.current?.currentTime ?? 0;
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") send(true);
    }

    const interval = setInterval(() => send(false), HEARTBEAT_MS);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("pause", () => send(false));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => send(true));

    return () => {
      clearInterval(interval);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeked", onSeeked);
      document.removeEventListener("visibilitychange", onVisibility);
      send(true);
    };
  }, [lessonId, startAt]);

  // The watermark drifts so it cannot be cropped out of a screen recording in
  // one pass. This does not stop a determined ripper; it makes a leak traceable.
  useEffect(() => {
    const timer = setInterval(() => setDrift((value) => (value + 1) % 4), 30_000);
    return () => clearInterval(timer);
  }, []);

  const positions = ["top-6 start-6", "top-6 end-6", "bottom-20 start-6", "bottom-20 end-6"];

  return (
    <div className="relative overflow-hidden rounded-[var(--r-lg)] bg-black">
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        controls
        controlsList="nodownload"
        playsInline
        preload="metadata"
        className="aspect-video w-full"
      >
        {subtitles.map((track) => (
          <track
            key={track.locale}
            kind="subtitles"
            src={track.src}
            srcLang={track.locale}
            label={track.locale === "ar" ? "العربية" : "English"}
          />
        ))}
      </video>

      {watermark ? (
        <span
          aria-hidden
          className={`ltr-island pointer-events-none absolute ${positions[drift]} select-none rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white/70 transition-all duration-700`}
        >
          {watermark}
        </span>
      ) : null}
    </div>
  );
}
