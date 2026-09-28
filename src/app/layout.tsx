import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/app/update-banner";
import { BootSplash } from "@/components/app/boot-splash";
import { getBuildId } from "@/lib/build-id";
import "./globals.css";

const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-instrument" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });
// Only the classic Backtesting layout still uses Inter; it's preloaded on no page.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", preload: false });

export const metadata: Metadata = {
  title: { default: "The Owl's Nest", template: "%s · The Owl's Nest" },
  description: "Research workspace for Owl Fund sector teams.",
};

// Browser chrome follows the OS setting; it can't see a theme picked in the app. Matches --background in each mode.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1916" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${plexMono.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Light, dark or the OS setting, remembered per browser. Sets the `dark` class on <html> before first paint. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* Hoot's welcome on the first full load of the day, or a slow full load; client navigation never shows it. */}
          <BootSplash />
          <UpdateBanner buildId={getBuildId()} />
          {children}
          {/* Offset so toasts stack above Hoot rather than on top of him. */}
          <Toaster position="bottom-right" offset={{ bottom: 96, right: 20 }} mobileOffset={{ bottom: 80, right: 12 }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
