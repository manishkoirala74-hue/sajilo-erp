import React, { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Edit2, Layers, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import StockAssemblyForm from './StockAssemblyForm';

export default function StockAssemblyList() {
  const [assemblies, setAssemblies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchAssemblies();
  }, []);

  const fetchAssemblies = async () => {
    setLoading(true);
    try {
      const data = await sajilo.entities.StockAssembly.list('assembly_date', false); // order by date desc
      setAssemblies(data);
    } catch (error) {
      toast.error('Failed to fetch stock assemblies');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => { setEditingId(null); setShowForm(true); };
  
  const openEdit = (id) => { 
    setEditingId(id); 
    setShowForm(true); 
  };

  const handleSaved = () => {
    setShowForm(false);
    fetchAssemblies();
  };

  const columns = [
    {
      key: 'assembly_no', label: 'Assembly No',
      render: (val) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="font-medium text-sm">{val}</span>
        </div>
      )
    },
    { 
      key: 'assembly_date', label: 'Date',
      render: v => v ? format(new Date(v), 'MMM dd, yyyy') : '—'
    },
    { 
      key: 'total_cost', label: 'Total Cost',
      render: v => <span className="font-medium">{(v || 0).toLocaleString()}</span>
    },
    { 
      key: 'status', label: 'Status',
      render: v => (
        <span className={`text-xs px-2 py-1 rounded-full border ${
          v === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
          : v === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400'
          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
        }`}>
          {v}
        </span>
      )
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <Button variant="ghost" size="icon" onClick={() => openEdit(row.id)}>
          <Edit2 className="w-4 h-4 text-slate-500" />
        </Button>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Stock Assembly"
        subtitle="Ad-Hoc Conversions & Production Builds"
        action={openNew}
        actionLabel="New Assembly"
        actionIcon={Plus}
      />
      
      <DataTable columns={columns} data={assemblies} searchKey="assembly_no" loading={loading} />

      {showForm && (
        <StockAssemblyForm 
          assemblyId={editingId} 
          onClose={() => setShowForm(false)} 
          onSaved={handleSaved} 
        />
      )}
    </div>
  );
}
