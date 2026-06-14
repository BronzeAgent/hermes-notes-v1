import type { Note } from "shared/rpc";

type Props = {
  note: Note;
  isActive: boolean;
  onSelect: () => void;
};

export function NoteItem({ note, isActive, onSelect }: Props) {
  const date = new Date(note.updatedAt);
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const preview = note.content.slice(0, 60).replace(/\n/g, " ") || "No content";

  return (
    <div
      onClick={onSelect}
      className={`
        px-4 py-3 rounded-lg cursor-pointer transition-colors
        ${isActive
          ? "bg-blue-500 text-white"
          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-200"
        }
      `}
    >
      <div className="font-semibold text-sm truncate">
        {note.title || "Untitled"}
      </div>
      <div className={`text-xs mt-0.5 ${isActive ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
        {dateStr}
      </div>
      <div className={`text-xs mt-1 truncate ${isActive ? "text-blue-100" : "text-gray-400 dark:text-gray-500"}`}>
        {preview}
      </div>
    </div>
  );
}
