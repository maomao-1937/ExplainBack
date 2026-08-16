import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExplainBack｜把知识讲明白",
  description: "用费曼学习法发现知识盲点，并通过追问真正学会。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
