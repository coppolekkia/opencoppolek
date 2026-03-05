/**
 * Keyboard shortcuts handler for OpenClaw Control UI
 * 
 * Supports:
 * - Ctrl+S: Save current view (config/cron)
 * - Ctrl+/: Toggle sidebar
 * - Ctrl+1-9: Switch tabs
 * - Esc: Close modals/cancel operations
 * - Alt+S: Quick session switcher (future)
 * - Ctrl+K: Command palette (future)
 */

import type { Tab } from "./navigation.ts";

export type KeyboardShortcutHandler = {
  onSave?: () => void | Promise<void>;
  onToggleSidebar?: () => void;
  onSwitchTab?: (tabIndex: number) => void;
  onEscape?: () => void;
  onQuickSessionSwitcher?: () => void;
  onCommandPalette?: () => void;
};

const TAB_ORDER: Tab[] = [
  "chat",
  "overview",
  "channels",
  "instances",
  "sessions",
  "usage",
  "cron",
  "agents",
  "skills",
  "nodes",
  "config",
  "debug",
  "logs",
];

export function setupKeyboardShortcuts(handler: KeyboardShortcutHandler): () => void {
  const handleKeyDown = async (event: KeyboardEvent) => {
    // Don't intercept if user is typing in an input/textarea
    const target = event.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    // Ctrl/Cmd + S: Save
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      await handler.onSave?.();
      return;
    }

    // Ctrl/Cmd + /: Toggle sidebar (only when not in input)
    if ((event.ctrlKey || event.metaKey) && event.key === "/" && !isInput) {
      event.preventDefault();
      handler.onToggleSidebar?.();
      return;
    }

    // Ctrl/Cmd + 1-9: Switch tabs (only when not in input)
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !isInput) {
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= 9 && TAB_ORDER[num - 1]) {
        event.preventDefault();
        handler.onSwitchTab?.(num - 1);
        return;
      }
    }

    // Esc: Close modals/cancel (always available)
    if (event.key === "Escape") {
      handler.onEscape?.();
      return;
    }

    // Alt + S: Quick session switcher (future feature)
    if (event.altKey && event.key === "s" && !isInput) {
      event.preventDefault();
      handler.onQuickSessionSwitcher?.();
      return;
    }

    // Ctrl/Cmd + K: Command palette (future feature)
    if ((event.ctrlKey || event.metaKey) && event.key === "k" && !isInput) {
      event.preventDefault();
      handler.onCommandPalette?.();
      return;
    }
  };

  document.addEventListener("keydown", handleKeyDown);

  // Return cleanup function
  return () => {
    document.removeEventListener("keydown", handleKeyDown);
  };
}

/**
 * Get keyboard shortcut hint text for display in tooltips
 */
export function getShortcutHint(action: string): string {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  const shortcuts: Record<string, string> = {
    save: `${mod}+S`,
    toggleSidebar: `${mod}+/`,
    tab1: `${mod}+1`,
    tab2: `${mod}+2`,
    tab3: `${mod}+3`,
    tab4: `${mod}+4`,
    tab5: `${mod}+5`,
    tab6: `${mod}+6`,
    tab7: `${mod}+7`,
    tab8: `${mod}+8`,
    tab9: `${mod}+9`,
    escape: "Esc",
    quickSessions: "Alt+S",
    commandPalette: `${mod}+K`,
  };

  return shortcuts[action] || "";
}

/**
 * Get tab name for a given index
 */
export function getTabForIndex(index: number): Tab | null {
  return TAB_ORDER[index] || null;
}
