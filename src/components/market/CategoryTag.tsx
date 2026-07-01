import { cn } from "@/lib/utils";
import type { MarketCategory } from "@/lib/api";

const CATEGORY_STYLES: Record<MarketCategory, string> = {
  football: "bg-brand-amber/15 text-brand-amber",
  politics: "bg-blue-500/15 text-blue-400",
  finance: "bg-purple-500/15 text-purple-400",
  entertainment: "bg-pink-500/15 text-pink-400",
  other: "bg-brand-input text-brand-muted",
};

const CATEGORY_LABELS: Record<MarketCategory, string> = {
  football: "Football",
  politics: "Politics",
  finance: "Finance",
  entertainment: "Entertainment",
  other: "Other",
};

export function CategoryTag({ category }: { category: MarketCategory }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        CATEGORY_STYLES[category]
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}
