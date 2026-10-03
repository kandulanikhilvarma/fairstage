"use client";
import { useEffect, useState } from "react";
import { api } from "./provider";
export function RoundNote({ roundId }: { roundId: string }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ note: string }>("rounds/" + roundId + "/notes")
      .then((r) => {
        if (active) setNote(r.note);
      })
      .catch(() => {
        if (active)
          setError("The note could not load. Please reopen the round.");
      });
    return () => {
      active = false;
    };
  }, [roundId]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("rounds/" + roundId + "/notes", { note });
      setMessage("Your private note is saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The note could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inline-form" onSubmit={save}>
      <div className="field">
        <label htmlFor={"note-" + roundId}>Your private interview note</label>
        <textarea
          id={"note-" + roundId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
        />
        <small>Only your account can read this note.</small>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <button className="button secondary small" disabled={busy}>
        {busy ? "Save note…" : "Save private note"}
      </button>
    </form>
  );
}
