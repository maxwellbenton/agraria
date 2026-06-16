"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

const DELETE_GARDEN = gql`mutation DeleteGarden($id: ID!) { deleteGarden(id: $id) }`;
const CREATE_BED    = gql`mutation CreateBed($input: CreateBedInput!) { createBed(input: $input) { id } }`;
const UPDATE_BED    = gql`mutation UpdateBed($id: ID!, $input: UpdateBedInput!) { updateBed(id: $id, input: $input) { id } }`;
const DELETE_BED    = gql`mutation DeleteBed($id: ID!) { deleteBed(id: $id) }`;

// ── Delete garden ─────────────────────────────────────────────────────────────

export function DeleteGardenButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleteGarden, { loading }] = useMutation(DELETE_GARDEN);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this garden?</AlertDialogTitle>
          <AlertDialogDescription>All beds, plants, and observations inside it will be permanently removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={async () => { await deleteGarden({ variables: { id } }); router.push("/"); }}
          >
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Create bed ────────────────────────────────────────────────────────────────

export function CreateBedButton({ gardenId }: { gardenId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [createBed, { loading }] = useMutation(CREATE_BED);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createBed({ variables: { input: { gardenId, name, sizeSqFt: size ? parseFloat(size) : undefined } } });
    setName(""); setSize(""); setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-1.5 h-4 w-4" />New Bed</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New bed</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Bed name (e.g. Tomatoes & Herbs)" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input placeholder="Size in sq ft (optional)" type="number" min="0" step="0.1" value={size} onChange={e => setSize(e.target.value)} />
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit bed ──────────────────────────────────────────────────────────────────

export function EditBedButton({ id, currentName, currentSize }: { id: string; currentName: string; currentSize: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [size, setSize] = useState(currentSize?.toString() ?? "");
  const [updateBed, { loading }] = useMutation(UPDATE_BED);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateBed({ variables: { id, input: { name, sizeSqFt: size ? parseFloat(size) : undefined } } });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(currentName); setSize(currentSize?.toString() ?? ""); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit bed</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input placeholder="Size in sq ft (optional)" type="number" min="0" step="0.1" value={size} onChange={e => setSize(e.target.value)} />
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete bed ────────────────────────────────────────────────────────────────

export function DeleteBedButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleteBed, { loading }] = useMutation(DELETE_BED);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this bed?</AlertDialogTitle>
          <AlertDialogDescription>All plants and observations inside it will be permanently removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={async () => { await deleteBed({ variables: { id } }); router.refresh(); }}>
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
