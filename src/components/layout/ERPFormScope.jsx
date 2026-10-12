import React, { createContext, useContext, useRef, useCallback } from 'react';

const FormNavigationContext = createContext({
  focusNext: () => {},
  focusPrevious: () => {},
});

/**
 * ERPFormScope — Centralized Form Keyboard Controller.
 * Converts regular forms into high-speed ERP entry surfaces:
 * - Enter advances focus to the next field in sequence.
 * - Shift+Enter moves focus backward.
 * - Textareas, active dropdowns, and buttons retain their native actions.
 */
export function ERPFormScope({
  children,
  enterAsTab = true,
  onSubmit,
  className = '',
  ...props
}) {
  const formRef = useRef(null);

  const getNavigableElements = useCallback(() => {
    if (!formRef.current) return [];
    return Array.from(formRef.current.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), ' +
      'select:not([disabled]):not([tabindex="-1"]), ' +
      'textarea:not([disabled]):not([tabindex="-1"]), ' +
      '[role="combobox"]:not([disabled]):not([tabindex="-1"]), ' +
      'button[type="submit"]:not([disabled])'
    ));
  }, []);

  const focusNext = useCallback((currentElement) => {
    const elements = getNavigableElements();
    const currentIndex = elements.indexOf(currentElement);
    if (currentIndex >= 0 && currentIndex < elements.length - 1) {
      const next = elements[currentIndex + 1];
      next.focus();
      if (typeof next.select === 'function' && next.type !== 'button') {
        next.select();
      }
    } else if (onSubmit) {
      onSubmit();
    }
  }, [getNavigableElements, onSubmit]);

  const focusPrevious = useCallback((currentElement) => {
    const elements = getNavigableElements();
    const currentIndex = elements.indexOf(currentElement);
    if (currentIndex > 0) {
      const prev = elements[currentIndex - 1];
      prev.focus();
      if (typeof prev.select === 'function' && prev.type !== 'button') {
        prev.select();
      }
    }
  }, [getNavigableElements]);

  const handleKeyDown = (e) => {
    if (!enterAsTab) return;

    // Preserve native Enter behavior inside multiline textareas or contenteditables
    if (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    // If an active dropdown/popover is currently open, let the dropdown handle Enter
    if (
      e.target.getAttribute('aria-expanded') === 'true' ||
      e.target.closest('[data-state="open"]') ||
      e.target.closest('[role="listbox"]')
    ) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        focusPrevious(e.target);
      } else {
        focusNext(e.target);
      }
    }
  };

  return (
    <FormNavigationContext.Provider value={{ focusNext, focusPrevious }}>
      <div 
        ref={formRef} 
        onKeyDown={handleKeyDown} 
        className={className} 
        {...props}
      >
        {children}
      </div>
    </FormNavigationContext.Provider>
  );
}

export const useFormNavigation = () => useContext(FormNavigationContext);
export default ERPFormScope;
