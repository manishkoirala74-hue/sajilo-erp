import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generatePDF } from '../../utils/pdf-engine/generator';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

// Sample mock data for live preview
const MOCK_PREVIEW_DATA = {
  company: {
    name: 'Sajilo ERP Demo',
    address: '123 Tech Park, Innovation City',
    email: 'billing@sajilo.com',
    phone: '+1 234 567 8900',
    tax_number: 'VAT-123456789',
    logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXYzh8+PB/AAffA0nCJ8WfAAAAAElFTkSuQmCC'
  },
  customer: {
    name: 'Acme Corp',
    address: '456 Business Blvd, Enterprise Sector',
    email: 'accounts@acmecorp.com'
  },
  date: 'Oct 15, 2026',
  reference_number: 'INV-2026-001',
  line_items: [
    { item_name: 'Consulting Services', description: 'System architecture review', quantity: 10, rate: 150.00, tax_amount: 150.00, total_amount: 1650.00 },
    { item_name: 'Software License', description: 'Annual subscription', quantity: 1, rate: 500.00, tax_amount: 50.00, total_amount: 550.00 }
  ],
  subtotal: 2000.00,
  tax_total: 200.00,
  total: 2200.00
};

export default function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeCompany } = useAuth();
  
  const [meta, setMeta] = useState({
    name: 'New Template',
    document_type: 'Sales Invoice',
    is_default: false
  });

  const [config, setConfig] = useState({
    primaryColor: '#3b82f6',
    textColor: '#333333',
    fontFamily: 'helvetica',
    fontSizeHeading: 24,
    fontSizeAddress: 10,
    fontSizeBody: 10,
    logoSize: 30,
    showTaxColumn: true,
    showLogo: true,
    showCompanyAddress: true,
    showVatNumber: true,
    headerText: 'INVOICE',
    footerText: 'Thank you for your business!',
    termsConditions: '',
    paymentInformation: ''
  });

  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(id !== 'new');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id !== 'new' && activeCompany?.id) {
      sajilo.entities.DocumentTemplate.get(id).then(data => {
        if (data) {
          setMeta({ name: data.name, document_type: data.document_type, is_default: data.is_default });
          if (data.layout_config) {
            setConfig(prev => ({ ...prev, ...data.layout_config }));
          }
        }
        setLoading(false);
      }).catch(err => {
        toast.error('Failed to load template');
        setLoading(false);
      });
    }
  }, [id, activeCompany?.id]);

  const handlePreview = async (currentConfig = config) => {
    try {
      const previewData = { ...MOCK_PREVIEW_DATA };
      
      // Inject real company data if available
      if (activeCompany) {
        previewData.company = {
          name: activeCompany.name || previewData.company.name,
          address: activeCompany.address || previewData.company.address,
          email: activeCompany.email || previewData.company.email,
          phone: activeCompany.phone || previewData.company.phone,
          tax_number: activeCompany.tax_number || previewData.company.tax_number,
          logo_url: activeCompany.logo_url || previewData.company.logo_url
        };
      }

      const blob = await generatePDF(previewData, currentConfig);
      const url = URL.createObjectURL(blob);
      setPdfUrl(oldUrl => {
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        return url;
      });
    } catch (err) {
      console.error("Failed to generate PDF preview", err);
    }
  };

  // Generate initial preview on mount and when loading finishes
  useEffect(() => {
    if (!loading) {
      handlePreview(config);
    }
  }, [loading]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMetaChange = (e) => {
    const { name, value, type, checked } = e.target;
    setMeta(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    if (!activeCompany?.id) return;
    if (!meta.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setSaving(true);
    const payload = {
      company_id: activeCompany.id,
      name: meta.name,
      document_type: meta.document_type,
      is_default: meta.is_default,
      layout_config: config
    };

    try {
      if (meta.is_default) {
        // Find existing default and disable it
        const allTemplates = await sajilo.entities.DocumentTemplate.list();
        const existing = allTemplates.filter(t => t.document_type === meta.document_type && t.is_default && t.id !== id);
        for (const t of existing) {
          await sajilo.entities.DocumentTemplate.update(t.id, { is_default: false });
        }
      }

      if (id === 'new') {
        await sajilo.entities.DocumentTemplate.create(payload);
        toast.success('Template created successfully!');
      } else {
        await sajilo.entities.DocumentTemplate.update(id, payload);
        toast.success('Template updated successfully!');
      }
      navigate('/settings/templates');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-80 bg-white border-r flex flex-col h-full z-10 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.1)]">
        <div className="p-4 border-b bg-gray-50 flex flex-col gap-3 shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-lg text-gray-800">Builder</h2>
            <div className="flex gap-2">
              <button 
                onClick={() => handlePreview()} 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1.5 text-sm font-medium rounded-md shadow-sm transition"
              >
                Preview
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 text-sm font-medium rounded-md shadow-sm transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          <button onClick={() => navigate('/settings/templates')} className="text-sm text-gray-500 hover:text-gray-800 self-start">&larr; Back to Templates</button>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          
          {/* 1. Company Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs text-blue-600 uppercase tracking-wider">1. Company Information</h3>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Company Logo</label>
              <input type="checkbox" name="showLogo" checked={config.showLogo} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Company Name</label>
              <input type="checkbox" name="showCompanyName" checked={config.showCompanyName !== false} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            {config.showLogo && (
              <div className="mb-3 pl-4 border-l-2 border-gray-200">
                <label className="block text-sm font-medium mb-1 text-gray-600">Logo Size (width in mm)</label>
                <input type="number" name="logoSize" value={config.logoSize} onChange={handleChange} className="w-full border rounded p-1.5 text-sm" />
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Company Address</label>
              <input type="checkbox" name="showCompanyAddress" checked={config.showCompanyAddress} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show TAX/VAT Number</label>
              <input type="checkbox" name="showVatNumber" checked={config.showVatNumber} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="h-px bg-gray-200" />

          {/* 2. Customer Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs text-blue-600 uppercase tracking-wider">2. Customer Information</h3>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Customer Address</label>
              <input type="checkbox" name="showCustomerAddress" checked={config.showCustomerAddress} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Customer TAX/VAT Number</label>
              <input type="checkbox" name="showCustomerVatNumber" checked={config.showCustomerVatNumber} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Customer Contact Number</label>
              <input type="checkbox" name="showCustomerContact" checked={config.showCustomerContact} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="h-px bg-gray-200" />

          {/* 3. Invoice Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs text-blue-600 uppercase tracking-wider">3. Invoice Settings</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Template Name</label>
              <input type="text" name="name" value={meta.name} onChange={handleMetaChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="e.g. Elegant Invoice" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
              <select name="document_type" value={meta.document_type} onChange={handleMetaChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                <option value="Sales Invoice">Sales Invoice</option>
                <option value="Purchase Order">Purchase Order</option>
                <option value="Sales Order">Sales Order</option>
                <option value="Quotation">Quotation</option>
                <option value="Financial Voucher">Financial Voucher</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1 mb-2">
              <input type="checkbox" id="is_default" name="is_default" checked={meta.is_default} onChange={handleMetaChange} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <label htmlFor="is_default" className="text-sm font-medium text-gray-700 cursor-pointer">Set as Default Template</label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Document Title (Header)</label>
              <input type="text" name="headerText" value={config.headerText} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
          </div>
          <div className="h-px bg-gray-200" />

          {/* 4. Colors & Theme */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs text-blue-600 uppercase tracking-wider">4. Colors & Theme</h3>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" name="primaryColor" value={config.primaryColor} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer" />
                <span className="text-sm text-gray-600">{config.primaryColor}</span>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Text Color</label>
              <div className="flex items-center gap-2">
                <input type="color" name="textColor" value={config.textColor} onChange={handleChange} className="w-8 h-8 rounded cursor-pointer" />
                <span className="text-sm text-gray-600">{config.textColor}</span>
              </div>
            </div>
          </div>
          <div className="h-px bg-gray-200" />

          {/* 5. Font Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs text-blue-600 uppercase tracking-wider">5. Font Settings</h3>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Font Family</label>
              <select name="fontFamily" value={config.fontFamily} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                <option value="helvetica">Helvetica</option>
                <option value="times">Times New Roman</option>
                <option value="courier">Courier</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Company Name Font Size</label>
              <input type="number" name="fontSizeCompanyName" value={config.fontSizeCompanyName || 14} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Heading Font Size</label>
              <input type="number" name="fontSizeHeading" value={config.fontSizeHeading} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Address Font Size</label>
              <input type="number" name="fontSizeAddress" value={config.fontSizeAddress} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Body Text Font Size</label>
              <input type="number" name="fontSizeBody" value={config.fontSizeBody} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
          </div>
          <div className="h-px bg-gray-200" />

          {/* 6. Custom Field Settings */}
          <div className="space-y-4 pb-10">
            <h3 className="font-semibold text-xs text-blue-600 uppercase tracking-wider">6. Custom Field Settings</h3>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Due Date</label>
              <input type="checkbox" name="showDueDate" checked={config.showDueDate} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Show Line Item Tax Column</label>
              <input type="checkbox" name="showTaxColumn" checked={config.showTaxColumn} onChange={handleChange} className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Terms & Conditions</label>
              <textarea name="termsConditions" value={config.termsConditions || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm h-16" placeholder="e.g. Net 30 days" />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Payment Information</label>
              <textarea name="paymentInformation" value={config.paymentInformation || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm h-16" placeholder="e.g. Bank details" />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Footer Notes</label>
              <textarea name="footerText" value={config.footerText} onChange={handleChange} className="w-full border rounded p-2 text-sm h-16" />
            </div>
          </div>

        </div>
      </div>

      {/* Right Panel: Live PDF Preview */}
      <div className="flex-1 bg-gray-500 p-8 flex justify-center overflow-auto">
        {pdfUrl ? (
          <div className="w-full max-w-4xl h-full flex flex-col items-center">
            <div className="w-full mb-2 flex justify-end">
              <button 
                onClick={() => handlePreview()} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-md shadow-md transition"
              >
                ↻ Refresh Preview
              </button>
            </div>
            <iframe 
              src={pdfUrl} 
              className="w-full flex-1 shadow-2xl bg-white rounded-lg border-none"
              title="PDF Preview"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            Click 'Preview' to generate PDF
          </div>
        )}
      </div>
    </div>
  );
}
