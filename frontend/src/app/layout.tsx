import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlowVision AI | Intelligent Traffic Telemetry & Vehicle Analysis",
  description: "Next-generation computer vision dashboard for automated vehicle detection, classification, and traffic flow density telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#070b14] text-slate-100 antialiased selection:bg-cyan-500 selection:text-white flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
