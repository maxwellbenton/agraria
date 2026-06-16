"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
// In Apollo Client 4, React hooks import from "@apollo/client/react"
// (in v3 they came from "@apollo/client" directly).
import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ADD_OBSERVATION = gql`
  mutation AddObservation($input: AddObservationInput!) {
    addObservation(input: $input) {
      id
      note
      type
      createdAt
    }
  }
`;

const TYPES = ["GENERAL", "WATERING", "FERTILIZING", "PEST", "HARVEST"];

export function AddObservationForm({ plantId }: { plantId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [type, setType] = useState("GENERAL");
  const [addObservation, { loading, error }] = useMutation(ADD_OBSERVATION);

  async function handleSubmit() {
    if (!note.trim()) return;
    await addObservation({
      variables: { input: { plantId, note, type } },
    });
    setNote("");
    setType("GENERAL");
    // Re-render the Server Component so the new observation shows up.
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <Input
        value={note}
        placeholder="Add an observation…"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        className="flex-1 min-w-48"
      />
      <Select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="w-36"
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t.toLowerCase()}
          </option>
        ))}
      </Select>
      <Button onClick={handleSubmit} disabled={loading} size="sm">
        {loading ? "Saving…" : "Add"}
      </Button>
      {error && (
        <span className="text-sm text-destructive">Error: {error.message}</span>
      )}
    </div>
  );
}
