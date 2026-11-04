import { Badge } from "@/components/ui/badge";

/** A wrapping row of badges. */
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        // Catalog labels can be long; let them wrap instead of overflowing the brief.
        <Badge key={tag} className="max-w-full whitespace-normal break-words">
          {tag}
        </Badge>
      ))}
    </div>
  );
}
