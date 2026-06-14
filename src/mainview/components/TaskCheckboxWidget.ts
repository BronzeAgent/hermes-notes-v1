import { WidgetType } from "@codemirror/view";

/**
 * Renders a clickable checkbox widget in place of `[ ]` / `[x]` markdown.
 * Displays ☐ (unchecked) or ☑ (checked) with hover styling.
 * The `onToggle` callback fires on click; the parent plugin wires this
 * to dispatch the CodeMirror transaction that mutates the source text.
 */
export class TaskCheckboxWidget extends WidgetType {
  readonly checked: boolean;
  readonly onToggle: () => void;

  constructor(checked: boolean, onToggle: () => void) {
    super();
    this.checked = checked;
    this.onToggle = onToggle;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = [
      "inline-flex items-center justify-center",
      "w-5 h-5",
      "border-2 rounded",
      "align-middle mr-1",
      "cursor-pointer select-none",
      "hover:opacity-70",
      this.checked
        ? "bg-blue-500 border-blue-500"
        : "border-gray-400 dark:border-gray-500",
    ].join(" ");

    if (this.checked) {
      span.textContent = "\u2713"; // ✓
      span.className += " text-white text-xs font-bold";
    }

    span.setAttribute("aria-checked", String(this.checked));
    span.setAttribute("role", "checkbox");
    span.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus in editor
      this.onToggle();
    });
    return span;
  }

  eq(other: TaskCheckboxWidget): boolean {
    return this.checked === other.checked;
  }

  ignoreEvent(): boolean {
    // Don't let CodeMirror swallow mousedown — we handle it ourselves
    return false;
  }
}
