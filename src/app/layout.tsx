import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/app/update-banner";
import { getBuildId } from "@/lib/build-id";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "The Owl's Nest", template: "%s · The Owl's Nest" },
  description: "Research workspace for Owl Fund sector teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <UpdateBanner buildId={getBuildId()} />
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
