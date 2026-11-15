"use client";

import { useEffect, useState } from "react";
import { RiHeartLine } from "@remixicon/react";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Example } from "@/features/design-system/components/docs/example";
import { iconProps } from "@/lib/icons";

export function SkeletonExamples() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <>
      <Example
        title="Shapes"
        description="Size blocks with className. circle for avatars, SkeletonText for paragraphs."
        code={`<Skeleton circle className="size-10" />
<Skeleton className="h-5 w-40" />
<SkeletonText lines={3} />`}
      >
        <div className="flex w-80 items-start gap-3">
          <Skeleton circle className="size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-3 pt-1">
            <Skeleton className="h-4 w-40" />
            <SkeletonText lines={3} />
          </div>
        </div>
      </Example>
      <Example
        title="Loading a stat tile"
        description="Mirror the real layout so nothing jumps when the data lands. Loads for 2s."
        canvasClassName="flex-col items-center"
        code={`<div aria-busy={loading} className="rounded bg-gray-0 px-5 py-4 shadow-tile">
  {loading ? (
    <>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-7 w-28" />
    </>
  ) : (
    <StatTile
      icon={<RiHeartLine />}
      label="Likes"
      value="100,850"
      trend={{ text: "+12%", direction: "up" }}
    />
  )}
</div>`}
      >
        <div aria-busy={loading} className="w-60">
          {loading ? (
            <div className="flex flex-col gap-2 rounded bg-gray-0 px-5 py-4 shadow-tile">
              <Skeleton className="my-1 h-4 w-16" />
              <Skeleton className="my-[3.25px] h-7 w-28" />
            </div>
          ) : (
            <StatTile
              icon={<RiHeartLine {...iconProps} />}
              label="Likes"
              value="100,850"
              trend={{ text: "+12%", direction: "up" }}
            />
          )}
        </div>
        <Button
          variant="secondary-subtle"
          size="sm"
          disabled={loading}
          onClick={() => setLoading(true)}
        >
          Reload
        </Button>
      </Example>
    </>
  );
}
