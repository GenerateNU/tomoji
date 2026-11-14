"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  type ApplicationStatus,
} from "../lib/application-status";

const ITEMS = [
  { value: null, label: "All statuses" },
  ...APPLICATION_STATUS_OPTIONS.map((status) => ({
    value: status,
    label: APPLICATION_STATUS_LABELS[status],
  })),
];

export function ApplicationStatusFilter({
  value,
  onChange,
}: {
  value: ApplicationStatus | null;
  onChange: (status: ApplicationStatus | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span id="application-status-label" className="text-lg font-medium">
        Status
      </span>
      <Select items={ITEMS} value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-labelledby="application-status-label"
          className="w-56 px-4 text-lg data-[size=default]:h-11"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ITEMS.map((item) => (
            <SelectItem key={item.label} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
