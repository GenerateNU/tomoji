/** Router stand-ins for fixture pages, which render outside the Next.js app router. */
export function useRouter() {
  return { push: (href: string) => console.info("navigate", href), replace() {}, back() {} };
}
export function usePathname() {
  return location.pathname;
}
export function useSearchParams() {
  return new URLSearchParams(location.search);
}
