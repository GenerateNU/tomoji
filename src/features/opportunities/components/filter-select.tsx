import { useId } from "react";
import { Label } from "@/components/ui/label";

/** A labeled native select styled like the design's dropdowns. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-[155px] flex-col gap-3">
      <Label htmlFor={id} className="text-lg">
        {label}
      </Label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-[10px] border border-border bg-background py-2.5 pr-10 pl-4 text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img
          src="/icons/opportunities/down-small.svg"
          alt=""
          width={25}
          height={25}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        />
      </div>
    </div>
  );
}
