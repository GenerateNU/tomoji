import type { Metadata } from "next";
import { Geist_Mono, Host_Grotesk } from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { ConvexClientProvider } from "@/components/convex-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Host Grotesk matches the Figma hi-fi designs.
const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tomoji",
  description: "Tomoji connects creators and companies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hostGrotesk.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* AuthKitProvider must wrap ConvexClientProvider — the Convex
            adapter calls useAuth()/useAccessToken() from AuthKit. */}
        <AuthKitProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </AuthKitProvider>
        <Toaster />
      </body>
    </html>
  );
}
