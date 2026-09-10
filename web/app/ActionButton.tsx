"use client";

import { useState, useTransition } from "react";

/** Keep the current screen usable when a mutation fails; prevent duplicate taps. */
export default function ActionButton({
  action,
  fields,
  label,
  className = "ds-btn ds-btn-primary",
  doneLabel,
}: {
  action: (data: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  label: string;
  className?: string;
  doneLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={pending || (done && !!doneLabel)}
        onClick={() => {
          setError(false);
          start(async () => {
            const data = new FormData();
            Object.entries(fields).forEach(([key, value]) =>
              data.set(key, String(value)),
            );
            try {
              await action(data);
              setDone(true);
            } catch {
              setError(true);
            }
          });
        }}
      >
        {pending ? "저장 중…" : done && doneLabel ? doneLabel : label}
      </button>
      {error && <p role="alert">저장하지 못했어요. 다시 눌러주세요.</p>}
    </div>
  );
}
