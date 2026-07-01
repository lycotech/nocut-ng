import { formatCurrency, formatDate } from "@/lib/utils";
import type { MarketActivity } from "@/lib/api";

export function ActivityFeed({ activity }: { activity: MarketActivity[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-brand-subtle">No positions taken yet. Be the first.</p>;
  }

  return (
    <ul className="space-y-2">
      {activity.map((a, i) => (
        <li
          key={i}
          className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm"
        >
          <span className="text-brand-muted">{a.display_name}</span>
          <span className={a.side === "yes" ? "text-brand-yes" : "text-brand-no"}>
            {a.side.toUpperCase()} {formatCurrency(a.amount)}
          </span>
          <span className="hidden text-xs text-brand-subtle sm:inline">{formatDate(a.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
