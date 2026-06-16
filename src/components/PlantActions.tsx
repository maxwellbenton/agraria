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
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

const PLANT_STATUSES = ["PLANTED", "SPROUTING", "FLOWERING", "FRUITING", "HARVESTED", "REMOVED"];

const CREATE_PLANT  = gql`mutation CreatePlant($input: CreatePlantInput!) { createPlant(input: $input) { id } }`;
const UPDATE_PLANT  = gql`mutation UpdatePlant($id: ID!, $input: UpdatePlantInput!) { updatePlant(id: $id, input: $input) { id } }`;
const DELETE_PLANT  = gql`mutation DeletePlant($id: ID!) { deletePlant(id: $id) }`;
const DELETE_OBS    = gql`mutation DeleteObservation($id: ID!) { deleteObservation(id: $id) }`;

// ── Create plant ──────────────────────────────────────────────────────────────

export function CreatePlantButton({ bedId }: { bedId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [createPlant, { loading }] = useMutation(CREATE_PLANT);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createPlant({ variables: { input: { bedId, name, species: species || undefined } } });
    setName(""); setSpecies(""); setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-1.5 h-4 w-4" />Add Plant</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a plant</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Plant name (e.g. Cherry Tomato)" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input placeholder="Species (e.g. Solanum lycopersicum)" value={species} onChange={e => setSpecies(e.target.value)} />
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit plant ────────────────────────────────────────────────────────────────

export function EditPlantButton({
  id, currentName, currentSpecies, currentStatus,
}: { id: string; currentName: string; currentSpecies: string | null; currentStatus: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [species, setSpecies] = useState(currentSpecies ?? "");
  const [status, setStatus] = useState(currentStatus);
  const [updatePlant, { loading }] = useMutation(UPDATE_PLANT);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updatePlant({ variables: { id, input: { name, species: species || undefined, status } } });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(currentName); setSpecies(currentSpecies ?? ""); setStatus(currentStatus); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit plant</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Input placeholder="Species" value={species} onChange={e => setSpecies(e.target.value)} />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PLANT_STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete plant ──────────────────────────────────────────────────────────────

export function DeletePlantButton({ id }: { id: string }) {
  const router = useRouter();
  const [deletePlant, { loading }] = useMutation(DELETE_PLANT);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this plant?</AlertDialogTitle>
          <AlertDialogDescription>All observations for this plant will also be removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={async () => { await deletePlant({ variables: { id } }); router.refresh(); }}>
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Delete observation ────────────────────────────────────────────────────────

export function DeleteObservationButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleteObservation, { loading }] = useMutation(DELETE_OBS);
  return (
    <button
      onClick={async () => { await deleteObservation({ variables: { id } }); router.refresh(); }}
      disabled={loading}
      className="ml-2 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      aria-label="Delete observation"
    >
      ✕
    </button>
  );
}
