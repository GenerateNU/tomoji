/**
 * Whether the page at `pathname` belongs to the nav item that links to `href`.
 * Home only matches exactly; other items also own their sub-pages, so
 * `/opportunities/abc` keeps Opportunities selected.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
