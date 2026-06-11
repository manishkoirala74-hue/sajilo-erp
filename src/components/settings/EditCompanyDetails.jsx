import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, Save, Trash2, AlertTriangle, ShieldAlert, Upload, Loader2, Image as ImageIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function EditCompanyDetails({ companyId, onBack }) {
  const { user, checkUserAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', tax_id: '', email: '', phone: '', address: '', website: '', logo_url: ''
  });
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetchCompanyDetails();
  }, [companyId]);

  const fetchCompanyDetails = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const companies = await sajilo.entities.Company.filter({ id: companyId });
      if (companies.length > 0) {
        setFormData({
          name: companies[0].name || '',
          tax_id: companies[0].tax_id || '',
          email: companies[0].email || '',
          phone: companies[0].phone || '',
          address: companies[0].address || '',
          website: companies[0].website || '',
          logo_url: companies[0].logo_url || ''
        });
      }
    } catch (e) {
      toast.error('Failed to load company details');
    }
    setLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      if (companyId) {
        await sajilo.entities.Company.update(companyId, formData);
        // Sync logo with CompanySettings for reports
        if (formData.logo_url) {
          const settings = await sajilo.entities.CompanySettings.filter({ company_id: companyId });
          if (settings.length > 0) {
            await sajilo.entities.CompanySettings.update(settings[0].id, { company_logo_url: formData.logo_url });
          }
        }
        toast.success("Company details updated successfully");
      }
    } catch (e) {
      toast.error("Failed to update company details");
    }
    setSaving(false);
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

  const handleDelete = async () => {
    setDeleteError('');
    if (!password) {
      setDeleteError('Please enter your password to confirm.');
      return;
    }
    setDeleting(true);
    try {
      // 1. Verify password
      await sajilo.auth.loginWithPassword(user.email, password);
      
      // 2. Call the RPC to wipe data
      await sajilo.wipeCompanyData(companyId);
      
      toast.success("Company data deleted successfully");
      setShowDeleteModal(false);
      
      // 3. Reset company ID and check auth to redirect or reload
      sajilo.setCompanyId(null);
      await checkUserAuth();
      window.location.href = '/settings';
      
    } catch (e) {
      console.error(e);
      if (e.message?.includes('Invalid login credentials')) {
        setDeleteError('Incorrect password. Deletion aborted.');
      } else {
        setDeleteError(e.message || 'An error occurred during deletion.');
      }
    }
    setDeleting(false);
  };

  if (loading) return <div className="text-center py-10">Loading company details...</div>;

  if (!companyId) return <div className="text-center py-10 text-muted-foreground">No active company selected.</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" /> Edit Company Information
        </h2>
        <Button onClick={onBack} variant="outline" size="sm">
          Back to List
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <form onSubmit={handleSave} className="p-5 space-y-4">
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
            <div className="col-span-2 border border-border p-4 rounded-lg bg-card mt-2">
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
          <div className="flex justify-start pt-2">
            <Button type="submit" disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl overflow-hidden mt-8">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-red-200 dark:border-red-500/20 bg-red-100 dark:bg-red-500/20/50 text-red-800 dark:text-red-300">
          <ShieldAlert className="w-4 h-4" />
          <h3 className="font-semibold text-sm">Danger Zone</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-red-800 dark:text-red-300 mb-4">
            Warning: Deleting a company will permanently remove the company record, all transactions, items, customers, vendors, and uploaded files. 
            <strong> This action cannot be undone.</strong>
          </p>
          <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Company Data
          </Button>
        </div>
      </div>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Confirm Complete Deletion
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground font-medium">
              You are about to completely and permanently delete <strong>{formData.name}</strong>.
              This includes the company itself, all transactions, partners, and custom ledgers.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300 rounded text-sm">
              Please enter your password to confirm you want to perform this high-risk action.
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Your Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteModal(false); setPassword(''); setDeleteError(''); }} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || !password}>
              {deleting ? 'Deleting...' : 'Verify & Delete Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
