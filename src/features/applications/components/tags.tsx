import { Badge } from "@/components/ui/badge";

/** A wrapping row of badges. */
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="h-auto max-w-full whitespace-normal break-words"
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
