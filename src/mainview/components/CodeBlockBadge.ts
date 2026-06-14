import { WidgetType } from "@codemirror/view";

/**
 * Renders a small language badge in place of the opening ``` fence.
 * Shows the language name (e.g. "js") or a generic "</>" for unlabeled blocks.
 * Non-interactive — clicks pass through to the editor.
 */
export class CodeBlockBadge extends WidgetType {
  readonly language: string | null;

  constructor(language: string | null) {
    super();
    this.language = language;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-code-block-badge";
    span.textContent = this.language ?? "</>";
    return span;
  }

  eq(other: CodeBlockBadge): boolean {
    return this.language === other.language;
  }

  ignoreEvent(): boolean {
    // Let clicks pass through so user can place cursor on the fence line
    return true;
  }
}
