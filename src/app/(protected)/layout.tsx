import { AppShell } from "@/features/navigation/components/app-shell";

/** Wraps every signed-in page in the sidebar shell, which renders the page's `<main>`. */
export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
