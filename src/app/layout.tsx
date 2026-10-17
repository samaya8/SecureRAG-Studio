import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SecureRAG Studio",
  description:
    "A secure retrieval-augmented generation application that answers only from approved documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
