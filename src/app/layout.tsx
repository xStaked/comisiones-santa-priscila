import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CommissionPro - Sistema de Liquidación",
  description: "Calcula y gestiona comisiones de vendedores de forma profesional",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${ibmPlexSans.variable} font-sans antialiased bg-[#F8F9FB] min-h-screen text-slate-900`}
      >
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
