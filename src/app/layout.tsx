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
  themeColor: "#070b09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Pre-paint theme boot — paint se pehle html par class lagti hai (flash nahi hota).
// Default DARK hai; user 'light' save kare to light.
const themeBoot = `(function(){try{var t=localStorage.getItem('qalb_theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
