import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC, Newsreader, Inter } from "next/font/google";
import "./globals.css";
import MainNav from "./components/MainNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "永恒档案 - EverArchive",
  description: "AI驱动的传记知识图谱系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} ${newsreader.variable} ${inter.variable} antialiased`}
      >
        <MainNav />
        {children}
      </body>
    </html>
  );
}
