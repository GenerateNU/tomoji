import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Banner } from "@/components/banner";
import { ProgressRing } from "@/components/progress-ring";
import { StatTile } from "@/components/stat-tile";

test("exposes progress ring value to assistive tech, clamped to 0–100", () => {
  const html = renderToStaticMarkup(<ProgressRing value={140} label="Profile completion" />);

  expect(html).toContain('role="progressbar"');
  expect(html).toContain('aria-valuenow="100"');
  expect(html).toContain("100%");
});

test("announces error banners as alerts and others as status", () => {
  expect(renderToStaticMarkup(<Banner tone="error">Disconnected</Banner>)).toContain(
    'role="alert"',
  );
  expect(renderToStaticMarkup(<Banner tone="success">Saved</Banner>)).toContain('role="status"');
});

test("says which way a stat's trend went, not only its color", () => {
  const html = renderToStaticMarkup(
    <StatTile label="Comments" value="4,312" trend={{ text: "-3%", direction: "down" }} />,
  );

  expect(html).toContain(">Down </span>");
});
