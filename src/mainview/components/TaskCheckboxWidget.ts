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
    span.className = "cm-task-checkbox";
    span.textContent = this.checked ? "\u2611" : "\u2610"; // ☑ or ☐
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
