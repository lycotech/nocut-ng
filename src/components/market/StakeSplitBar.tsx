export function StakeSplitBar({ yesPct }: { yesPct: number }) {
  const clamped = Math.min(100, Math.max(0, yesPct));

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-no/40">
      <div
        className="h-full rounded-full bg-brand-yes transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
