import { NavAuth } from "@/components/nav-auth";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-3 dark:border-white/[.145]">
        <span className="font-semibold tracking-tight">Tomoji</span>
        <NavAuth />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
