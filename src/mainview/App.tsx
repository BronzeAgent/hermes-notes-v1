import { useState, useEffect } from "react";
import { useNotes } from "./hooks/useNotes";
import { NoteList } from "./components/NoteList";
import { NoteEditor } from "./components/NoteEditor";

export default function App() {
  const {
    notes, selectedNote, selectedId, loading,
    setSelectedId, createNote, saveNote, deleteNote, exportNote,
  } = useNotes();

  const [darkMode, setDarkMode] = useState(false);

  // Apply dark class to <html> for Tailwind
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <NoteList
        notes={notes}
        selectedId={selectedId}
        darkMode={darkMode}
        onSelect={setSelectedId}
        onCreate={createNote}
        onToggleDark={() => setDarkMode((d) => !d)}
      />
      <NoteEditor
        note={selectedNote}
        onSave={saveNote}
        onExport={exportNote}
        onDelete={deleteNote}
      />
    </div>
  );
}
