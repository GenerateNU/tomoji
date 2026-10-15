/**
 * Placeholder company mark from the design: companies don't have logos yet,
 * so show the first letter of the name.
 */
export function CompanyAvatar({ name, size }: { name: string; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={
        size === "sm"
          ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted-foreground/20 text-sm font-semibold text-muted-foreground"
          : "flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-muted-foreground/20 font-semibold text-muted-foreground"
      }
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
