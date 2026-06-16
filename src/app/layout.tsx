import type { Metadata } from "next";
import { ApolloWrapper } from "./ApolloWrapper";
import { NavUser } from "@/components/NavUser";
import { auth } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agraria",
  description: "Keep track of your garden",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning>
        <ApolloWrapper>
          {session?.user && (
            <header className="border-b border-border">
              <div className="container py-3 flex items-center justify-between" style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}>
                <span className="text-sm font-semibold text-primary">🌱 Agraria</span>
                <NavUser name={session.user.name} email={session.user.email} />
              </div>
            </header>
          )}
          <main className="container">{children}</main>
        </ApolloWrapper>
      </body>
    </html>
  );
}
