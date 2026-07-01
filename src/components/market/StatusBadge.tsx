import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  active: "bg-brand-yes-muted text-brand-yes",
  closed: "bg-brand-amber/15 text-brand-amber",
  settled: "bg-white/10 text-brand-muted",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", STYLES[status] ?? STYLES.settled)}>
      {status}
    </span>
  );
}
