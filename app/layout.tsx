import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pega Vídeo — Baixe vídeos de qualquer link",
  description:
    "Cole o link de um vídeo e baixe em MP4 na melhor qualidade ou extraia o áudio em MP3. Roda local, sem cadastro e sem anúncios.",
};

export const viewport: Viewport = {
  themeColor: "#f3e7cf",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
