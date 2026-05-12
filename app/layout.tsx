import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

const OG_IMAGE = "https://www.capconvert.com/cortex/og-image.png";
const CANONICAL = "https://www.capconvert.com/cortex";
const TITLE = "Cortex - Search Marketing Intelligence";
const DESCRIPTION =
  "Always on search marketing assistant. Get answers to any question regarding any platform.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.capconvert.com"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    siteName: "Capconvert",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Cortex - Search Marketing Intelligence",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

// Runs synchronously before first paint so the saved theme (or system pref)
// is applied to <html> with no FOUC. Shares the capconvert-theme key with
// capconvert-pm so the convention is consistent across ops apps.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('capconvert-theme');var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className="min-h-full flex flex-col bg-custom-black text-custom-white"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <TopBar />
        <div className="flex flex-1 min-h-0 flex-col">{children}</div>
      </body>
    </html>
  );
}
