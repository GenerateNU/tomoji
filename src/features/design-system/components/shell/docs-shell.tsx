import type { ReactNode } from "react";
import { DocsNav } from "./docs-nav";
import { TopBar } from "./top-bar";

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      <div className="flex">
        <DocsNav />
        <main className="min-w-0 flex-1 pt-10 pr-6 pb-24 pl-6 sm:pr-12 md:pl-12 lg:pl-16">
          {children}
        </main>
      </div>
    </>
  );
}
