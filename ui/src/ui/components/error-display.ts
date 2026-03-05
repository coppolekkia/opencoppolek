/**
 * Enhanced error display component
 * 
 * Renders errors with actionable suggestions and copy-to-clipboard functionality
 */

import { html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { enhanceError, formatEnhancedError, copyErrorToClipboard } from "../error-handling.ts";

export type ErrorDisplayProps = {
  error: string | Error | null;
  context?: {
    component?: string;
    action?: string;
  };
  compact?: boolean;
};

/**
 * Render enhanced error callout
 */
export function renderErrorDisplay(props: ErrorDisplayProps): TemplateResult | typeof nothing {
  if (!props.error) {
    return nothing;
  }

  const enhanced = enhanceError(props.error, props.context);
  const formatted = formatEnhancedError(enhanced);

  if (props.compact) {
    // Compact mode: just message + suggestion (no full formatting)
    return html`
      <div class="callout danger">
        <div style="display: flex; align-items: start; gap: 12px;">
          <div style="flex: 1;">
            <div>${enhanced.message}</div>
            ${enhanced.suggestion
              ? html`<div class="muted" style="margin-top: 6px; font-size: 14px;">
                  💡 ${enhanced.suggestion}
                </div>`
              : nothing}
          </div>
          <button
            class="btn btn--sm"
            @click=${() => copyErrorToClipboard(enhanced)}
            title="Copy error details"
            style="flex-shrink: 0;"
          >
            📋
          </button>
        </div>
      </div>
    `;
  }

  // Full mode: formatted output with all details
  return html`
    <div class="callout danger">
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex: 1; white-space: pre-wrap; font-family: inherit;">
          ${formatted.split("\n").map(
            (line) =>
              html`<div>
                ${line}${enhanced.docsUrl && line.includes("Docs:")
                  ? html`<a
                      href=${enhanced.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style="margin-left: 4px;"
                      >↗</a
                    >`
                  : nothing}
              </div>`,
          )}
        </div>
        <button
          class="btn btn--sm"
          @click=${() => copyErrorToClipboard(enhanced)}
          title="Copy error details"
          style="flex-shrink: 0;"
        >
          📋
        </button>
      </div>
    </div>
  `;
}

/**
 * Render inline error (for form fields)
 */
export function renderInlineError(error: string | null): TemplateResult | typeof nothing {
  if (!error) {
    return nothing;
  }

  return html`
    <div class="validation-error" style="color: var(--color-danger, #dc2626); font-size: 14px; margin-top: 4px;">
      ${error}
    </div>
  `;
}
