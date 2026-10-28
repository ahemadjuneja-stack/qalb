import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Qalb — Naat, Hamd & Sufi Qawwali",
  description:
    "Qalb: Aik paakIslamic media platform — authentic Naats, Hamd aur Sufi Qawwali, Hijri calendar, prayer times aur Islamic Store, sab aik jagah.",
  keywords: ["Qalb", "Naat", "Hamd", "Qawwali", "Nasheed", "Islamic app", "Hijri calendar", "Prayer times"],
  applicationName: "Qalb",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Qalb",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#060B09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
