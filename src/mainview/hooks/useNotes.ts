import { useState, useEffect, useCallback, useRef } from "react";
import { electrobun } from "@/lib/electrobun";
import type { Note } from "shared/rpc";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  // Keep ref in sync so the debounced save always has the right selectedId
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Load all notes on mount
  const refresh = useCallback(async () => {
    const data = await electrobun.rpc!.request.getNotes({});
    setNotes(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Create new note
  const createNote = useCallback(async () => {
    // Flush any pending save for current note
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const result = await electrobun.rpc!.request.saveNote({
      title: "Untitled",
      content: "",
    });
    if (result.success) {
      setNotes((prev) => [result.note, ...prev]);
      setSelectedId(result.note.id);
    }
    return result.note;
  }, []);

  // Save note (debounced, auto-called on input)
  const saveNote = useCallback(async (id: string, title: string, content: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      const result = await electrobun.rpc!.request.saveNote({ id, title, content });
      if (result.success) {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? result.note : n))
        );
      }
    }, 500);
  }, []);

  // Select a note — flush pending save first
  const selectNote = useCallback(async (id: string) => {
    if (saveTimer.current && selectedIdRef.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSelectedId(id);
  }, []);

  // Delete note
  const deleteNote = useCallback(async (id: string) => {
    await electrobun.rpc!.request.deleteNote({ id });
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  // Export note
  const exportNote = useCallback(async (id: string) => {
    await electrobun.rpc!.request.exportNote({ id });
  }, []);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  return {
    notes, selectedNote, selectedId, loading,
    setSelectedId: selectNote, createNote, saveNote, deleteNote, exportNote, refresh,
  };
}
