import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jacque",
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
        {children}
      </body>
    </html>
  );
}
