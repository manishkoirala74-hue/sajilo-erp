/**
 * Bulk action toolbar for Fixed Assets list.
 * Shows when 1+ rows are selected.
 */
import { Button } from '@/components/ui/button';
import { CheckCircle2, PauseCircle, Trash2, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function AssetBulkToolbar({ selectedIds, onBulkStatus, onBulkDelete, onClearSelection }) {
  const count = selectedIds.length;
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl mb-3">
      <span className="text-sm font-semibold text-primary">{count} asset{count > 1 ? 's' : ''} selected</span>
      <div className="flex gap-2 ml-auto">
        <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          onClick={() => onBulkStatus('Active')}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Set Active
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
          onClick={() => onBulkStatus('In Repair')}>
          <PauseCircle className="w-3.5 h-3.5" /> Set In Repair
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-slate-600 border-slate-300 hover:bg-slate-50"
          onClick={() => onBulkStatus('Disposed')}>
          Set Disposed
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" /> Delete ({count})
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Soft-Delete {count} Asset{count > 1 ? 's' : ''}?</AlertDialogTitle>
              <AlertDialogDescription>
                Assets will be marked as <strong>Deleted</strong> (not permanently removed). A full snapshot is saved to the Audit Log. This action can be reviewed but not reversed from the UI.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onBulkDelete}>
                Confirm Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button size="sm" variant="ghost" onClick={onClearSelection}><X className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}