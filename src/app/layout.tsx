import type { Metadata } from "next";
import { ApolloWrapper } from "./ApolloWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agraria",
  description: "Keep track of your garden",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning>
        <ApolloWrapper>
          <main className="container">{children}</main>
        </ApolloWrapper>
      </body>
    </html>
  );
}
