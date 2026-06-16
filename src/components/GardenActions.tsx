"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

const CREATE_GARDEN = gql`
  mutation CreateGarden($input: CreateGardenInput!) {
    createGarden(input: $input) { id }
  }
`;

const UPDATE_GARDEN = gql`
  mutation UpdateGarden($id: ID!, $input: UpdateGardenInput!) {
    updateGarden(id: $id, input: $input) { id }
  }
`;

// ── Create ────────────────────────────────────────────────────────────────────

export function CreateGardenButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [createGarden, { loading }] = useMutation(CREATE_GARDEN);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createGarden({ variables: { input: { name, location: location || undefined } } });
    setName(""); setLocation(""); setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New Garden</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New garden</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Garden name" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} />
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

export function EditGardenButton({
  id, currentName, currentLocation,
}: { id: string; currentName: string; currentLocation: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [location, setLocation] = useState(currentLocation ?? "");
  const [updateGarden, { loading }] = useMutation(UPDATE_GARDEN);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateGarden({ variables: { id, input: { name, location: location || null } } });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(currentName); setLocation(currentLocation ?? ""); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit garden</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} />
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
