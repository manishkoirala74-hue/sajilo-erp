import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Printer } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const FONT_MAP = { inter: 'Inter, sans-serif', georgia: 'Georgia, serif', mono: 'monospace' };

export default function QuotationPrint({ quotation: q, settings: s = {}, onClose }) {
  const printRef = useRef();
  const [showSpecs, setShowSpecs] = useState(true);
  const [showModel, setShowModel] = useState(true);

  const accent = s.quotation_accent_color || '#6366f1';
  const font = FONT_MAP[s.quotation_font] || FONT_MAP.inter;
  const template = s.quotation_template || 'modern';
  const showItemCodes = s.quotation_show_item_codes !== false;
  const showUnitPrice = s.quotation_show_unit_price !== false;
  const showVat = s.quotation_show_vat !== false;

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quotation — ${q.quotation_number}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: ${font}; background: #fff; color: #1a1a2e; font-size: 13px; padding: 32px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 12px; }
          thead th { background: ${accent}; color: #fff; font-weight: 600; font-size: 12px; text-align: left; }
          tbody tr:nth-child(even) { background: #f9f9f9; }
          tbody tr td { border-bottom: 1px solid #eee; }
          .label { font-size: 11px; color: #888; }
          @media print {
            body { padding: 0; }
            button { display: none !important; }
            @page { margin: 20mm; }
          }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 400);
  };

  const totalQty = (q.line_items || []).reduce((s, l) => s + (l.quantity || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl mx-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-border gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-base">Print Preview — {q.quotation_number}</h2>
            {q._isViewMode && (
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
                View Mode
              </span>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={showModel} onCheckedChange={setShowModel} /> Show Model
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={showSpecs} onCheckedChange={setShowSpecs} /> Show Specs
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="w-4 h-4" /> Print
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="p-6">
          <div ref={printRef} style={{ fontFamily: font }} className="bg-card text-[#1a1a2e] text-[13px] leading-relaxed">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
              <div>
                {s.company_logo_url && s.quotation_show_logo !== false && (
                  <img src={s.company_logo_url} alt="Logo" style={{ height: 52, objectFit: 'contain', marginBottom: 8 }} />
                )}
                <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{s.company_name || 'Company Name'}</div>
                {s.quotation_salutation && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{s.quotation_salutation}</div>
                )}
                <div style={{ marginTop: 6, fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                  {s.address && <div>{s.address}</div>}
                  {s.phone && <div>Tel: {s.phone}</div>}
                  {s.email && <div>{s.email}</div>}
                  {s.tax_id && <div>VAT/PAN: {s.tax_id}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: accent, letterSpacing: -0.5 }}>QUOTATION</div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
                  <div><span style={{ color: '#888' }}>No.: </span><strong>{q.quotation_number}</strong></div>
                  <div><span style={{ color: '#888' }}>Date: </span>{q.quotation_date}</div>
                  <div><span style={{ color: '#888' }}>Valid Until: </span>{q.valid_until || '—'}</div>
                </div>
                <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: accent + '22', color: accent, border: `1px solid ${accent}` }}>
                  {q.status}
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 28 }}>
              <div style={{ flex: 1, background: '#f8f8ff', borderRadius: 10, padding: '14px 16px', borderLeft: `4px solid ${accent}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Quoted To</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{q.customer_name}</div>
                {q.customer_email && <div style={{ color: '#555', fontSize: 12 }}>{q.customer_email}</div>}
                {q.customer_phone && <div style={{ color: '#555', fontSize: 12 }}>{q.customer_phone}</div>}
                {q.customer_address && <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>{q.customer_address}</div>}
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: accent }}>
                  <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'left' }}>#</th>
                  {showItemCodes && <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'left' }}>Code</th>}
                  <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'left' }}>Item / Description</th>
                  <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'center' }}>Qty</th>
                  {showUnitPrice && <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'right' }}>Unit Price</th>}
                  <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'center' }}>Disc%</th>
                  {showVat && <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'center' }}>VAT</th>}
                  <th style={{ padding: '9px 12px', color: '#fff', fontWeight: 600, fontSize: 12, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(q.line_items || []).map((l, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fb', borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#888' }}>{i + 1}</td>
                    {showItemCodes && <td style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', color: '#666' }}>{l.item_code || '—'}</td>}
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{l.item_name}</div>
                      {(() => {
                        if (!l.description) return null;
                        let desc = l.description;
                        if (!showModel) desc = desc.replace(/\n?Model:.*(\n|$)/g, '\n').trim();
                        if (!showSpecs) desc = desc.replace(/\n?Specs:.*(\n|$)/g, '\n').trim();
                        if (!desc) return null;
                        return (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2, whiteSpace: 'pre-wrap' }}>{desc}</div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'center' }}>{l.quantity}</td>
                    {showUnitPrice && <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right' }}>NPR {Number(l.unit_price || 0).toLocaleString()}</td>}
                    <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'center', color: '#666' }}>{l.discount_percent ? `${l.discount_percent}%` : '—'}</td>
                    {showVat && <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'center' }}>{l.vat_applicable ? '✓' : '—'}</td>}
                    <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>NPR {Number(l.line_total || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <div style={{ minWidth: 260 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #eee' }}>
                  <span style={{ color: '#888' }}>Subtotal</span>
                  <span>NPR {Number(q.goods_subtotal || 0).toLocaleString()}</span>
                </div>
                {q.discount_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #eee', color: '#d44' }}>
                    <span>Discount</span>
                    <span>- NPR {Number(q.discount_amount || 0).toLocaleString()}</span>
                  </div>
                )}
                {showVat && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #eee' }}>
                    <span style={{ color: '#888' }}>VAT ({s.vat_rate || 13}%)</span>
                    <span>NPR {Number(q.total_tax_amount || 0).toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: 15, fontWeight: 700, borderTop: `2px solid ${accent}`, color: accent }}>
                  <span>Grand Total</span>
                  <span>NPR {Number(q.grand_total || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {q.notes && (
              <div style={{ background: '#f8f8ff', borderRadius: 8, padding: '12px 16px', marginBottom: 16, borderLeft: `4px solid ${accent}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Notes</div>
                <div style={{ fontSize: 12, color: '#444', whiteSpace: 'pre-line' }}>{q.notes}</div>
              </div>
            )}

            {/* T&C */}
            {q.terms_and_conditions && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Terms & Conditions</div>
                <div style={{ fontSize: 12, color: '#444', whiteSpace: 'pre-line' }}>{q.terms_and_conditions}</div>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 32, borderTop: '1px solid #eee', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa' }}>
              <span>{s.company_name} — This is a computer-generated quotation.</span>
              <span>Page 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}