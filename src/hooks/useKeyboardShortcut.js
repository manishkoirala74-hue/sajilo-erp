import { useEffect } from 'react';

/**
 * useKeyboardShortcut
 * A reusable hook to handle keyboard shortcuts within a specific context.
 * 
 * @param {Object} options
 * @param {string} options.key - The key to listen for (e.g., 'Enter', 'n', 's')
 * @param {boolean} [options.ctrl] - Require Ctrl/Cmd key?
 * @param {boolean} [options.alt] - Require Alt key?
 * @param {boolean} [options.shift] - Require Shift key?
 * @param {Function} options.action - The callback to trigger
 * @param {boolean} [options.disabled] - If true, the shortcut is ignored
 */
export function useKeyboardShortcut({
  key,
  ctrl = false,
  alt = false,
  shift = false,
  action,
  disabled = false
}) {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e) => {
      // Check modifiers
      const ctrlKey = e.ctrlKey || e.metaKey; // Command on Mac
      const altKey = e.altKey;
      const shiftKey = e.shiftKey;

      // Ensure key matches, ignoring case if it's a letter
      const keyMatches = e.key.toLowerCase() === key.toLowerCase() || e.key === key;

      if (
        keyMatches &&
        ctrl === ctrlKey &&
        alt === altKey &&
        shift === shiftKey
      ) {
        e.preventDefault();
        action(e);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [key, ctrl, alt, shift, action, disabled]);
}
