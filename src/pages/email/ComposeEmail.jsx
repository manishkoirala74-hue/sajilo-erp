import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase, sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Send, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { generateVectorPDF } from '@/utils/pdfGenerator';
import { generatePDF } from '@/utils/pdf-engine/generator';

export default function ComposeEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, activeCompany } = useAuth();
  
  const moduleName = searchParams.get('module');
  const referenceId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(true);
  const [documentData, setDocumentData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [settings, setSettings] = useState(null);
  
  const [form, setForm] = useState({
    to: '',
    subject: '',
    body: ''
  });

  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [storagePath, setStoragePath] = useState(null);
  const [sending, setSending] = useState(false);

  const printRef = useRef(null);

  useEffect(() => {
    if (!moduleName || !referenceId) {
      toast.error("Invalid email compose parameters");
      navigate(-1);
      return;
    }
    fetchData();
  }, [moduleName, referenceId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const companyId = sajilo.getCompanyId();
        
      let currentSettings = null;
      if (companyId) {
        const { data: companySettings } = await supabase
          .from('CompanyCommunicationSetting')
          .select('*')
          .eq('company_id', companyId)
          .single();
        currentSettings = companySettings;
        setSettings(companySettings);
      }

      // Fetch module data
      let docData = null;
      let currentPartner = null;
      if (moduleName === 'SalesInvoice') {
        const { data } = await supabase.from('SalesInvoice').select('*').eq('id', referenceId).single();
        docData = data;
        if (data && data.customer_id) {
          const { data: partner } = await supabase.from('BusinessPartner').select('*').eq('id', data.customer_id).single();
          currentPartner = partner;
          setPartnerData(partner);
          setForm({
            to: partner?.email || '',
            subject: `Invoice ${data.invoice_number} from ${companyId ? 'us' : 'Sajilo ERP'}`,
            body: `<p>Dear ${partner?.contact_person || 'Customer'},</p><p>Please find attached the invoice <strong>${data.invoice_number}</strong>.</p><p>Thank you for your business!</p>`
          });
        }
      } else if (moduleName === 'PurchaseInvoice') {
        const { data } = await supabase.from('PurchaseInvoice').select('*').eq('id', referenceId).single();
        docData = data;
        if (data && data.supplier_id) {
          const { data: partner } = await supabase.from('BusinessPartner').select('*').eq('id', data.supplier_id).single();
          currentPartner = partner;
          setPartnerData(partner);
          setForm({
            to: partner?.email || '',
            subject: `Regarding Purchase ${data.purchase_number}`,
            body: `<p>Dear ${partner?.contact_person || 'Supplier'},</p><p>Please find attached our purchase document <strong>${data.purchase_number}</strong>.</p><p>Thank you!</p>`
          });
        }
      } else if (moduleName === 'FinancialVoucher') {
        const { data } = await supabase.from('FinancialVoucher').select('*').eq('id', referenceId).single();
        docData = data;
        setForm(prev => ({
            ...prev,
            subject: `Voucher ${data?.voucher_number}`,
            body: `<p>Please find attached the voucher <strong>${data?.voucher_number}</strong>.</p>`
        }));
      }

      setDocumentData(docData);

      if (companyId) {
        const fileName = `${docData.id}.pdf`;
        const sPath = `${companyId}/${moduleName}/${fileName}`;
        
        let blobToUpload = null;

        // For Sales Invoices, we use the advanced template engine
        if (moduleName === 'SalesInvoice') {
          console.log("Generating SalesInvoice PDF with advanced template engine...");
          try {
            // Fetch template
            const { data: templates } = await supabase.from('DocumentTemplate')
              .select('*').eq('document_type', 'Sales Invoice');
            const defaultTemplate = (templates || []).find(t => t.is_default) || (templates && templates[0]);
            const layoutConfig = defaultTemplate ? defaultTemplate.layout_config : {};

            const customerDetails = currentPartner ? {
              ...currentPartner,
              phone: currentPartner.phone || currentPartner.contact_number
            } : { name: docData.customer_name };

            const pdfData = {
              ...docData,
              date: docData.invoice_date,
              reference_number: docData.invoice_number,
              company: activeCompany || currentSettings || { name: 'Sajilo ERP' },
              customer: customerDetails,
              subtotal: docData.goods_subtotal,
              tax_total: docData.total_tax_amount,
              total: docData.grand_total,
            };

            blobToUpload = await generatePDF(pdfData, layoutConfig);
          } catch (err) {
            console.error("Advanced PDF engine failed", err);
          }
        }

        // Fallback or other modules use the legacy vector PDF
        if (!blobToUpload) {
          console.log("Generating legacy Vector PDF...");
          try {
            const result = await generateVectorPDF(docData, moduleName, currentSettings, currentPartner, companyId);
            blobToUpload = result.blob;
          } catch (genErr) {
            console.error("Failed to generate legacy PDF", genErr);
          }
        }

        if (blobToUpload) {
          setPdfBlobUrl(URL.createObjectURL(blobToUpload));
          setStoragePath(sPath);
          
          // Upload to storage to overwrite any stale cached version
          const { error: uploadError } = await supabase.storage
            .from('erp_documents')
            .upload(sPath, blobToUpload, {
              contentType: 'application/pdf',
              upsert: true 
            });
          if (uploadError) console.error("Failed to cache new PDF to storage", uploadError);
        }
      }

    } catch (e) {
      console.error(e);
      toast.error("Failed to load document data");
    } finally {
      setLoading(false);
      setGeneratingPdf(false); // No longer rendering, instant loading
    }
  };

  const handleSend = async () => {
    if (!form.to) {
      toast.error('Recipient email is required');
      return;
    }
    if (!storagePath) {
      toast.error('Document PDF not found in storage. Ensure you have saved it.');
      return;
    }

    setSending(true);
    try {
      const companyId = sajilo.getCompanyId();
      if (!companyId) throw new Error("Company context not found");

      // 2. Insert to CommunicationOutbox
      const payloadData = {
        voucher_no: documentData.invoice_number || documentData.purchase_number || documentData.voucher_number || '',
        partner_name: partnerData?.name || partnerData?.contact_person || '',
        subject: form.subject,
        body: form.body,
        storage_path: storagePath
      };

      const outboxEntry = {
        company_id: companyId,
        module: moduleName,
        reference_id: referenceId,
        partner_id: partnerData?.id || null,
        recipient_email: form.to,
        type: 'EMAIL',
        status: 'PENDING',
        payload: payloadData
      };

      const { error: insertError } = await supabase
        .from('CommunicationOutbox')
        .insert([outboxEntry]);

      if (insertError) throw insertError;

      toast.success('Email queued successfully!');
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error(`Failed to send: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compose Email</h1>
            <p className="text-muted-foreground">Review and send your document.</p>
          </div>
        </div>
        <Button 
          onClick={handleSend} 
          disabled={sending || !storagePath}
          className="gap-2"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'Sending...' : 'Send Email'}
        </Button>
      </div>

      <div className="flex gap-6 h-full min-h-0">
        {/* Left Pane: Email Form */}
        <div className="w-1/2 flex flex-col gap-4 bg-card border border-border rounded-xl p-5 shadow-sm overflow-y-auto">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">To</Label>
            <Input 
              value={form.to} 
              onChange={e => setForm({...form, to: e.target.value})} 
              placeholder="recipient@example.com"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Subject</Label>
            <Input 
              value={form.subject} 
              onChange={e => setForm({...form, subject: e.target.value})} 
              placeholder="Email subject..."
            />
          </div>
          <div className="flex flex-col flex-1 pb-10">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Message Body</Label>
            <div className="flex-1 min-h-[250px]">
              <ReactQuill 
                theme="snow" 
                value={form.body} 
                onChange={(val) => setForm({...form, body: val})} 
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                className="rounded-md border-input bg-background"
              />
            </div>
          </div>
        </div>

        {/* Right Pane: PDF Preview */}
        <div className="w-1/2 bg-muted/30 border border-border rounded-xl p-5 flex flex-col shadow-inner overflow-hidden">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block flex items-center gap-2">
            <FileText className="w-4 h-4" /> 
            Attachment Preview
            {generatingPdf && <span className="ml-2 text-primary flex items-center text-[10px]"><Loader2 className="w-3 h-3 animate-spin mr-1"/> Generating PDF...</span>}
          </Label>
          
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-border overflow-hidden relative">
            {generatingPdf ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-white/80 z-10">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                <p className="font-medium animate-pulse">Rendering Document...</p>
              </div>
            ) : pdfBlobUrl ? (
              <iframe src={pdfBlobUrl} className="w-full h-full border-0" title="PDF Preview" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <p>Failed to generate preview.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
