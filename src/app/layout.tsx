
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
  title: 'EscribaLibro - Tu Compañero de Escritura de Libros',
  description: 'Crea, edita y formatea tu libro con facilidad. Diseña portadas, inserta imágenes y exporta en múltiples formatos.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={cn("min-h-screen bg-background font-sans antialiased", fontSans.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

    