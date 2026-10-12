import { create } from 'zustand';
import { shortcutManager } from '@/lib/shortcutManager';

interface ModalState {
  activeModal: string | null;
  modalProps: any;
  modalHistory: Array<{ modalId: string; props: any }>;
  openModal: (modalId: string, props?: any) => void;
  closeModal: () => void;
  goBack: () => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  activeModal: null,
  modalProps: {},
  modalHistory: [],

  openModal: (modalId, props = {}) => {
    // Push modal scope to shortcutManager to block global hotkeys from leaking
    shortcutManager.pushScope({
      id: modalId,
      scope: 'MODAL',
      handlers: new Map(),
      blockGlobalShortcuts: true
    });

    set((state) => {
      // If there's already an active modal, push it to history
      const newHistory = state.activeModal
        ? [...state.modalHistory, { modalId: state.activeModal, props: state.modalProps }]
        : [];

      return {
        activeModal: modalId,
        modalProps: props,
        modalHistory: newHistory,
      };
    });
  },

  closeModal: () => {
    const current = get().activeModal;
    if (current) {
      shortcutManager.popScope(current);
    }
    set({
      activeModal: null,
      modalProps: {},
      modalHistory: [],
    });
  },

  goBack: () => set((state) => {
    if (state.activeModal) {
      shortcutManager.popScope(state.activeModal);
    }
    const history = [...state.modalHistory];
    if (history.length > 0) {
      const previous = history.pop();
      if (previous?.modalId) {
        shortcutManager.pushScope({
          id: previous.modalId,
          scope: 'MODAL',
          handlers: new Map(),
          blockGlobalShortcuts: true
        });
      }
      return {
        activeModal: previous?.modalId || null,
        modalProps: previous?.props || {},
        modalHistory: history,
      };
    }
    return {
      activeModal: null,
      modalProps: {},
      modalHistory: [],
    };
  }),
}));
