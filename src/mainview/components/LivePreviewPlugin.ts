import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { TaskCheckboxWidget } from "./TaskCheckboxWidget";
import { CodeBlockBadge } from "./CodeBlockBadge";
import hljs from "highlight.js";

// --- Types ---

type CodeBlock = {
  openLine: number;
  closeLine: number; // -1 if unclosed (no closing ``` yet)
  language: string | null;
  openFenceLen: number; // length of the opening fence text (e.g. "```js" = 5)
};

// --- Helpers ---

function getCursorLine(state: EditorView["state"]): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

/** Parse highlight.js HTML output into CodeMirror Decoration.mark() calls */
function applySyntaxHighlighting(
  text: string,
  lineFrom: number,
  language: string,
  builder: RangeSetBuilder<Decoration>,
) {
  let result;
  try {
    result = hljs.highlight(text, { language, ignoreIllegals: true });
  } catch {
    return; // unsupported language — skip highlighting
  }

  const html: string = result.value;
  const spanRegex = /<span class="([^"]+)">([^]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  let plainPos = 0;

  while ((m = spanRegex.exec(html)) !== null) {
    const classes = m[1];
    const content = m[2];
    const idx = text.indexOf(content, plainPos);
    if (idx === -1) continue;

    const from = lineFrom + idx;
    const to = from + content.length;

    const cmClasses = classes
      .split(" ")
      .filter((c) => c.startsWith("hljs-"))
      .map((c) => "cm-" + c)
      .join(" ");

    if (cmClasses) {
      builder.add(
        from,
        to,
        Decoration.mark({ attributes: { class: cmClasses } }),
      );
    }

    plainPos = idx + content.length;
  }
}

// --- Pass 1: Scan for code block boundaries ---

function scanCodeBlocks(doc: EditorView["state"]["doc"]): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let i = 1;

  while (i <= doc.lines) {
    const text = doc.line(i).text;
    const fenceMatch = text.match(/^```(\w*)/);

    if (fenceMatch) {
      const openLine = i;
      const openFenceLen = fenceMatch[0].length;
      const language = fenceMatch[1] || null;
      let closeLine = -1;

      // Check for closing ``` on the SAME line (single-line block)
      const afterOpen = text.slice(openFenceLen);
      const sameLineCloseIdx = afterOpen.indexOf("```");
      if (sameLineCloseIdx !== -1) {
        closeLine = i;
        i = i + 1;
      } else {
        // Scan forward for closing fence on subsequent lines
        for (let j = i + 1; j <= doc.lines; j++) {
          if (/^```/.test(doc.line(j).text)) {
            closeLine = j;
            i = j + 1;
            break;
          }
        }

        if (closeLine === -1) {
          i = doc.lines + 1; // no closing fence — stop scanning
        }
      }

      blocks.push({ openLine, closeLine, language, openFenceLen });
    } else {
      i++;
    }
  }

  return blocks;
}

// --- Pass 2: Build decorations ---

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const cursorLine = getCursorLine(view.state);

  // Pass 1: find all code block boundaries
  const codeBlocks = scanCodeBlocks(doc);

  // Which block (if any) contains the cursor?
  const cursorBlock =
    codeBlocks.find((b) => {
      if (b.closeLine === -1) return cursorLine >= b.openLine;
      return cursorLine >= b.openLine && cursorLine <= b.closeLine;
    }) ?? null;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // --- Fenced code block boundary ---
    const block = codeBlocks.find(
      (b) => b.openLine === i || b.closeLine === i,
    );

    if (block) {
      // Cursor is in this block → show raw fences + content
      const cursorHere =
        cursorBlock !== null &&
        cursorBlock.openLine === block.openLine &&
        cursorBlock.closeLine === block.closeLine;

      if (cursorHere || i === cursorLine) {
        continue; // show raw markdown
      }

      if (block.openLine === block.closeLine) {
        // --- Single-line block: ```code``` all on one line ---
        const openLen = block.openFenceLen;
        const closeIdx = text.indexOf("```", openLen);

        if (closeIdx !== -1) {
          // Hide opening ```, show badge
          builder.add(
            line.from,
            line.from + openLen,
            Decoration.widget({
              widget: new CodeBlockBadge(block.language),
              side: 1,
            }),
          );

          // Hide closing ``` and trailing whitespace
          builder.add(
            line.from + closeIdx,
            line.to,
            Decoration.replace({}),
          );

          // Content between fences — code block styling
          const contentFrom = line.from + openLen;
          const contentTo = line.from + closeIdx;
          if (contentTo > contentFrom) {
            builder.add(
              contentFrom,
              contentTo,
              Decoration.line({ attributes: { class: "cm-code-block" } }),
            );

            if (block.language) {
              applySyntaxHighlighting(
                text.slice(openLen, closeIdx),
                contentFrom,
                block.language,
                builder,
              );
            }
          }
        }
      } else if (block.openLine === i) {
        // --- Opening fence (multi-line) — show language badge ---
        builder.add(
          line.from,
          line.to,
          Decoration.widget({
            widget: new CodeBlockBadge(block.language),
            side: 1,
          }),
        );
      } else {
        // --- Closing fence (multi-line) — hide entirely ---
        builder.add(line.from, line.to, Decoration.replace({}));
      }

      continue;
    }

    // Skip the cursor line — show raw markdown there
    if (i === cursorLine) continue;

    // --- Inside code block: styled box + syntax highlighting ---
    const parentBlock = codeBlocks.find(
      (b) =>
        i > b.openLine && (b.closeLine === -1 || i < b.closeLine),
    );

    if (parentBlock) {
      // Cursor in this block → show raw (skip all decorations for these lines)
      const cursorHere =
        cursorBlock !== null &&
        cursorBlock.openLine === parentBlock.openLine &&
        cursorBlock.closeLine === parentBlock.closeLine;

      if (!cursorHere) {
        builder.add(
          line.from,
          line.to,
          Decoration.line({ attributes: { class: "cm-code-block" } }),
        );

        if (parentBlock.language) {
          applySyntaxHighlighting(
            text,
            line.from,
            parentBlock.language,
            builder,
          );
        }
      }
      continue;
    }

    // --- Header: #, ##, ###, etc. ---
    const headerMatch = text.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const hashLen = headerMatch[1].length;
      builder.add(
        line.from,
        line.from + hashLen + 1,
        Decoration.mark({ attributes: { class: "cm-heading-prefix" } }),
      );
      const sizes = ["cm-h1", "cm-h2", "cm-h3", "cm-h4", "cm-h5", "cm-h6"];
      builder.add(
        line.from + hashLen + 1,
        line.to,
        Decoration.mark({
          attributes: {
            class: `${sizes[hashLen - 1]} ${hashLen <= 3 ? "cm-bold" : ""}`,
          },
        }),
      );
      continue;
    }

    // --- Task list: - [ ] or - [x] ---
    const taskMatch = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)/);
    if (taskMatch) {
      const indentEnd = line.from + taskMatch[1].length;
      const markerStart = indentEnd;
      const bracketStart = markerStart + 2; // past "- " / "* "

      const checked = taskMatch[3].toLowerCase() === "x";

      // Widget replaces the entire "- [ ]" prefix
      builder.add(
        markerStart,
        bracketStart + 3,
        Decoration.widget({
          widget: new TaskCheckboxWidget(checked, () => {
            const checkPos = bracketStart + 1; // char inside brackets
            view.dispatch({
              changes: {
                from: checkPos,
                to: checkPos + 1,
                insert: checked ? " " : "x",
              },
            });
          }),
        }),
      );

      // Strikethrough for completed tasks
      if (checked) {
        builder.add(
          bracketStart + 3,
          line.to,
          Decoration.mark({ attributes: { class: "cm-task-done" } }),
        );
      }

      continue;
    }

    // --- Unordered list: - or * ---
    const ulMatch = text.match(/^(\s*)([-*])\s+(.*)/);
    if (ulMatch) {
      const indentEnd = line.from + ulMatch[1].length;
      const bulletStart = indentEnd;
      const bulletEnd = bulletStart + 2;
      builder.add(
        bulletStart,
        bulletEnd,
        Decoration.mark({ attributes: { class: "cm-md-syntax" } }),
      );
      builder.add(
        bulletStart,
        bulletStart + 1,
        Decoration.mark({ attributes: { class: "cm-list-marker" } }),
      );
      continue;
    }

    // --- Ordered list: 1. 2. etc. ---
    const olMatch = text.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (olMatch) {
      const indentEnd = line.from + olMatch[1].length;
      const numLen = olMatch[2].length + 2;
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
      builder.add(
        line.from,
        line.from + prefixLen,
        Decoration.mark({ attributes: { class: "cm-md-syntax" } }),
      );
      builder.add(
        line.from,
        line.to,
        Decoration.line({ attributes: { class: "cm-blockquote" } }),
      );
      continue;
    }

    // --- Inline formatting (bold, italic, code, links) ---
    applyInlineDecorations(text, line.from, builder);
  }

  return builder.finish();
}

function applyInlineDecorations(
  text: string,
  lineFrom: number,
  builder: RangeSetBuilder<Decoration>,
) {
  // Collect all matches to handle overlaps by position
  type Match = { from: number; to: number; deco: Decoration };
  const all: Match[] = [];

  // --- Links: [text](url) ---
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(text)) !== null) {
    const bracketOpen = lineFrom + m.index;
    const labelStart = bracketOpen + 1;
    const labelEnd = labelStart + m[1].length; // before "]"
    const urlStart = labelEnd + 2; // after "]("
    const urlEnd = urlStart + m[2].length;
    // Dim syntax characters
    all.push({ from: bracketOpen, to: bracketOpen + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax" } }) });        // [
    all.push({ from: labelEnd, to: labelEnd + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax" } }) });              // ]
    all.push({ from: labelEnd + 1, to: labelEnd + 2, deco: Decoration.mark({ attributes: { class: "cm-md-syntax" } }) });          // (
    all.push({ from: urlEnd, to: urlEnd + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax" } }) });                  // )
    // Style link text
    all.push({ from: labelStart, to: labelEnd, deco: Decoration.mark({ attributes: { class: "cm-link" } }) });
    // Dim URL part
    all.push({ from: urlStart, to: urlEnd, deco: Decoration.mark({ attributes: { class: "cm-link-url" } }) });
  }

  // --- Inline code: `code` ---
  const codeRegex = /`([^`]+)`/g;
  while ((m = codeRegex.exec(text)) !== null) {
    const start = lineFrom + m.index;
    const innerEnd = start + m[0].length - 1;
    all.push({ from: start, to: start + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax" } }) });
    all.push({ from: innerEnd, to: innerEnd + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax" } }) });
    all.push({ from: start + 1, to: innerEnd, deco: Decoration.mark({ attributes: { class: "cm-inline-code" } }) });
  }

  // --- Bold: **text** ---
  const boldRegex = /\*\*([^*]+)\*\*/g;
  while ((m = boldRegex.exec(text)) !== null) {
    const start = lineFrom + m.index;
    const innerEnd = start + m[0].length - 2;
    all.push({ from: start, to: start + 2, deco: Decoration.mark({ attributes: { class: "cm-md-syntax cm-bold-delim" } }) });
    all.push({ from: innerEnd, to: innerEnd + 2, deco: Decoration.mark({ attributes: { class: "cm-md-syntax cm-bold-delim" } }) });
    all.push({ from: start + 2, to: innerEnd, deco: Decoration.mark({ attributes: { class: "cm-bold" } }) });
  }

  // --- Italic: *text* (but not **) ---
  const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
  while ((m = italicRegex.exec(text)) !== null) {
    const start = lineFrom + m.index;
    const innerEnd = start + m[0].length - 1;
    all.push({ from: start, to: start + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax cm-italic-delim" } }) });
    all.push({ from: innerEnd, to: innerEnd + 1, deco: Decoration.mark({ attributes: { class: "cm-md-syntax cm-italic-delim" } }) });
    all.push({ from: start + 1, to: innerEnd, deco: Decoration.mark({ attributes: { class: "cm-italic" } }) });
  }

  // Sort by position and apply
  all.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const { from, to, deco } of all) {
    builder.add(from, to, deco);
  }
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
    decorations: (v: { decorations: DecorationSet }): DecorationSet =>
      v.decorations,
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
  // Headers — prefix completely hidden and collapsed
  ".cm-heading-prefix": {
    opacity: "0",
    width: "0",
    display: "inline-block",
    overflow: "hidden",
    whiteSpace: "nowrap",
    verticalAlign: "bottom",
  },
  ".cm-h1": { fontSize: "1.5rem" },
  ".cm-h2": { fontSize: "1.25rem" },
  ".cm-h3": { fontSize: "1.125rem" },
  ".cm-h4": { fontSize: "1rem" },
  ".cm-h5": { fontSize: "0.95rem" },
  ".cm-h6": { fontSize: "0.85rem" },
  ".cm-bold": { fontWeight: 700 },
  // List markers — colored
  ".cm-list-marker": {
    color: "#3b82f6",
    fontWeight: 600,
  },
  // Italic
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
  // Link text
  ".cm-link": {
    color: "#3b82f6",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  ".cm-link-url": {
    opacity: "0.4",
    fontSize: "0.85em",
  },
});

// --- Export ---

export function livePreview() {
  return [livePreviewPlugin, baseTheme];
}
