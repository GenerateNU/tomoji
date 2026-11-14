/** Records pushes instead of navigating, so a step can be driven in isolation. */
const pushes: string[] = [];

export const navigation = {
  pushes,
  pathname: new URLSearchParams(location.search).get("step") ?? "/onboarding/connect-x",
};

export function useRouter() {
  return {
    push: (href: string) => pushes.push(href),
    replace: (href: string) => pushes.push(href),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
}

export function usePathname() {
  return navigation.pathname;
}

export function redirect(href: string) {
  pushes.push(href);
}
