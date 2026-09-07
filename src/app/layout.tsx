import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// @ts-ignore: Allow side-effect import of global CSS without type declarations
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { Toaster as SonnerToaster } from 'sonner';
import { Toaster } from "@/components/ui/toaster";
import { SpeedInsights } from "@vercel/speed-insights/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Employee Attendance",
  description: "To check the attendance of employees",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <div className="flex min-h-screen flex-col">
          <div className="sticky top-0 z-50 w-full">
            <Navbar />
          </div>
          <main className="flex-1 w-full overflow-x-auto">
            {children}
          </main>

          {/* sonner — used by components importing `toast` from 'sonner' */}
          <SonnerToaster
            richColors
            position="top-center"
            toastOptions={{
              className: "!w-[500px] !py-6 !px-6 !text-lg",
            }}
          />

          {/* shadcn — required by components using `useToast` from '@/components/ui/use-toast' */}
          <Toaster />

          <SpeedInsights />
        </div>
      </body>
    </html>
  );
}