import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/app/update-banner";
import { BootSplash } from "@/components/app/boot-splash";
import { getBuildId } from "@/lib/build-id";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });
// Hoot's own words (answers, notes, the greeting) and nothing else.
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-source-serif" });
// Only the classic Backtesting layout still uses Inter; it's preloaded on no page.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", preload: false });

export const metadata: Metadata = {
  title: { default: "The Owl's Nest", template: "%s · The Owl's Nest" },
  description: "Research workspace for Owl Fund sector teams.",
};

// Browser chrome follows the OS setting; it can't see a theme picked in the app. Matches --background in each mode.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${sourceSerif.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Light, dark or the OS setting, remembered per browser. Sets the `dark` class on <html> before first paint. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* Hoot's welcome on the first full load of the day, or a slow full load; client navigation never shows it. */}
          <BootSplash />
          <UpdateBanner buildId={getBuildId()} />
          {children}
          {/* On a desktop Hoot is docked in the menu; on a phone he floats in a corner, so toasts stack above him there. */}
          <Toaster position="bottom-right" offset={{ bottom: 20, right: 20 }} mobileOffset={{ bottom: 80, right: 12 }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
