# Markdown Support v2 — Live Preview Plan

> **Goal:** All notes are `.md` files. Editor shows live-rendered markdown with raw syntax only on the line you're actively editing (Obsidian live preview). No toggle.

**Tech Stack:** Replaces `marked` with CodeMirror 6 + `gray-matter` for YAML frontmatter. Drops the Edit/Preview toggle entirely.

---

## What Changes from v1

| Aspect | v1 (edit/preview toggle) | v2 (live preview) |
|---|---|---|
| Storage format | `${id}.json` | `${id}.md` with YAML frontmatter |
| Editor | `<textarea>` + toggle | CodeMirror 6 w/ live preview |
| Export format | `${title}.txt` | `${title}.md` |
| Key dependency | `marked` (~20KB) | `@codemirror/*` + `gray-matter` (~200KB) |
| File count | 3 files changed | 6 files changed |

---

## Approach

Single editor mode — no toggle. CodeMirror 6 handles both the raw-editing and rendered-display states on a per-line basis:

```
┌─ Editor ─────────────────────────────────────────┐
│ [Note title...]                    [Export] [Del]│
├──────────────────────────────────────────────────┤
│                                                  │
│  My Heading          ← rendered (h1, bold)      │
│                                                  │
│  • First item        ← rendered (bullet)         │
│  • Second item       ← rendered (bullet)         │
│  This is **raw** |   ← CURSOR HERE: raw markdown│
│  • Next item         ← rendered (bullet)         │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Key behavior:**
- The line containing the cursor shows raw markdown syntax (`**bold**`, `# heading`, `- item`)
- All other lines render as formatted text (bold is bold, headings are large, bullets show as bullets)
- Moving the cursor to a new line instantly re-renders the previous line
- No toggle button — this is always the editing experience
- Title input stays as a plain `<input>` above the editor

**How it works (CodeMirror 6 decorations):**
- A `StateField` tracks the cursor line
- A `ViewPlugin` applies decorations to all lines *except* the cursor line
- Decorations use `replace` widgets to swap markdown syntax tokens with styled DOM
  - `# ` prefix → hidden, remaining text styled as h1
  - `**text**` → delimiters hidden, inner text `font-weight: bold`
  - `*text*` → delimiters hidden, inner text `font-style: italic`
  - `- ` → replaced with bullet character
  - ``` ``` ``` → code block with background
  - `> ` → blockquote left border
- When cursor moves, decorations on the old line are removed and the new cursor line goes raw

---

## Storage Format

Notes move from JSON files to `.md` files with YAML frontmatter:

**Before** (`${id}.json`):
```json
{"id": "lxyz123", "title": "My Note", "content": "# Hello\n\nWorld", "updatedAt": "..."}
```

**After** (`${id}.md`):
```markdown
---
id: lxyz123
title: My Note
updatedAt: "2026-06-14T00:00:00.000Z"
---
# Hello

World
```

The `Note` type in `shared/rpc.ts` **does not change** — it still has `id, title, content, updatedAt`. The serialization layer in `src/bun/index.ts` handles frontmatter ↔ Note conversion.

---

## Files Changed

| File | Action | What |
|---|---|---|
| `package.json` | Add/remove deps | +`gray-matter`, +`@codemirror/view`, +`@codemirror/state`, +`@codemirror/lang-markdown`, +`@codemirror/commands`, +`@codemirror/language`; remove `marked` from old plan |
| `src/bun/index.ts` | Rewrite storage | `.json` → `.md`, frontmatter parse/write via `gray-matter`, export as `.md` |
| `src/shared/rpc.ts` | No change | `Note` type stays identical |
| `src/mainview/components/NoteEditor.tsx` | Rewrite | Replace `<textarea>` + toggle with CodeMirror 6 + live preview |
| `src/mainview/components/LivePreviewPlugin.ts` | New | CodeMirror ViewPlugin + StateField for per-line decorations |
| `src/mainview/index.css` | Rewrite | Replace toggle styles with CodeMirror theme overrides |

---

## Tasks

### Task 1: Install dependencies

```bash
cd /root/hermes-notes-v1
bun add gray-matter @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/commands @codemirror/language
bun add -d @types/codemirror__view @types/codemirror__state  # if available; gray-matter has built-in types
```

### Task 2: Update storage layer (`src/bun/index.ts`)

Key changes:
- `getNotePath(id)` → returns `${id}.md` instead of `${id}.json`
- `loadAllNotes()` → filters for `*.md` files
- `loadNote(id)` → reads `.md` file, parses frontmatter with `gray-matter`, extracts `content` from body and `id/title/updatedAt` from frontmatter
- `saveNote(...)` → writes `.md` file with `gray-matter.stringify(body, frontmatter)`
- `exportNote(id)` → saves as `${title}.md` instead of `${title}.txt`

```typescript
import matter from "gray-matter";

function getNotePath(id: string): string {
  return join(notesDir, `${id}.md`);
}

function loadNote(id: string): Note | null {
  const path = getNotePath(id);
  if (!existsSync(path)) return null;
  try {
    const raw = require("fs").readFileSync(path, "utf-8");
    const { data, content } = matter(raw);
    return { id: data.id, title: data.title, content, updatedAt: data.updatedAt };
  } catch {
    return null;
  }
}

// saveNote handler:
const { id: dataId, title, content, updatedAt } = note;
const frontmatter = { id: noteId, title: title || "Untitled", updatedAt };
const md = matter.stringify(content, frontmatter);
await Bun.write(getNotePath(noteId), md);
```

### Task 3: Create live preview plugin (`src/mainview/components/LivePreviewPlugin.ts`)

A CodeMirror 6 extension that:

1. Tracks the cursor line via a `StateField<number>`
2. Applies `Decoration.replace()` widgets to hide markdown syntax on non-cursor lines
3. Supported decorations:
   - **Headers** (`# `, `## `, `### `) → hide prefix, style remaining text
   - **Bold** (`**text**`) → hide `**` delimiters, style inner text bold
   - **Italic** (`*text*`) → hide `*` delimiters, style inner text italic
   - **Unordered lists** (`- `, `* `) → hide prefix, show bullet
   - **Blockquotes** (`> `) → hide prefix, add left border
   - **Code blocks** (``` ``` ```) → apply monospace background
   - **Links** (`[text](url)`) → hide syntax, style as blue link (non-clickable)
   - **Inline code** (`` `code` ``) → hide backticks, monospace background
4. Rebuilds decorations on cursor movement and document changes

```typescript
// Pseudocode structure:
import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

// Decoration builder: scan doc, build set of replace decorations for non-cursor lines

export function livePreview(): Extension {
  return [
    cursorLineField,
    livePreviewPlugin,
    baseTheme, // CodeMirror base theme overrides
  ];
}
```

### Task 4: Rewrite `NoteEditor.tsx`

Replace the textarea with a CodeMirror 6 instance mounted in a React `useRef` + `useEffect`:

```tsx
import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { livePreview } from "./LivePreviewPlugin";

export function NoteEditor({ note, onSave, onExport, onDelete }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Create/destroy CodeMirror on mount/unmount
  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      doc: note?.content ?? "",
      extensions: [
        lineNumbers(),
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        livePreview(),
      ],
      parent: editorRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, []); // created once, synced via effect below

  // Sync content when note changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !note) return;
    // Only replace if different note (avoid cursor reset on auto-save)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: note.content },
    });
  }, [note?.id]);

  // Auto-save on changes
  // (via EditorView.updateListener, debounced)

  // Title input + Export/Delete buttons remain in the header
  // ...
}
```

**Title input** stays as a separate `<input>` in the header — always editable, no live preview needed. Export and Delete buttons remain.

### Task 5: Update CSS (`src/mainview/index.css`)

Remove all the v1 `.markdown-preview` styles. Add CodeMirror theme overrides to match the app's dark/light mode:

```css
/* CodeMirror base overrides */
.cm-editor {
  @apply h-full;
}
.cm-editor .cm-scroller {
  @apply font-mono text-base leading-relaxed;
}
.cm-editor .cm-content {
  @apply py-4 px-5;
}

/* Dark mode */
.dark .cm-editor {
  @apply bg-gray-950 text-gray-300;
}
.dark .cm-editor .cm-gutters {
  @apply bg-gray-950 text-gray-600 border-gray-800;
}
.dark .cm-editor .cm-activeLine {
  @apply bg-gray-900/50;
}
```

### Task 6: Verify

```bash
cd /root/hermes-notes-v1
bunx tsc --noEmit    # Should pass
bunx vite build       # Should build cleanly
```

Manual test:
1. Create a note, type `# Hello` — when cursor leaves the line, it renders as a heading
2. Type `**bold text**` — renders bold when cursor moves away
3. Type `- item 1` + Enter + `- item 2` — renders as bullets
4. Move cursor between lines — each line toggles between raw/rendered
5. Export — opens save dialog for `.md` file
6. Check `~/Library/Application Support/.../notes/` — files are `.md` with frontmatter

---

## Migration: Existing `.json` notes

First-run migration: on startup, check for `.json` files without corresponding `.md` files in the notes directory. Convert them:

```typescript
// In src/bun/index.ts, before loadAllNotes():
for (const file of readdirSync(notesDir).filter(f => f.endsWith(".json"))) {
  const mdPath = join(notesDir, file.replace(".json", ".md"));
  if (!existsSync(mdPath)) {
    const note = JSON.parse(readFileSync(join(notesDir, file), "utf-8"));
    const frontmatter = { id: note.id, title: note.title, updatedAt: note.updatedAt };
    const md = matter.stringify(note.content, frontmatter);
    writeFileSync(mdPath, md);
    // Optionally: unlinkSync(join(notesDir, file)); // remove old .json
  }
}
```

---

## Summary

| Metric | v1 (toggle) | v2 (live preview) |
|---|---|---|
| New dependencies | 1 (`marked`) | 7 (`@codemirror/*` x6 + `gray-matter`) |
| Files changed | 3 | 6 (1 new) |
| New components | 0 | 1 (`LivePreviewPlugin.ts`) |
| Lines added | ~80 | ~250 |
| Complexity | Low | Medium |
| User experience | Toggle button | Seamless, Obsidian-like |

**Risk:** The live preview plugin is custom code — `Decoration.replace` widgets have edge cases with complex markdown (nested bold+italic, links with formatting). Start with headers, bold, italic, and lists; add blockquotes, code, and links as polish.
