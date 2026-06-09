import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Building, Edit, Trash2, Upload, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { seedDefaultChartOfAccounts } from '@/lib/defaultCoaSeeder';
import EditCompanyDetails from './EditCompanyDetails';

export default function CompanyManagement() {
  const { checkUserAuth, user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [userCompanies, setUserCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '', tax_id: '', email: '', phone: '', address: '', website: '', logo_url: ''
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const data = await sajilo.entities.Company.list();
      setCompanies(data);
      if (user) {
        const ucs = await sajilo.entities.UserCompany.filter({ user_id: user.id });
        setUserCompanies(ucs);
      }
    } catch (e) {
      toast.error('Failed to load companies');
    }
    setLoading(false);
  };

  const handleSetDefault = async (companyId) => {
    try {
      const ucs = await sajilo.entities.UserCompany.filter({ user_id: user.id });
      for (const uc of ucs) {
        if (uc.is_default) {
          await sajilo.entities.UserCompany.update(uc.id, { is_default: false });
        }
      }
      const targetUc = ucs.find(uc => uc.company_id === companyId);
      if (targetUc) {
        await sajilo.entities.UserCompany.update(targetUc.id, { is_default: true });
      } else {
        await sajilo.entities.UserCompany.create({ user_id: user.id, company_id: companyId, is_default: true });
      }
      sajilo.setCompanyId(null);
      await checkUserAuth();
      toast.success("Default company updated");
      fetchCompanies();
    } catch (e) {
      toast.error("Failed to set default company");
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, logo_url: reader.result });
        toast.success("Logo uploaded successfully");
        setIsUploadingLogo(false);
        e.target.value = '';
      };
      reader.onerror = () => {
        toast.error("Failed to read image file");
        setIsUploadingLogo(false);
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("Failed to process logo");
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error("Company name is required");
      return;
    }
    
    if (formData.tax_id) {
      const isDuplicate = companies.some(c => c.tax_id === formData.tax_id);
      if (isDuplicate) {
        toast.error("A company with this Tax ID / VAT already exists.");
        return;
      }
    }

    setIsCreating(true);
    try {
      const newCompany = await sajilo.entities.Company.create(formData);
      
      const previousCompanyId = sajilo.getCompanyId();
      sajilo.setCompanyId(newCompany.id);
      try {
        await seedDefaultChartOfAccounts();
        if (formData.logo_url) {
          await sajilo.entities.CompanySettings.create({ company_logo_url: formData.logo_url });
        }
      } catch (err) {
        console.error("Failed to seed COA or settings", err);
      } finally {
        sajilo.setCompanyId(previousCompanyId);
      }

      await checkUserAuth();
      toast.success("Company created and default Chart of Accounts loaded");
      setShowForm(false);
      setFormData({ name: '', tax_id: '', email: '', phone: '', address: '', website: '', logo_url: '' });
      fetchCompanies();
    } catch (e) {
      toast.error('Failed to create company');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) return <div className="text-center py-10">Loading companies...</div>;

  if (editingCompanyId) {
    return <EditCompanyDetails companyId={editingCompanyId} onBack={() => { setEditingCompanyId(null); fetchCompanies(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building className="w-5 h-5 text-primary" /> Manage Companies
        </h2>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          {showForm ? 'Cancel' : <><Plus className="w-4 h-4 mr-1" /> New Company</>}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-muted/30 p-5 rounded-lg border border-border space-y-4">
          <h3 className="font-medium text-sm">Create New Company</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name *</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Tax ID / VAT</Label>
              <Input value={formData.tax_id} onChange={e => setFormData({...formData, tax_id: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} className="mt-1" placeholder="https://" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="mt-1" />
            </div>
            <div className="col-span-2 border border-border p-4 rounded-lg bg-white mt-2">
              <Label className="mb-2 block">Company Logo</Label>
              <div className="flex items-center gap-4">
                {formData.logo_url ? (
                  <div className="relative w-16 h-16 border rounded bg-muted flex items-center justify-center">
                    <img src={formData.logo_url} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                    <button type="button" onClick={() => setFormData({...formData, logo_url: ''})} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 border border-dashed rounded bg-muted/50 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-6 h-6 opacity-50" />
                  </div>
                )}
                <div>
                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleLogoUpload} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploadingLogo}>
                    {isUploadingLogo ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                    {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">Recommended size: 500x500px or smaller.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Please wait while your company profile is being created...' : 'Save Company'}
            </Button>
          </div>
        </form>
      )}

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 font-medium">Company Name</th>
              <th className="px-4 py-3 font-medium">Tax ID</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => {
              const isDefault = userCompanies.find(uc => uc.company_id === c.id)?.is_default;
              return (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">
                  {c.name}
                  {isDefault && <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Default</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.tax_id || '-'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div>{c.email}</div>
                  <div className="text-xs">{c.phone}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {!isDefault && (
                    <Button variant="outline" size="sm" onClick={() => handleSetDefault(c.id)} className="mr-2">
                      Set Default
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEditingCompanyId(c.id)}>
                    <Edit className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                </td>
              </tr>
            )})}
            {companies.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No companies found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
