import type { Metadata } from 'next';
import { Inter as FontSans } from 'next/font/google'; // Using Inter as Geist is not standard
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from "@/components/ui/toaster";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: 'EscribaLibro - Your Book Writing Companion',
  description: 'Create, edit, and format your book with ease. Design covers, insert images, and export in multiple formats.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("min-h-screen bg-background font-sans antialiased", fontSans.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
