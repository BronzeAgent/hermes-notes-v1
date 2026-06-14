import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { join } from "path";
import { mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import type { Note, NotesRPC } from "../../shared/rpc";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// --- Persistence ---
const notesDir = join(Utils.paths.userData, "notes");
if (!existsSync(notesDir)) {
  mkdirSync(notesDir, { recursive: true });
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getNotePath(id: string): string {
  return join(notesDir, `${id}.json`);
}

function loadNote(id: string): Note | null {
  const path = getNotePath(id);
  if (!existsSync(path)) return null;
  try {
    const text = require("fs").readFileSync(path, "utf-8");
    return JSON.parse(text) as Note;
  } catch {
    return null;
  }
}

function loadAllNotes(): Note[] {
  const files = readdirSync(notesDir).filter((f) => f.endsWith(".json"));
  const notes: Note[] = [];
  for (const file of files) {
    const note = loadNote(file.replace(".json", ""));
    if (note) notes.push(note);
  }
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// --- RPC Handlers ---
const notesRPC = BrowserView.defineRPC<NotesRPC>({
  maxRequestTime: 10000,
  handlers: {
    requests: {
      getNotes: () => loadAllNotes(),
      getNote: ({ id }) => loadNote(id),
      saveNote: async ({ id, title, content }) => {
        const noteId = id || generateId();
        const note: Note = {
          id: noteId,
          title: title || "Untitled",
          content,
          updatedAt: new Date().toISOString(),
        };
        await Bun.write(getNotePath(noteId), JSON.stringify(note, null, 2));
        return { success: true, note };
      },
      deleteNote: ({ id }) => {
        const path = getNotePath(id);
        if (existsSync(path)) {
          unlinkSync(path);
          return { success: true };
        }
        return { success: false };
      },
      exportNote: async ({ id }) => {
        const note = loadNote(id);
        if (!note) return { success: false };
        const chosenPaths = await Utils.openFileDialog({
          startingFolder: Bun.env["HOME"] || "/",
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        if (chosenPaths[0] && chosenPaths[0] !== "") {
          const exportPath = join(chosenPaths[0], `${note.title}.txt`);
          await Bun.write(exportPath, note.content);
          return { success: true, path: exportPath };
        }
        return { success: false };
      },
    },
    messages: {},
  },
});

// --- HMR detection ---
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR: ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {}
  }
  return "views://mainview/index.html";
}

// --- Window ---
const mainWindow = new BrowserWindow({
  title: "Hermes Notes",
  url: await getMainViewUrl(),
  rpc: notesRPC,
  frame: { width: 900, height: 650, x: 200, y: 200 },
});

console.log("Hermes Notes started!");
console.log(`Notes stored in: ${notesDir}`);

// Keep reference to prevent garbage collection
void mainWindow;
