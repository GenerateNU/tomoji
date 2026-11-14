export function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className={`text-sm break-words${value ? "" : " text-muted-foreground"}`}>
        {value || "Not provided"}
      </dd>
    </div>
  );
}
