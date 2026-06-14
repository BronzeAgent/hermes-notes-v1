import { useState } from "react";
import type { Note } from "shared/rpc";
import { NoteItem } from "./NoteItem";

type Props = {
  notes: Note[];
  selectedId: string | null;
  darkMode: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggleDark: () => void;
};

export function NoteList({ notes, selectedId, darkMode, onSelect, onCreate, onToggleDark }: Props) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.content.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  return (
    <aside className="w-[280px] shrink-0 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">Notes</h1>
        <div className="flex gap-1">
          <button
            onClick={onToggleDark}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? "\u2600" : "\u263E"}
          </button>
          <button
            onClick={onCreate}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg transition-colors"
            title="New Note"
          >
            +
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto note-list px-2 py-1 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            {search ? "No matching notes" : "No notes yet"}
          </p>
        )}
        {filtered.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            isActive={note.id === selectedId}
            onSelect={() => onSelect(note.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 dark:text-gray-500 text-center">
        {notes.length} note{notes.length !== 1 ? "s" : ""}
      </div>
    </aside>
  );
}
