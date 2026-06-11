import { X, Landmark, Banknote, FileText, ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const categoryStyle = {
  Current: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  Savings: 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400',
  Overdraft: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
  'Fixed Deposit': 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  'Cash in Hand': 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

function formatNPR(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

function isImage(url) {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}

function getFileName(url) {
  try { return decodeURIComponent(url.split('/').pop().split('?')[0]); } catch { return 'Document'; }
}

export default function BankAccountDetailDrawer({ account, onClose, onEdit }) {
  if (!account) return null;
  const isBank = account.account_type === 'Bank';
  const docs = account.document_urls || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-card w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', isBank ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-emerald-100 dark:bg-emerald-500/20')}>
              {isBank ? <Landmark className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" /> : <Banknote className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{account.account_name}</p>
              <p className="text-xs text-muted-foreground">{account.account_type} Account</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Balance Card */}
          <div className="bg-muted/30 rounded-xl p-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Opening Balance</p>
              <p className="text-base font-bold text-foreground">NPR {formatNPR(account.opening_balance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Current Balance</p>
              <p className="text-base font-bold text-primary">NPR {formatNPR(account.current_balance)}</p>
            </div>
          </div>

          {/* Status + Category */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', account.is_active !== false ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
              {account.is_active !== false ? 'Active' : 'Inactive'}
            </span>
            {account.account_category && (
              <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', categoryStyle[account.account_category] || 'bg-muted text-muted-foreground')}>
                {account.account_category}
              </span>
            )}
          </div>

          {/* Account Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Account Details</p>
            <div className="bg-card border border-border rounded-xl px-4">
              <InfoRow label="Ledger Group" value={account.ledger_group_name} />
              <InfoRow label="GL Account" value={account.gl_account_name} />
              <InfoRow label="Signature Holder" value={account.account_holder_name} />
              {isBank && <InfoRow label="Branch" value={account.branch_name} />}
              {isBank && <InfoRow label="Account Number" value={account.account_number} />}
              {isBank && <InfoRow label="Currency" value={account.currency} />}
              {isBank && <InfoRow label="IFSC / Routing" value={account.ifsc_code} />}
              {isBank && <InfoRow label="SWIFT Code" value={account.swift_code} />}
              {isBank && <InfoRow label="Contact Person" value={account.contact_person} />}
              {isBank && <InfoRow label="Contact Phone" value={account.contact_phone} />}
              {account.notes && <InfoRow label="Notes" value={account.notes} />}
            </div>
          </div>

          {/* Attachments */}
          {docs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Attachments ({docs.length})
              </p>
              <div className="space-y-2">
                {docs.map((url, i) => (
                  isImage(url) ? (
                    <div key={i} className="rounded-xl overflow-hidden border border-border">
                      <img src={url} alt={getFileName(url)} className="w-full object-cover max-h-48" />
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                        <span className="text-xs text-muted-foreground truncate">{getFileName(url)}</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/30 hover:bg-muted/50 rounded-xl transition-colors">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs text-foreground truncate flex-1">{getFileName(url)}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </a>
                  )
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}