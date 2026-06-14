import React, { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Mail, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function CommunicationModal({ 
  open, 
  onOpenChange, 
  module, 
  referenceId, 
  partnerId, 
  companyId, 
  payload = {} 
}) {
  const [loading, setLoading] = useState(false);
  const [partner, setPartner] = useState(null);
  
  const [form, setForm] = useState({
    recipient_email: '',
    send_email: true
  });

  useEffect(() => {
    if (open && partnerId) {
      async function fetchPartner() {
        try {
          const { data } = await supabase
            .from('BusinessPartner')
            .select('email, contact_person')
            .eq('id', partnerId)
            .single();
          
          if (data) {
            setPartner(data);
            setForm(prev => ({
              ...prev,
              recipient_email: data.email || ''
            }));
          }
        } catch (e) {
          console.error("Failed to fetch partner info", e);
        }
      }
      fetchPartner();
    }
  }, [open, partnerId]);

  const handleSend = async () => {
    if (!form.send_email) {
      toast.error('Please enable email delivery');
      return;
    }
    if (!form.recipient_email) {
      toast.error('Recipient email is required');
      return;
    }

    setLoading(true);
    try {
      const payloadData = {
        ...payload,
        partner_name: payload.partner_name || partner?.contact_person || ''
      };

      const outboxEntry = {
        company_id: companyId,
        module,
        reference_id: referenceId,
        partner_id: partnerId,
        recipient_email: form.recipient_email,
        type: 'EMAIL',
        status: 'PENDING',
        payload: payloadData
      };

      const { error } = await supabase
        .from('CommunicationOutbox')
        .insert([outboxEntry]);

      if (error) throw error;

      toast.success('Email queued successfully');
      onOpenChange(false);
    } catch (e) {
      toast.error(`Failed to queue communication: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Document</DialogTitle>
          <DialogDescription>
            Transmit document via Email. The document will be generated as a PDF and queued securely in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          
          <div className="bg-muted/40 rounded-lg p-4 border border-border">
            <h4 className="text-sm font-semibold mb-2">Document Summary</h4>
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="text-muted-foreground text-left">Voucher No:</span>
              <span className="font-mono">{payload?.voucher_no || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground text-left">Net Amount:</span>
              <span className="font-mono text-right">{payload?.net_amount || '0.00'}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Switch 
                checked={form.send_email} 
                onCheckedChange={v => setForm({...form, send_email: v})} 
              />
              <div className="flex-1 space-y-1 mt-[-2px]">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Mail className="w-4 h-4 text-primary" /> Send via Email
                </div>
                {form.send_email && (
                  <div className="mt-2">
                    <Label className="text-xs">To Email Address</Label>
                    <Input 
                      className="mt-1"
                      placeholder="customer@domain.com" 
                      value={form.recipient_email}
                      onChange={e => setForm({...form, recipient_email: e.target.value})}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={loading}>
            <Send className="w-4 h-4 mr-2" />
            {loading ? 'Queueing...' : 'Queue Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
