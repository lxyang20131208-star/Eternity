import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import AuthErrorHandler from "./components/AuthErrorHandler";

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:wght@400;500;600&family=Noto+Serif+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`antialiased`}>
        <AuthErrorHandler />
        {children}
      </body>
    </html>
  );
}
