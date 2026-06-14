import { useState, useEffect } from "react";
import type { Note } from "shared/rpc";

type Props = {
  note: Note | null;
  onSave: (id: string, title: string, content: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
};

export function NoteEditor({ note, onSave, onExport, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Sync local state when selected note changes
  useEffect(() => {
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
  }, [note?.id]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (note) onSave(note.id, value, content);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (note) onSave(note.id, title, value);
  };

  // Empty state
  if (!note) {
    return (
      <main className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        <p className="text-lg">Select a note or create a new one</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col">
      {/* Editor header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title..."
          className="flex-1 text-xl font-semibold bg-transparent border-none outline-none text-gray-900 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600"
        />
        <button
          onClick={() => onExport(note.id)}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Export
        </button>
        <button
          onClick={() => onDelete(note.id)}
          className="px-3 py-1.5 text-sm border border-red-200 dark:border-red-900 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Content */}
      <textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Start writing..."
        className="flex-1 resize-none border-none outline-none px-5 py-4 text-base leading-relaxed bg-transparent text-gray-800 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 font-[inherit]"
      />
    </main>
  );
}
