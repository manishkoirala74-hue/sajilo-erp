import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { generatePDF } from '@/utils/pdf-engine/generator';

const TemplatePreviewThumbnail = ({ config }) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const generate = async () => {
      try {
        const previewData = {
          company: { name: 'Sajilo ERP' },
          customer: { name: 'Customer' },
          date: new Date().toLocaleDateString(),
          reference_number: 'DEMO-001',
          line_items: [{ item_name: 'Demo Item', quantity: 1, rate: 100, total_amount: 100 }],
          subtotal: 100,
          total: 100
        };
        const blob = await generatePDF(previewData, config || {});
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch (e) {
        console.error("Preview thumbnail generation failed", e);
      }
    };
    generate();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [config]);

  return url ? (
    <div className="w-full h-full overflow-hidden relative bg-white">
      <iframe 
        src={`${url}#toolbar=0&navpanes=0&scrollbar=0`} 
        className="absolute top-0 left-0 w-[200%] h-[200%] origin-top-left scale-50 border-none pointer-events-none" 
        title="preview"
      />
    </div>
  ) : (
    <span className="text-gray-400 text-sm">Loading Preview...</span>
  );
};

export default function PDFTemplatesList() {
  const { activeCompany } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const data = await sajilo.entities.DocumentTemplate.list();
      setTemplates(data || []);
    } catch (e) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [activeCompany?.id]);

  const handleSetDefault = async (template) => {
    try {
      // Unset default for the same document_type
      const existingDefaults = templates.filter(t => t.document_type === template.document_type && t.is_default);
      for (const t of existingDefaults) {
        await sajilo.entities.DocumentTemplate.update(t.id, { is_default: false });
      }
      // Set new default
      await sajilo.entities.DocumentTemplate.update(template.id, { is_default: true });
      toast.success(`${template.document_type} default updated`);
      fetchTemplates();
    } catch (e) {
      toast.error('Failed to update default template');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">PDF Templates</h1>
          <p className="text-gray-500">Manage and design your document templates</p>
        </div>
        <Link 
          to="/settings/templates/builder/new" 
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
        >
          + New Template
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 rounded-lg border border-dashed">
          <p className="text-gray-500 mb-4">No custom templates created yet.</p>
          <Link to="/settings/templates/builder/new" className="text-blue-600 hover:underline">
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(template => (
            <div key={template.id} className="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition">
              <div className="h-40 bg-gray-100 rounded mb-4 flex items-center justify-center border border-gray-200 overflow-hidden">
                <TemplatePreviewThumbnail config={template.layout_config} />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <span className="text-sm text-gray-500 capitalize">{template.document_type}</span>
                </div>
                {template.is_default && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Default</span>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Link 
                  to={`/settings/templates/builder/${template.id}`}
                  className="flex-1 text-center bg-gray-50 hover:bg-gray-100 border text-gray-700 py-1.5 rounded text-sm"
                >
                  Edit
                </Link>
                <button 
                  onClick={() => handleSetDefault(template)}
                  disabled={template.is_default}
                  className={`flex-1 text-center py-1.5 rounded text-sm border ${template.is_default ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
                >
                  Set Default
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
