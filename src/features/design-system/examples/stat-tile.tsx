"use client";

import { RiChat3Line, RiEyeLine, RiHeartLine } from "@remixicon/react";
import { StatTile } from "@/components/stat-tile";
import { Example } from "@/features/design-system/components/docs/example";
import { iconProps } from "@/lib/icons";

export function StatTileExamples() {
  return (
    <>
      <Example
        title="Layouts"
        code={`<StatTile layout="horizontal" icon={<RiHeartLine />} label="Likes" value="100,850" className="w-100" />
<StatTile icon={<RiHeartLine />} label="Likes" value="100,850" className="w-60" />`}
      >
        <StatTile
          layout="horizontal"
          icon={<RiHeartLine {...iconProps} />}
          label="Likes"
          value="100,850"
          className="w-[400px] max-w-full"
        />
        <StatTile
          icon={<RiHeartLine {...iconProps} />}
          label="Likes"
          value="100,850"
          className="w-60"
        />
      </Example>
      <Example
        title="Post performance"
        description="Vertical tiles with trend tags: blue for growth, red for decline."
        canvasClassName="flex-col items-center"
        code={`<div className="grid grid-cols-3 gap-4">
  <StatTile icon={<RiEyeLine />} label="Views" value="1.2M" trend={{ text: "+18%", direction: "up" }} />
  <StatTile icon={<RiHeartLine />} label="Likes" value="100,850" trend={{ text: "+12%", direction: "up" }} />
  <StatTile icon={<RiChat3Line />} label="Comments" value="4,312" trend={{ text: "-3%", direction: "down" }} />
</div>
<StatTile layout="horizontal" icon={<RiHeartLine />} label="Likes" value="100,850" />`}
      >
        <div className="grid w-[752px] max-w-full grid-cols-3 gap-4">
          <StatTile
            icon={<RiEyeLine {...iconProps} />}
            label="Views"
            value="1.2M"
            trend={{ text: "+18%", direction: "up" }}
          />
          <StatTile
            icon={<RiHeartLine {...iconProps} />}
            label="Likes"
            value="100,850"
            trend={{ text: "+12%", direction: "up" }}
          />
          <StatTile
            icon={<RiChat3Line {...iconProps} />}
            label="Comments"
            value="4,312"
            trend={{ text: "-3%", direction: "down" }}
          />
        </div>
        <div className="w-[752px] max-w-full">
          <StatTile
            layout="horizontal"
            icon={<RiHeartLine {...iconProps} />}
            label="Likes"
            value="100,850"
            className="w-[400px] max-w-full"
          />
        </div>
      </Example>
    </>
  );
}
