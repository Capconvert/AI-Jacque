import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Jacque, But Better",
  description: "AI assistant for Capconvert client questions",
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
