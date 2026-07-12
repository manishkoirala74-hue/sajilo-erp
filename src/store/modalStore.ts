import { create } from 'zustand';

interface ModalState {
  activeModal: string | null;
  modalProps: any;
  modalHistory: Array<{ modalId: string; props: any }>;
  openModal: (modalId: string, props?: any) => void;
  closeModal: () => void;
  goBack: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  activeModal: null,
  modalProps: {},
  modalHistory: [],

  openModal: (modalId, props = {}) => set((state) => {
    // If there's already an active modal, push it to history
    const newHistory = state.activeModal
      ? [...state.modalHistory, { modalId: state.activeModal, props: state.modalProps }]
      : [];

    return {
      activeModal: modalId,
      modalProps: props,
      modalHistory: newHistory,
    };
  }),

  closeModal: () => set({
    activeModal: null,
    modalProps: {},
    modalHistory: [],
  }),

  goBack: () => set((state) => {
    const history = [...state.modalHistory];
    if (history.length > 0) {
      const previous = history.pop();
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
