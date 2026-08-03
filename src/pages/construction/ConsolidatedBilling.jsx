import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { CheckCircle, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DateInput from '@/components/shared/DateInput';

export default function ConsolidatedBilling() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [unbilledLines, setUnbilledLines] = useState([]);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    invoice_number: `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
    notes: 'Consolidated Construction Billing'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const projData = await sajilo.entities.ConstructionProject.filter({ status: 'Active' });
      setProjects(projData);
    } catch (err) {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadUnbilledMaterials = async (selectedProjId) => {
    setProjectId(selectedProjId);
    if (!selectedProjId) {
      setUnbilledLines([]);
      return;
    }
    try {
      // 1. Fetch unbilled challans
      const challans = await sajilo.entities.DeliveryChallan.filter({ project_id: selectedProjId, billing_status: 'Unbilled' });
      if (challans.length === 0) {
        toast.info('No unbilled materials found for this project');
        setUnbilledLines([]);
        return;
      }
      
      const challanIds = challans.map(c => c.id);
      
      // 2. Fetch all lines for these challans
      // Note: A real app might use an RPC or IN clause, we will simulate by fetching all lines and filtering locally
      // Assuming DeliveryChallanLine has challan_id
      const allLines = await sajilo.entities.DeliveryChallanLine.list(); // Or .filter if the API supports it
      const myLines = allLines.filter(l => challanIds.includes(l.challan_id));
      
      // 3. Fetch items to get names
      const itemIds = [...new Set(myLines.map(l => l.item_id))];
      const items = await sajilo.entities.Item.list();
      
      // Group lines by item_id
      const grouped = {};
      myLines.forEach(l => {
        if (!grouped[l.item_id]) {
          const item = items.find(i => i.id === l.item_id);
          grouped[l.item_id] = {
            item_id: l.item_id,
            item_name: item ? item.item_name : 'Unknown',
            total_qty: 0,
            unit_price: 0, // User will input this
            subtotal: 0
          };
        }
        grouped[l.item_id].total_qty += parseFloat(l.quantity);
      });
      
      setUnbilledLines(Object.values(grouped));
      toast.success(`Found ${challans.length} unbilled challans`);
    } catch (err) {
      toast.error('Error fetching unbilled materials');
    }
  };

  const handlePriceChange = (idx, price) => {
    const lines = [...unbilledLines];
    const p = parseFloat(price) || 0;
    lines[idx].unit_price = p;
    lines[idx].subtotal = p * lines[idx].total_qty;
    setUnbilledLines(lines);
  };

  const generateInvoice = async () => {
    if (unbilledLines.length === 0) return toast.error('No lines to bill');
    for (const line of unbilledLines) {
      if (line.unit_price <= 0) return toast.error(`Please enter a valid Selling Price for ${line.item_name}`);
    }

    setSaving(true);
    try {
      const user = sajilo.auth.user();
      const project = projects.find(p => p.id === projectId);
      
      const goods_subtotal = unbilledLines.reduce((acc, l) => acc + l.subtotal, 0);
      
      const payload = {
        company_id: user?.user_metadata?.company_id,
        customer_id: project.customer_id,
        invoice_date: invoiceForm.invoice_date,
        due_date: invoiceForm.due_date,
        invoice_number: invoiceForm.invoice_number,
        goods_subtotal: goods_subtotal,
        sundry_charges_total: 0,
        total_tax_amount: 0,
        grand_total: goods_subtotal,
        notes: invoiceForm.notes,
        line_items: unbilledLines.map(l => ({
          item_id: l.item_id,
          quantity: l.total_qty,
          unit_price: l.unit_price,
          subtotal: l.subtotal
        }))
      };

      await sajilo.rpc('rpc_consolidate_challans_to_invoice', { 
        p_project_id: projectId, 
        p_payload: payload 
      });

      toast.success('Sales Invoice generated successfully!');
      setProjectId('');
      setUnbilledLines([]);
    } catch (err) {
      toast.error(err.message || 'Error generating invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader 
        title="Consolidated Billing" 
        subtitle="Convert unbilled project materials into a Sales Invoice"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
        <div className="md:col-span-1 border rounded-md p-4 bg-card h-fit">
          <Label className="text-base font-semibold mb-4 block">1. Select Project</Label>
          <div className="space-y-4">
            <div>
              <Label>Active Projects</Label>
              <Select value={projectId} onValueChange={loadUnbilledMaterials}>
                <SelectTrigger><SelectValue placeholder="Choose project..." /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="md:col-span-3 border rounded-md p-4 bg-card">
          <Label className="text-base font-semibold mb-4 block">2. Review Materials & Assign Pricing</Label>
          
          {projectId && unbilledLines.length > 0 ? (
            <div className="space-y-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Material / Item</th>
                    <th className="text-right p-2">Total Delivered Qty</th>
                    <th className="text-right p-2 w-48">Selling Price (per unit)</th>
                    <th className="text-right p-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {unbilledLines.map((line, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{line.item_name}</td>
                      <td className="text-right p-2 font-medium">{line.total_qty}</td>
                      <td className="p-2">
                        <Input 
                          type="number" 
                          min="0" 
                          className="text-right" 
                          placeholder="e.g. 500"
                          value={line.unit_price || ''} 
                          onChange={e => handlePriceChange(i, e.target.value)} 
                        />
                      </td>
                      <td className="text-right p-2">NPR {line.subtotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <div>
                  <Label>Invoice Date</Label>
                  <DateInput value={invoiceForm.invoice_date} onChange={d => setInvoiceForm({...invoiceForm, invoice_date: d})} />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <DateInput value={invoiceForm.due_date} onChange={d => setInvoiceForm({...invoiceForm, due_date: d})} />
                </div>
              </div>

              <div className="flex justify-between items-center bg-muted/50 p-4 rounded-md">
                <div className="text-lg font-bold">
                  Grand Total: NPR {unbilledLines.reduce((s, l) => s + l.subtotal, 0).toLocaleString()}
                </div>
                <Button onClick={generateInvoice} disabled={saving}>
                  {saving ? 'Generating...' : (
                    <><FileText className="w-4 h-4 mr-2" /> Generate Sales Invoice</>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowRight className="w-8 h-8 mb-2 opacity-20" />
              <p>Select a project to load unbilled materials.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
