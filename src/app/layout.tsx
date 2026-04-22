import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Verdant — Learning plans that grow with you",
  description:
    "Turn a learning goal into a realistic schedule in your calendar, with adaptive rescheduling and progress feedback.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans text-[15px]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
