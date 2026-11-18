import type { Metadata } from "next";
// import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local"
import "./globals.css";


const geistSans = localFont({
  src: "./fonts/Geist-Regular.woff2",
  variable: "--font-geist",
  display: "swap"
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Regular.ttf",
  variable: "--font-geist-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "SuperTokens Admin Portal",
    template: "%s · SuperTokens Admin Portal",
  },
  description: "Administrative interface for managing users of an existing self-hosted SuperTokens deployment.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
