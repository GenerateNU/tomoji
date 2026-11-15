import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

export function OnThisPage({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-23 hidden w-44 shrink-0 self-start xl:block"
    >
      <p className="text-body-xs font-medium tracking-[0.04em] text-gray-500 uppercase">
        On this page
      </p>
      <ul className="mt-3 space-y-2 text-body-sm font-normal">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn("rounded-xs text-gray-500 hover:text-gray-950", focusRing)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
