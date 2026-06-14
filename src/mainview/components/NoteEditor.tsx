import { useState, useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { livePreview } from "./LivePreviewPlugin";
import type { Note } from "shared/rpc";

type Props = {
  note: Note | null;
  onSave: (id: string, title: string, content: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
};

const AUTO_SAVE_MS = 500;

export function NoteEditor({ note, onSave, onExport, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteId = useRef<string | null>(null);

  // Sync title when note changes
  useEffect(() => {
    setTitle(note?.title ?? "");
  }, [note?.id]);

  // Create CodeMirror on mount
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const view = new EditorView({
      doc: note?.content ?? "",
      extensions: [
        lineNumbers(),
        markdown({ base: markdownLanguage }),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        livePreview(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && currentNoteId.current) {
            // Debounced auto-save
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
              saveTimer.current = null;
              if (currentNoteId.current && viewRef.current) {
                onSave(
                  currentNoteId.current,
                  title,
                  viewRef.current.state.doc.toString(),
                );
              }
            }, AUTO_SAVE_MS);
          }
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
      parent: editorContainerRef.current,
    });

    viewRef.current = view;
    currentNoteId.current = note?.id ?? null;

    return () => {
      // Flush pending save before destroy
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (currentNoteId.current && viewRef.current) {
          onSave(
            currentNoteId.current,
            title,
            viewRef.current.state.doc.toString(),
          );
        }
      }
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync editor content when a different note is selected
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !note) return;

    if (currentNoteId.current !== note.id) {
      // Flush pending save for previous note
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      currentNoteId.current = note.id;
      // Replace entire document
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: note.content,
        },
      });
    }
  }, [note?.id, note?.content]);

  // Title change handler
  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (note) onSave(note.id, value, viewRef.current?.state.doc.toString() ?? "");
    },
    [note, onSave],
  );

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

      {/* CodeMirror editor */}
      <div ref={editorContainerRef} className="flex-1 overflow-hidden" />
    </main>
  );
}
