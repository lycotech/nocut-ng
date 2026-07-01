"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/utils";

export function CountdownTimer({ closesAt }: { closesAt: string | null }) {
  const [parts, setParts] = useState(() => formatCountdown(closesAt));

  useEffect(() => {
    if (!closesAt) return;
    const interval = setInterval(() => setParts(formatCountdown(closesAt)), 1000);
    return () => clearInterval(interval);
  }, [closesAt]);

  if (!closesAt) return <span className="text-brand-subtle">No closing date set</span>;
  if (parts.expired) return <span className="text-brand-no font-medium">Closed</span>;

  return (
    <span className="tabular-nums text-brand-muted">
      {parts.days}d {parts.hours}h {parts.minutes}m {parts.seconds}s
    </span>
  );
}
