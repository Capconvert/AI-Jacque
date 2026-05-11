import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Jacque, But Better",
  description: "AI assistant for Capconvert client questions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
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
