import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchDueDateHistory } from '@/lib/invoiceDueDateService';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { History, Calendar, User, Phone, ArrowRight, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function DueDateHistoryDrawer({
  isOpen,
  onClose,
  invoice,
  installment = null
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && invoice?.id) {
      setLoading(true);
      fetchDueDateHistory(invoice.id, installment?.id).then(res => {
        setHistory(res);
        setLoading(false);
      });
    }
  }, [isOpen, invoice, installment]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <History className="w-5 h-5 text-primary" /> Due Date & Reschedule History
          </DialogTitle>
          {invoice && (
            <p className="text-xs text-muted-foreground">
              Invoice #{invoice.invoice_number} • {invoice.customer_name || invoice.vendor_name}
              {installment && ` • Installment #${installment.installment_no}`}
            </p>
          )}
        </DialogHeader>

        <div className="mt-3 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading audit history...</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
              <Calendar className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="font-medium text-foreground">No Due Date Revisions Recorded</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Original contractual due date remains unchanged.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {history.map((entry, idx) => (
                <div key={entry.id || idx} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />

                  <div className="bg-card rounded-xl border border-border p-3.5 shadow-xs space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {entry.reschedule_scope === 'CASCADING_SCHEDULE'
                          ? 'Cascading Schedule Shift'
                          : entry.installment_no !== null && entry.installment_no !== undefined
                          ? `Installment #${entry.installment_no} Extension`
                          : 'Invoice Due Date Revision'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${entry.days_extended > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-700'}`}>
                        {entry.days_extended > 0 ? `+${entry.days_extended} Days` : `${entry.days_extended} Days`}
                      </span>
                    </div>

                    {/* Date Transition */}
                    <div className="flex items-center gap-2 font-mono bg-muted/40 p-2 rounded-lg">
                      <div className="flex-1">
                        <span className="text-[10px] text-muted-foreground block">Previous</span>
                        <DualDateDisplay date={entry.previous_due_date} />
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <span className="text-[10px] text-muted-foreground block">Rescheduled</span>
                        <DualDateDisplay date={entry.new_due_date} />
                      </div>
                    </div>

                    {/* Reason and notes */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-foreground">
                        Category: <span className="text-muted-foreground">{entry.reason_code}</span>
                      </div>
                      <p className="text-foreground/90 bg-muted/20 p-2 rounded-lg italic">
                        "{entry.reason_notes}"
                      </p>
                    </div>

                    {/* Contact & Actor Metadata */}
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>By {entry.changed_by_name || 'Staff'}</span>
                      </div>
                      {entry.contact_person && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>Contact: {entry.contact_person} ({entry.contact_channel || 'Direct'})</span>
                        </div>
                      )}
                      <span>{format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
