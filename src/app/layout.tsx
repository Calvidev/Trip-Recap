import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Recap",
  description: "Your flights, trains and road trips — and how many days you spent everywhere.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Trip Recap", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07090f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
