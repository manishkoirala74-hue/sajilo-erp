import { useModalStore } from '@/store/modalStore';
import CommandPaletteModal from './CommandPaletteModal';
import QuickPartnerCreate from '../shared/QuickPartnerCreate';
import QuickItemCreate from '../shared/QuickItemCreate';
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
    case 'CREATE_CUSTOMER':
      return <QuickPartnerCreate type="customer" {...commonProps} canGoBack={canGoBack} onBack={goBack} />;
    case 'CREATE_SUPPLIER':
      return <QuickPartnerCreate type="vendor" {...commonProps} canGoBack={canGoBack} onBack={goBack} />;
    case 'CREATE_ITEM':
      return <QuickItemCreate {...commonProps} canGoBack={canGoBack} onBack={goBack} />;
    default:
      return null;
  }
}
