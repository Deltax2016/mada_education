"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

export function CompleteButton({
  lessonId,
  done,
  labelIdle,
  labelDone,
}: {
  lessonId: string;
  done: boolean;
  labelIdle: string;
  labelDone: string;
}) {
  const router = useRouter();
  const [complete, setComplete] = useState(done);
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/learn/lessons/${lessonId}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        setComplete(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
        <CheckCircleIcon size={19} weight="fill" aria-hidden />
        {labelDone}
      </span>
    );
  }

  return (
    <Button onClick={mark} disabled={busy} variant="secondary">
      <CheckCircleIcon size={18} aria-hidden />
      {labelIdle}
    </Button>
  );
}
