import { useModalStore } from '@/store/modalStore';
import CommandPaletteModal from './CommandPaletteModal';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';

// A helper wrapper if a modal component doesn't have its own Back button logic
// but most Radix UI Dialogs handle their own headers. We can pass goBack as a prop.
export default function ModalRegistry() {
  const { activeModal, modalProps, closeModal, goBack, modalHistory } = useModalStore();

  const handleOpenChange = (open) => {
    if (!open) closeModal();
  };

  const commonProps = {
    open: true,
    onOpenChange: handleOpenChange,
    ...modalProps
  };

  // Ensure Back button capability is passed down
  const canGoBack = modalHistory.length > 0;
  
  if (!activeModal) return null;

  switch (activeModal) {
    case 'COMMAND_PALETTE':
      return <CommandPaletteModal {...commonProps} />;
    default:
      return null;
  }
}
