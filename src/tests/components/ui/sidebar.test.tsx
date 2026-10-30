import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar, SidebarItem, SidebarNav } from "@/components/ui/sidebar";

function renderNav({ collapsed = false } = {}) {
  return renderToStaticMarkup(
    <Sidebar collapsed={collapsed}>
      <SidebarNav aria-label="Main">
        <SidebarItem href="/home">Home</SidebarItem>
        <SidebarItem href="/campaigns" active badge={3}>
          Campaigns
        </SidebarItem>
      </SidebarNav>
    </Sidebar>,
  );
}

test("marks only the active item as the current page", () => {
  const html = renderNav();

  const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g);
  expect(current).toHaveLength(1);
  expect(current?.[0]).toContain('href="/campaigns"');
  expect(current?.[0]).toContain("data-active");
});

test("keeps item labels in the markup when collapsed to a rail", () => {
  const html = renderNav({ collapsed: true });

  expect(html).toContain("data-collapsed");
  expect(html).toContain(">Home</span>");
  expect(html).toContain(">Campaigns</span>");
});
