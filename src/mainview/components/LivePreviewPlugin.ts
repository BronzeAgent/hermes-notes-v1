import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// --- Cursor-line tracking ---

const setCursorLine = StateEffect.define<number>();

const cursorLineField = StateField.define<number>({
  create: () => 0,
  update: (value, tr) => {
    for (const e of tr.effects) {
      if (e.is(setCursorLine)) return e.value;
    }
    return value;
  },
});

// --- Inline-styled text widget (replaces markdown wrapper chars) ---

class StyledTextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly className: string,
  ) {
    super();
  }

  eq(other: StyledTextWidget): boolean {
    return this.text === other.text && this.className === other.className;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// --- Decoration builder ---

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const cursorLine = view.state.field(cursorLineField);

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // Skip the cursor line — show raw markdown there
    if (i === cursorLine) continue;

    // --- Header: #, ##, ###, etc. ---
    const headerMatch = text.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      // Hide the "# " prefix
      builder.add(
        line.from,
        line.from + headerMatch[1].length + 1,
        Decoration.replace({}),
      );
      // Style the header text
      const fontSize = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"][level - 1];
      builder.add(
        line.from + headerMatch[1].length + 1,
        line.to,
        Decoration.mark({
          attributes: {
            class: `cm-header cm-header-${level} font-bold ${fontSize} mt-3 mb-1`,
          },
        }),
      );
      continue;
    }

    // --- Unordered list: - or * ---
    const ulMatch = text.match(/^(\s*)([-*])\s+(.*)/);
    if (ulMatch) {
      const indentLen = ulMatch[1].length;
      const bulletLen = ulMatch[2].length + 1; // "- " or "* "
      // Replace the bullet prefix with nothing, show a bullet widget
      builder.add(
        line.from + indentLen,
        line.from + indentLen + bulletLen,
        Decoration.replace({
          widget: new StyledTextWidget("•", "cm-list-bullet"),
        }),
      );
      continue;
    }

    // --- Ordered list: 1. 2. etc. ---
    const olMatch = text.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (olMatch) {
      const indentLen = olMatch[1].length;
      const num = olMatch[2];
      const prefixLen = num.length + 2; // "1. "
      builder.add(
        line.from + indentLen,
        line.from + indentLen + prefixLen,
        Decoration.replace({
          widget: new StyledTextWidget(`${num}.`, "cm-list-number"),
        }),
      );
      continue;
    }

    // --- Blockquote: > ---
    const bqMatch = text.match(/^>\s?(.*)/);
    if (bqMatch) {
      // Hide the "> " prefix
      builder.add(
        line.from,
        line.from + (bqMatch[0].length - bqMatch[1].length),
        Decoration.replace({}),
      );
      // Add blockquote styling to the whole line
      builder.add(
        line.from,
        line.to,
        Decoration.line({
          attributes: {
            class: "cm-blockquote",
            style: "border-left: 3px solid #9ca3af; padding-left: 8px; font-style: italic; color: #6b7280;",
          },
        }),
      );
      continue;
    }

    // --- Inline code: `code` ---
    const codeRegex = /`([^`]+)`/g;
    let codeMatch;
    while ((codeMatch = codeRegex.exec(text)) !== null) {
      const start = line.from + codeMatch.index;
      const end = start + codeMatch[0].length;
      // Replace the whole `code` with styled widget
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new StyledTextWidget(codeMatch[1], "cm-inline-code"),
        }),
      );
    }

    // --- Bold: **text** ---
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let boldMatch;
    while ((boldMatch = boldRegex.exec(text)) !== null) {
      const start = line.from + boldMatch.index;
      const end = start + boldMatch[0].length;
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new StyledTextWidget(boldMatch[1], "cm-bold"),
        }),
      );
    }

    // --- Italic: *text* (but not **) ---
    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
    let italicMatch;
    while ((italicMatch = italicRegex.exec(text)) !== null) {
      const start = line.from + italicMatch.index;
      const end = start + italicMatch[0].length;
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new StyledTextWidget(italicMatch[1], "cm-italic"),
        }),
      );
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
        // Update cursor line
        const cursorLine = update.state.doc.lineAt(
          update.state.selection.main.head,
        ).number;
        update.view.dispatch({
          effects: setCursorLine.of(cursorLine),
        });
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
  ".cm-header": { display: "block" },
  ".cm-header-1": { fontSize: "1.5rem", fontWeight: 700 },
  ".cm-header-2": { fontSize: "1.25rem", fontWeight: 700 },
  ".cm-header-3": { fontSize: "1.125rem", fontWeight: 600 },
  ".cm-list-bullet": { color: "#3b82f6", marginRight: "0.25rem" },
  ".cm-list-number": { color: "#3b82f6", marginRight: "0.25rem" },
  ".cm-bold": { fontWeight: 700 },
  ".cm-italic": { fontStyle: "italic" },
  ".cm-inline-code": {
    backgroundColor: "#f3f4f6",
    padding: "0 4px",
    borderRadius: "3px",
    fontFamily: "monospace",
    fontSize: "0.9em",
  },
  ".dark .cm-inline-code": {
    backgroundColor: "#1f2937",
  },
});

// --- Export ---

export function livePreview() {
  return [cursorLineField, livePreviewPlugin, baseTheme];
}
