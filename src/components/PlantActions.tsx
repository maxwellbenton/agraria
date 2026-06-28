"use client";

import { useState, useEffect, useRef } from "react";
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
import type { PlantSearchResult } from "@/lib/plant-companion";

const PLANT_STATUSES = ["PLANTED", "SPROUTING", "FLOWERING", "FRUITING", "HARVESTED", "REMOVED"];

const CREATE_PLANT  = gql`mutation CreatePlant($input: CreatePlantInput!) { createPlant(input: $input) { id } }`;
const UPDATE_PLANT  = gql`mutation UpdatePlant($id: ID!, $input: UpdatePlantInput!) { updatePlant(id: $id, input: $input) { id } }`;
const DELETE_PLANT  = gql`mutation DeletePlant($id: ID!) { deletePlant(id: $id) }`;
const DELETE_OBS    = gql`mutation DeleteObservation($id: ID!) { deleteObservation(id: $id) }`;

// ── Plant name autocomplete ───────────────────────────────────────────────────

function PlantNameInput({
  value,
  onChange,
  onSelectSuggestion,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectSuggestion: (result: PlantSearchResult) => void;
}) {
  const [suggestions, setSuggestions] = useState<PlantSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearchIdRef = useRef(0);
  const suppressNextSearchRef = useRef(false);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    if (value.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const searchId = ++latestSearchIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/plants/search?q=${encodeURIComponent(value)}`);
        const data: PlantSearchResult[] = await res.json();
        // Ignore stale responses from older in-flight requests.
        if (searchId !== latestSearchIdRef.current) return;
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        if (searchId !== latestSearchIdRef.current) return;
        setSuggestions([]);
        setOpen(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Plant name (e.g. Cherry Tomato)"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        required
        autoFocus
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.slug}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                onMouseDown={e => e.preventDefault()} // prevent input blur before click
                onClick={() => {
                  suppressNextSearchRef.current = true;
                  latestSearchIdRef.current += 1;
                  if (debounceRef.current) {
                    clearTimeout(debounceRef.current);
                    debounceRef.current = null;
                  }
                  setSuggestions([]);
                  onSelectSuggestion(s);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{s.displayName}</span>
                {s.fullName && s.fullName !== s.displayName && (
                  <span className="ml-2 text-muted-foreground italic text-xs">{s.fullName}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
          <PlantNameInput
            value={name}
            onChange={setName}
            onSelectSuggestion={(s) => {
              setName(s.displayName);
              if (s.fullName) setSpecies(s.fullName);
            }}
          />
          <Input
            placeholder="Species (e.g. Solanum lycopersicum)"
            value={species}
            onChange={e => setSpecies(e.target.value)}
          />
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
