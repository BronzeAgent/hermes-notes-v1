import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

// --- Decoration builder ---

function getCursorLine(state: EditorView["state"]): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const cursorLine = getCursorLine(view.state);

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // Skip the cursor line — show raw markdown there
    if (i === cursorLine) continue;

    // --- Header: #, ##, ###, etc. ---
    const headerMatch = text.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const hashLen = headerMatch[1].length;
      // Dim the "# " prefix
      builder.add(
        line.from,
        line.from + hashLen + 1,
        Decoration.mark({ attributes: { class: "cm-md-syntax" } }),
      );
      // Style the header text
      const sizes = ["cm-h1", "cm-h2", "cm-h3", "cm-h4", "cm-h5", "cm-h6"];
      builder.add(
        line.from + hashLen + 1,
        line.to,
        Decoration.mark({ attributes: { class: `${sizes[hashLen - 1]} ${hashLen <= 3 ? "cm-bold" : ""}` } }),
      );
      continue;
    }

    // --- Unordered list: - or * ---
    const ulMatch = text.match(/^(\s*)([-*])\s+(.*)/);
    if (ulMatch) {
      const indentEnd = line.from + ulMatch[1].length;
      const bulletStart = indentEnd;
      const bulletEnd = bulletStart + 2; // "- " or "* "
      // Dim the bullet prefix
      builder.add(bulletStart, bulletEnd, Decoration.mark({ attributes: { class: "cm-md-syntax" } }));
      // Color the bullet character itself
      builder.add(bulletStart, bulletStart + 1, Decoration.mark({ attributes: { class: "cm-list-marker" } }));
      continue;
    }

    // --- Ordered list: 1. 2. etc. ---
    const olMatch = text.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (olMatch) {
      const indentEnd = line.from + olMatch[1].length;
      const numLen = olMatch[2].length + 2; // "1. "
      builder.add(
        indentEnd,
        indentEnd + numLen,
        Decoration.mark({ attributes: { class: "cm-list-marker" } }),
      );
      continue;
    }

    // --- Blockquote: > ---
    const bqMatch = text.match(/^>\s?(.*)/);
    if (bqMatch) {
      const prefixLen = bqMatch[0].length - bqMatch[1].length;
      // Dim the "> " prefix
      builder.add(
        line.from,
        line.from + prefixLen,
        Decoration.mark({ attributes: { class: "cm-md-syntax" } }),
      );
      // Blockquote styling on the whole line
      builder.add(
        line.from,
        line.to,
        Decoration.line({
          attributes: { class: "cm-blockquote" },
        }),
      );
      continue;
    }

    // --- Inline code: `code` ---
    const codeRegex = /`([^`]+)`/g;
    let codeMatch;
    while ((codeMatch = codeRegex.exec(text)) !== null) {
      const start = line.from + codeMatch.index;
      const openEnd = start + 1; // backtick
      const innerStart = openEnd;
      const innerEnd = start + codeMatch[0].length - 1;
      const closeStart = innerEnd;
      const closeEnd = start + codeMatch[0].length;
      // Dim backticks
      builder.add(start, openEnd, Decoration.mark({ attributes: { class: "cm-md-syntax" } }));
      builder.add(closeStart, closeEnd, Decoration.mark({ attributes: { class: "cm-md-syntax" } }));
      // Style code content
      builder.add(innerStart, innerEnd, Decoration.mark({ attributes: { class: "cm-inline-code" } }));
    }

    // --- Bold: **text** ---
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let boldMatch;
    while ((boldMatch = boldRegex.exec(text)) !== null) {
      const start = line.from + boldMatch.index;
      const openEnd = start + 2; // "**"
      const innerStart = openEnd;
      const innerEnd = start + boldMatch[0].length - 2;
      const closeEnd = start + boldMatch[0].length;
      // Dim the ** delimiters
      builder.add(start, openEnd, Decoration.mark({ attributes: { class: "cm-md-syntax cm-bold-delim" } }));
      builder.add(innerEnd, closeEnd, Decoration.mark({ attributes: { class: "cm-md-syntax cm-bold-delim" } }));
      // Bold the inner text
      builder.add(innerStart, innerEnd, Decoration.mark({ attributes: { class: "cm-bold" } }));
    }

    // --- Italic: *text* (but not **) ---
    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
    let italicMatch;
    while ((italicMatch = italicRegex.exec(text)) !== null) {
      const start = line.from + italicMatch.index;
      const openEnd = start + 1; // "*"
      const innerStart = openEnd;
      const innerEnd = start + italicMatch[0].length - 1;
      const closeEnd = start + italicMatch[0].length;
      // Dim the * delimiters
      builder.add(start, openEnd, Decoration.mark({ attributes: { class: "cm-md-syntax cm-italic-delim" } }));
      builder.add(innerEnd, closeEnd, Decoration.mark({ attributes: { class: "cm-md-syntax cm-italic-delim" } }));
      // Italic the inner text
      builder.add(innerStart, innerEnd, Decoration.mark({ attributes: { class: "cm-italic" } }));
    }
  }

  return builder.finish();
}

// --- View Plugin ---

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// --- Base theme ---

const baseTheme = EditorView.baseTheme({
  // Markdown syntax characters — dimmed
  ".cm-md-syntax": {
    opacity: "0.3",
    fontWeight: "400",
    fontStyle: "normal",
  },
  ".cm-bold-delim, .cm-italic-delim": {
    fontSize: "0.85em",
  },
  // Headers
  ".cm-h1": { fontSize: "1.5rem" },
  ".cm-h2": { fontSize: "1.25rem" },
  ".cm-h3": { fontSize: "1.125rem" },
  ".cm-h4": { fontSize: "1rem" },
  ".cm-h5": { fontSize: "0.95rem" },
  ".cm-h6": { fontSize: "0.85rem" },
  ".cm-bold": { fontWeight: 700 },
  // List markers — colored, not dimmed
  ".cm-list-marker": {
    color: "#3b82f6",
    fontWeight: 600,
  },
  // Bold/italic
  ".cm-italic": { fontStyle: "italic" },
  // Inline code
  ".cm-inline-code": {
    backgroundColor: "#f3f4f6",
    padding: "0 3px",
    borderRadius: "3px",
    fontFamily: "monospace",
    fontSize: "0.9em",
  },
  ".dark .cm-inline-code": {
    backgroundColor: "#1f2937",
  },
  // Blockquote
  ".cm-blockquote": {
    borderLeft: "3px solid #9ca3af",
    paddingLeft: "8px",
    fontStyle: "italic",
    color: "#6b7280",
  },
});

// --- Export ---

export function livePreview() {
  return [livePreviewPlugin, baseTheme];
}
