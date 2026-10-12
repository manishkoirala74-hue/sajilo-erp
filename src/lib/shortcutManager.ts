// src/lib/shortcutManager.ts
export type ShortcutScopeType = 'GLOBAL' | 'FORM_GRID' | 'MODAL';

export interface ScopeFrame {
  id: string;
  scope: ShortcutScopeType;
  handlers: Map<string, (e: KeyboardEvent) => void>;
  blockGlobalShortcuts?: boolean;
}

class ShortcutManager {
  private stack: ScopeFrame[] = [
    { id: 'root', scope: 'GLOBAL', handlers: new Map(), blockGlobalShortcuts: false }
  ];
  private isListening = false;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window !== 'undefined' && !this.isListening) {
      window.addEventListener('keydown', this.handleKeyDown.bind(this), { capture: true });
      this.isListening = true;
    }
  }

  public pushScope(frame: ScopeFrame) {
    // Avoid duplicate pushing of identical scope ID
    this.stack = this.stack.filter(s => s.id !== frame.id);
    this.stack.push(frame);
  }

  public popScope(id: string) {
    if (id === 'root') return; // Cannot pop root
    this.stack = this.stack.filter(s => s.id !== id);
  }

  public registerGlobalShortcut(keyCombo: string, handler: (e: KeyboardEvent) => void) {
    const root = this.stack[0];
    if (root) {
      root.handlers.set(keyCombo.toLowerCase(), handler);
    }
  }

  public unregisterGlobalShortcut(keyCombo: string) {
    const root = this.stack[0];
    if (root) {
      root.handlers.delete(keyCombo.toLowerCase());
    }
  }

  public getActiveScope(): ScopeFrame {
    return this.stack[this.stack.length - 1];
  }

  private serializeKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Let native IME composing pass through
    if (e.isComposing || e.keyCode === 229) return;

    const combo = this.serializeKey(e);
    const activeFrame = this.stack[this.stack.length - 1];

    // 1. Check topmost active scope first
    if (activeFrame && activeFrame.handlers.has(combo)) {
      e.preventDefault();
      e.stopPropagation();
      activeFrame.handlers.get(combo)!(e);
      return;
    }

    // 2. If topmost scope is a Modal or Form with blockGlobalShortcuts, prevent global bubbling
    if (activeFrame && activeFrame.blockGlobalShortcuts && activeFrame.scope !== 'GLOBAL') {
      // Allow Escape to propagate if handled
      if (combo === 'escape' && activeFrame.handlers.has('escape')) {
        e.preventDefault();
        e.stopPropagation();
        activeFrame.handlers.get('escape')!(e);
        return;
      }
      // Suppress Level 3 global shortcuts (e.g., Alt+J, Alt+I, Ctrl+K) while inside a modal
      if (combo.startsWith('ctrl+') || combo.startsWith('alt+')) {
        return;
      }
    }

    // 3. Fallback to Level 3 Global Frame (root)
    const rootFrame = this.stack[0];
    if (rootFrame && rootFrame.handlers.has(combo)) {
      // Don't trigger global shortcuts if focus is inside an active text input or textarea
      // unless it's a Ctrl/Cmd shortcut like Ctrl+K
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      
      // If it's an Alt+ shortcut inside an input, allow it to execute global quick create
      if (!isInput || combo.startsWith('ctrl+') || combo.startsWith('alt+')) {
        e.preventDefault();
        e.stopPropagation();
        rootFrame.handlers.get(combo)!(e);
      }
    }
  }
}

export const shortcutManager = new ShortcutManager();
