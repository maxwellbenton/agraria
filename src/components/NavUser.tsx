"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function NavUser({ name, email }: { name?: string | null; email?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground hidden sm:block truncate max-w-[180px]">
        {name ?? email}
      </span>
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
        Sign out
      </Button>
    </div>
  );
}
