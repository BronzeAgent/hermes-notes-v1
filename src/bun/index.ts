import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { join } from "path";
import {
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  renameSync,
  statSync,
  copyFileSync,
} from "fs";
import type { Note, NotesRPC } from "../../shared/rpc";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// --- Persistence ---
const notesDir = join(Utils.paths.userData, "notes");
if (!existsSync(notesDir)) {
  mkdirSync(notesDir, { recursive: true });
}

function sanitizeFilename(name: string): string {
  return name.replace(/\//g, "-").trim() || "Untitled";
}

function getNotePath(title: string): string {
  return join(notesDir, `${sanitizeFilename(title)}.md`);
}

function fileToNote(file: string): Note | null {
  const path = join(notesDir, file);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8");
    const title = file.replace(/\.md$/, "");
    const mtime = statSync(path).mtime;
    return {
      id: title,
      title,
      content,
      updatedAt: mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

function loadAllNotes(): Note[] {
  const files = readdirSync(notesDir).filter((f) => f.endsWith(".md"));
  const notes: Note[] = [];
  for (const file of files) {
    const note = fileToNote(file);
    if (note) notes.push(note);
  }
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// --- Migration: convert existing .json notes to plain .md ---
function migrateJsonNotes() {
  const jsonFiles = readdirSync(notesDir).filter((f) => f.endsWith(".json"));
  for (const file of jsonFiles) {
    try {
      const raw = readFileSync(join(notesDir, file), "utf-8");
      const note = JSON.parse(raw) as Note;
      const mdPath = getNotePath(note.title);
      if (!existsSync(mdPath)) {
        Bun.write(mdPath, note.content);
        console.log(`Migrated: ${file} → ${sanitizeFilename(note.title)}.md`);
      }
      unlinkSync(join(notesDir, file));
    } catch (err) {
      console.error(`Failed to migrate ${file}:`, err);
    }
  }
}

migrateJsonNotes();

// --- RPC Handlers ---
const notesRPC = BrowserView.defineRPC<NotesRPC>({
  maxRequestTime: 10000,
  handlers: {
    requests: {
      getNotes: () => loadAllNotes(),

      getNote: ({ id }) => fileToNote(`${id}.md`),

      saveNote: async ({ id, title, content }) => {
        const safeTitle = sanitizeFilename(title);
        const previousId = id || undefined;

        // New note
        if (!id) {
          // Handle collision: Untitled.md → Untitled (1).md
          let finalTitle = safeTitle;
          let counter = 1;
          while (existsSync(getNotePath(finalTitle))) {
            finalTitle = `${safeTitle} (${counter})`;
            counter++;
          }
          await Bun.write(getNotePath(finalTitle), content);
          const note = fileToNote(`${finalTitle}.md`)!;
          return { success: true, note };
        }

        // Existing note — title changed? Rename.
        const oldPath = getNotePath(id);
        if (safeTitle !== sanitizeFilename(id)) {
          let newPath = getNotePath(safeTitle);
          // Collision — append counter if target exists (and isn't the same file)
          if (existsSync(newPath) && newPath !== oldPath) {
            let counter = 1;
            let finalTitle = safeTitle;
            while (existsSync(getNotePath(finalTitle))) {
              finalTitle = `${safeTitle} (${counter})`;
              counter++;
            }
            newPath = getNotePath(finalTitle);
          }
          if (existsSync(oldPath)) {
            renameSync(oldPath, newPath);
          }
        }

        // Write content
        const finalPath = existsSync(getNotePath(safeTitle))
          ? getNotePath(safeTitle)
          : oldPath;
        const noteTitle = finalPath
          .split("/")
          .pop()!
          .replace(/\.md$/, "");

        await Bun.write(finalPath, content);
        const note = fileToNote(`${noteTitle}.md`)!;
        return {
          success: true,
          note,
          previousId: previousId !== note.id ? previousId : undefined,
        };
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
        const path = getNotePath(id);
        if (!existsSync(path)) return { success: false };
        const chosenPaths = await Utils.openFileDialog({
          startingFolder: Bun.env["HOME"] || "/",
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        if (chosenPaths[0] && chosenPaths[0] !== "") {
          const exportPath = join(chosenPaths[0], `${id}.md`);
          copyFileSync(path, exportPath);
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
