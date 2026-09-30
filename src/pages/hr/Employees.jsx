import { useState, useEffect, useCallback } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { useForm, FormProvider, Controller, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, UserCircle, Upload, X, FileText, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import DateInput from '@/components/shared/DateInput';

// Zod Schemas
const PersonalSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  date_of_birth: z.string().nullish(),
  gender: z.string().nullish(),
  blood_group: z.string().nullish(),
  marital_status: z.string().nullish(),
  citizenship_number: z.string().nullish(),
  pan_number: z.string().nullish(),
  father_name: z.string().nullish(),
  mother_name: z.string().nullish(),
  grandfather_name: z.string().nullish(),
  spouse_name: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().nullish(),
  same_address: z.boolean().nullish(),
  permanent_address: z.object({ province: z.string().nullish(), district: z.string().nullish(), municipality: z.string().nullish(), ward: z.string().nullish(), tole: z.string().nullish() }).nullish(),
  temporary_address: z.object({ province: z.string().nullish(), district: z.string().nullish(), municipality: z.string().nullish(), ward: z.string().nullish(), tole: z.string().nullish() }).nullish(),
  emergency_contact: z.object({ name: z.string().nullish(), relation: z.string().nullish(), phone: z.string().nullish() }).nullish(),
});

const EmploymentSchema = z.object({
  department: z.string().nullish(),
  designation: z.string().nullish(),
  employment_type: z.enum(['Full Time', 'Part Time', 'Contract', 'Intern']).nullish(),
  employment_status: z.enum(['Candidate', 'Probation', 'Permanent', 'Notice Period', 'Retired', 'Terminated']).nullish(),
  joining_date: z.string().nullish(),
  exit_date: z.string().nullish(),
  work_location: z.string().nullish(),
});

const PayrollSchema = z.object({
  bank_name: z.string().nullish(),
  bank_branch: z.string().nullish(),
  bank_account_number: z.string().nullish(),
  bank_account_holder: z.string().nullish(),
  pf_number: z.string().nullish(),
  salary_components: z.any().nullish(),
  salary_effective_from: z.string().nullish(),
  salary_change_reason: z.string().nullish(),
});

export default function Employees() {
  const { activeCompany } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('All');
  
  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState('personal');

  const fetchEmployees = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('Employee')
        .select('*')
        .eq('company_id', activeCompany.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleOpenNew = () => {
    setCurrentEmployee(null);
    setActiveTab('personal');
    setSheetOpen(true);
  };

  const handleOpenEdit = (emp) => {
    setCurrentEmployee(emp);
    setActiveTab('personal');
    setSheetOpen(true);
  };

  const filteredEmployees = employees.filter(e => {
    if (filter === 'All') return true;
    if (filter === 'Active') return ['Probation', 'Permanent', 'Notice Period'].includes(e.employment_status);
    if (filter === 'Inactive') return ['Retired', 'Terminated'].includes(e.employment_status);
    return true;
  });

  const columns = [
    { label: 'Employee Code', key: 'employee_code' },
    { 
      label: 'Employee Name', 
      key: 'full_name',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <UserCircle className="w-8 h-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{row.full_name}</p>
            <p className="text-xs text-muted-foreground">{row.designation}</p>
          </div>
        </div>
      ) 
    },
    { label: 'Department', key: 'department' },
    { label: 'Status', key: 'employment_status', render: (val, row) => <StatusBadge status={row.employment_status} /> },
    { label: 'Joined', key: 'joining_date' },
    { 
      label: 'Actions', 
      key: 'actions',
      render: (val, row) => (
        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row)}>
          Edit
        </Button>
      ) 
    }
  ];

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      <PageHeader 
        title="Employees" 
        subtitle="Comprehensive employee management and KYC."
        action={handleOpenNew}
        actionLabel="Add Employee"
        actionIcon={Plus}
      />

      <div className="flex gap-2 mb-2">
        {['All', 'Active', 'Inactive'].map(f => (
          <Button 
            key={f} 
            variant={filter === f ? 'default' : 'outline'} 
            size="sm" 
            className="rounded-full"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      <div className="flex-1 min-h-0 bg-card rounded-xl border">
        <DataTable columns={columns} data={filteredEmployees} searchKey="full_name" loading={loading} />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="max-w-3xl w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>{currentEmployee ? 'Edit Employee' : 'New Employee'}</SheetTitle>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="personal" style={{ backgroundColor: activeTab==='personal' ? '' : '#FDFBF7' }}>Personal & KYC</TabsTrigger>
                <TabsTrigger value="employment" style={{ backgroundColor: activeTab==='employment' ? '' : '#FDFBF7' }} disabled={!currentEmployee}>Employment</TabsTrigger>
                <TabsTrigger value="payroll" style={{ backgroundColor: activeTab==='payroll' ? '' : '#FDFBF7' }} disabled={!currentEmployee}>Payroll & Bank</TabsTrigger>
                <TabsTrigger value="documents" style={{ backgroundColor: activeTab==='documents' ? '' : '#FDFBF7' }} disabled={!currentEmployee}>Documents</TabsTrigger>
              </TabsList>
              
              <TabsContent value="personal" className="mt-0">
                <PersonalTab currentEmployee={currentEmployee} setCurrentEmployee={setCurrentEmployee} activeCompany={activeCompany} fetchEmployees={fetchEmployees} />
              </TabsContent>
              <TabsContent value="employment" className="mt-0">
                <EmploymentTab currentEmployee={currentEmployee} setCurrentEmployee={setCurrentEmployee} activeCompany={activeCompany} fetchEmployees={fetchEmployees} />
              </TabsContent>
              <TabsContent value="payroll" className="mt-0">
                <PayrollTab currentEmployee={currentEmployee} setCurrentEmployee={setCurrentEmployee} activeCompany={activeCompany} fetchEmployees={fetchEmployees} />
              </TabsContent>
              <TabsContent value="documents" className="mt-0">
                <DocumentsTab currentEmployee={currentEmployee} activeCompany={activeCompany} />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// -- TAB 1 --
function PersonalTab({ currentEmployee, setCurrentEmployee, activeCompany, fetchEmployees }) {
  const methods = useForm({
    resolver: zodResolver(PersonalSchema),
    defaultValues: {
      full_name: '', email: '', phone: '',
      permanent_address: {}, temporary_address: {}, emergency_contact: {}
    }
  });

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = methods;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentEmployee) {
      // Fetch profile
      sajilo.auth.supabase.from('EmployeeProfile').select('*').eq('employee_id', currentEmployee.id).single().then(({data}) => {
        reset({
          full_name: currentEmployee.full_name,
          email: currentEmployee.email,
          phone: currentEmployee.phone,
          date_of_birth: currentEmployee.date_of_birth,
          ...(data || {})
        });
      });
    } else {
      reset({ full_name: '', email: '', phone: '', permanent_address: {}, temporary_address: {}, emergency_contact: {} });
    }
  }, [currentEmployee, reset]);

  const sameAddress = watch('same_address');
  const permAddr = watch('permanent_address');
  useEffect(() => {
    if (sameAddress) {
      setValue('temporary_address', permAddr);
    }
  }, [sameAddress, permAddr, setValue]);

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      let empId = currentEmployee?.id;
      
      if (!empId) {
        // Create employee
        const { data: nextCode } = await sajilo.auth.supabase.rpc('rpc_next_company_code', { p_company_id: activeCompany.id, p_counter_type: 'EMP' });
        const code = `EMP-${(nextCode || 1).toString().padStart(4, '0')}`;
        const { data: newEmp, error } = await sajilo.auth.supabase.from('Employee').insert({
          company_id: activeCompany.id,
          employee_code: code,
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          date_of_birth: data.date_of_birth || null,
        }).select().single();
        if (error) throw error;
        empId = newEmp.id;
        setCurrentEmployee(newEmp);
      } else {
        // Update employee basic
        await sajilo.auth.supabase.from('Employee').update({
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          date_of_birth: data.date_of_birth || null,
        }).eq('id', empId);
        setCurrentEmployee(prev => ({
          ...prev,
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          date_of_birth: data.date_of_birth || null,
        }));
      }

      // Upsert profile
      const { error: profileErr } = await sajilo.auth.supabase.from('EmployeeProfile').upsert({
        company_id: activeCompany.id,
        employee_id: empId,
        gender: data.gender,
        blood_group: data.blood_group,
        marital_status: data.marital_status,
        citizenship_number: data.citizenship_number,
        pan_number: data.pan_number,
        father_name: data.father_name,
        mother_name: data.mother_name,
        grandfather_name: data.grandfather_name,
        spouse_name: data.spouse_name,
        permanent_address: data.permanent_address,
        temporary_address: data.temporary_address,
        emergency_contact: data.emergency_contact,
      }, { onConflict: 'employee_id' });

      if (profileErr) throw profileErr;
      toast.success('Personal details saved');
      fetchEmployees();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Full Name *</Label>
            <Input {...register('full_name')} />
            {errors.full_name && <p className="text-red-500 text-xs">{errors.full_name.message}</p>}
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input {...register('phone')} />
          </div>
          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <Controller name="date_of_birth" render={({field}) => <DateInput value={field.value} onChange={field.onChange} />} />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Controller name="gender" render={({field}) => (
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-2">
            <Label>Blood Group</Label>
            <Controller name="blood_group" render={({field}) => (
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-semibold mb-4">Family Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Father Name</Label><Input {...register('father_name')} /></div>
            <div className="space-y-2"><Label>Mother Name</Label><Input {...register('mother_name')} /></div>
            <div className="space-y-2"><Label>Grandfather Name</Label><Input {...register('grandfather_name')} /></div>
            <div className="space-y-2"><Label>Spouse Name</Label><Input {...register('spouse_name')} /></div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-semibold mb-4">Identity & Addresses</h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2"><Label>Citizenship Number</Label><Input {...register('citizenship_number')} /></div>
            <div className="space-y-2"><Label>PAN Number</Label><Input {...register('pan_number')} /></div>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground mb-2 block">Permanent Address</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Province" {...register('permanent_address.province')} />
                <Input placeholder="District" {...register('permanent_address.district')} />
                <Input placeholder="Municipality" {...register('permanent_address.municipality')} />
                <Input placeholder="Ward" {...register('permanent_address.ward')} />
                <Input placeholder="Tole" {...register('permanent_address.tole')} className="col-span-2" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Controller name="same_address" render={({field}) => (
                <Checkbox id="same" checked={field.value} onCheckedChange={field.onChange} />
              )} />
              <label htmlFor="same" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Temporary address is same as permanent
              </label>
            </div>
            {!sameAddress && (
              <div>
                <Label className="text-muted-foreground mb-2 block">Temporary Address</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Province" {...register('temporary_address.province')} />
                  <Input placeholder="District" {...register('temporary_address.district')} />
                  <Input placeholder="Municipality" {...register('temporary_address.municipality')} />
                  <Input placeholder="Ward" {...register('temporary_address.ward')} />
                  <Input placeholder="Tole" {...register('temporary_address.tole')} className="col-span-2" />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="pt-4 border-t">
          <h4 className="font-semibold mb-4">Emergency Contact</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Name</Label><Input {...register('emergency_contact.name')} /></div>
            <div className="space-y-2"><Label>Relation</Label><Input {...register('emergency_contact.relation')} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input {...register('emergency_contact.phone')} /></div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Personal Details'}</Button>
        </div>
      </form>
    </FormProvider>
  );
}

// -- TAB 2 --
function EmploymentTab({ currentEmployee, setCurrentEmployee, activeCompany, fetchEmployees }) {
  const methods = useForm({
    resolver: zodResolver(EmploymentSchema),
  });
  const { register, handleSubmit, reset } = methods;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentEmployee) {
      reset({
        department: currentEmployee.department,
        designation: currentEmployee.designation,
        employment_type: currentEmployee.employment_type || 'Full Time',
        employment_status: currentEmployee.employment_status || 'Probation',
        joining_date: currentEmployee.joining_date,
        exit_date: currentEmployee.exit_date,
        work_location: currentEmployee.work_location,
      });
    }
  }, [currentEmployee, reset]);

  const onSubmit = async (data) => {
    if (!currentEmployee) return;
    setSaving(true);
    try {
      const { error } = await sajilo.auth.supabase.from('Employee').update(data).eq('id', currentEmployee.id);
      if (error) throw error;
      setCurrentEmployee(prev => ({ ...prev, ...data }));
      toast.success('Employment details saved');
      fetchEmployees();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusVal = methods.watch('employment_status');

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Department</Label><Input {...register('department')} /></div>
          <div className="space-y-2"><Label>Designation</Label><Input {...register('designation')} /></div>
          
          <div className="space-y-2">
            <Label>Employment Type</Label>
            <Controller name="employment_type" render={({field}) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {['Full Time', 'Part Time', 'Contract', 'Intern'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Controller name="employment_status" render={({field}) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {['Candidate', 'Probation', 'Permanent', 'Notice Period', 'Retired', 'Terminated'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>

          <div className="space-y-2">
            <Label>Joining Date</Label>
            <Controller name="joining_date" render={({field}) => <DateInput value={field.value} onChange={field.onChange} />} />
          </div>

          {['Terminated', 'Retired'].includes(statusVal) && (
            <div className="space-y-2">
              <Label>Exit Date</Label>
              <Controller name="exit_date" render={({field}) => <DateInput value={field.value} onChange={field.onChange} />} />
            </div>
          )}

          <div className="space-y-2"><Label>Work Location</Label><Input {...register('work_location')} /></div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Employment Details'}</Button>
        </div>
      </form>
    </FormProvider>
  );
}

// -- TAB 3 --
function PayrollTab({ currentEmployee, setCurrentEmployee, activeCompany, fetchEmployees }) {
  const methods = useForm({
    resolver: zodResolver(PayrollSchema),
  });
  const { register, handleSubmit, reset } = methods;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentEmployee) {
      reset({
        bank_name: currentEmployee.bank_name,
        bank_branch: currentEmployee.bank_branch,
        bank_account_number: currentEmployee.bank_account_number,
        bank_account_holder: currentEmployee.bank_account_holder,
        pf_number: currentEmployee.pf_number,
      });
    }
  }, [currentEmployee, reset]);

  const onSubmit = async (data) => {
    if (!currentEmployee) return;
    setSaving(true);
    try {
      // 1. Update bank details
      const { error } = await sajilo.auth.supabase.from('Employee').update({
        bank_name: data.bank_name,
        bank_branch: data.bank_branch,
        bank_account_number: data.bank_account_number,
        bank_account_holder: data.bank_account_holder,
        pf_number: data.pf_number,
      }).eq('id', currentEmployee.id);
      if (error) throw error;
      setCurrentEmployee(prev => ({
        ...prev,
        bank_name: data.bank_name,
        bank_branch: data.bank_branch,
        bank_account_number: data.bank_account_number,
        bank_account_holder: data.bank_account_holder,
        pf_number: data.pf_number,
      }));

      // 2. If salary effective from is provided, call RPC
      if (data.salary_effective_from) {
        const { error: rpcErr } = await sajilo.auth.supabase.rpc('rpc_update_salary', {
          p_employee_id: currentEmployee.id,
          p_components: data.salary_components || { earnings: [], deductions: [] },
          p_effective_from: data.salary_effective_from,
          p_change_reason: data.salary_change_reason || 'Update'
        });
        if (rpcErr) throw rpcErr;
      }
      
      toast.success('Payroll & Bank details saved');
      fetchEmployees();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <h4 className="font-semibold">Bank Information</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Bank Name</Label><Input {...register('bank_name')} /></div>
          <div className="space-y-2"><Label>Branch</Label><Input {...register('bank_branch')} /></div>
          <div className="space-y-2"><Label>Account Number</Label><Input {...register('bank_account_number')} /></div>
          <div className="space-y-2"><Label>Account Holder</Label><Input {...register('bank_account_holder')} /></div>
          <div className="space-y-2"><Label>PF Number</Label><Input {...register('pf_number')} /></div>
        </div>

        <div className="pt-4 border-t space-y-4">
          <h4 className="font-semibold">Salary Revision</h4>
          <p className="text-sm text-muted-foreground">To update salary, provide an effective date. Historical records are preserved.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Effective From Date</Label>
              <Controller name="salary_effective_from" render={({field}) => <DateInput value={field.value} onChange={field.onChange} />} />
            </div>
            <div className="space-y-2">
              <Label>Change Reason</Label>
              <Input {...register('salary_change_reason')} placeholder="e.g. Annual Increment" />
            </div>
          </div>
          {/* Note: In a full app, a dynamic form for salary_components (earnings/deductions) would render here */}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Payroll Details'}</Button>
        </div>
      </form>
    </FormProvider>
  );
}

// -- TAB 4 --
function DocumentsTab({ currentEmployee, activeCompany }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('Citizenship Front');
  const [file, setFile] = useState(null);

  const fetchDocs = useCallback(async () => {
    if (!currentEmployee) return;
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('EmployeeDocument')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [currentEmployee]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${docType.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
      const path = `${activeCompany.id}/${currentEmployee.id}/${fileName}`;
      
      const { error: uploadErr } = await sajilo.auth.supabase.storage
        .from('employee_kyc')
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await sajilo.auth.supabase.from('EmployeeDocument').insert({
        company_id: activeCompany.id,
        employee_id: currentEmployee.id,
        document_type: docType,
        file_name: file.name,
        file_url: path,
        file_size_kb: Math.round(file.size / 1024),
        uploaded_by: 'Current User' // in real app, fetch from auth
      });
      if (dbErr) throw dbErr;

      toast.success('Document uploaded successfully');
      setFile(null);
      fetchDocs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc) => {
    try {
      const { data, error } = await sajilo.auth.supabase.storage
        .from('employee_kyc')
        .createSignedUrl(doc.file_url, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      toast.error('Could not open document: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/40 backdrop-blur-md border-2 border-dashed border-primary/30 rounded-xl p-8 text-center space-y-4">
        <Upload className="w-8 h-8 text-primary mx-auto" />
        <h4 className="font-medium text-lg">Upload Document</h4>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-end max-w-lg mx-auto">
          <div className="space-y-2 flex-1 text-left">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="Citizenship Front">Citizenship Front</SelectItem>
                <SelectItem value="Citizenship Back">Citizenship Back</SelectItem>
                <SelectItem value="Passport">Passport</SelectItem>
                <SelectItem value="Certificate">Certificate</SelectItem>
                <SelectItem value="Contract">Contract</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-1 text-left">
            <Label>Select File</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files[0])} />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No documents uploaded yet.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 font-medium border-b">Type</th>
                <th className="px-4 py-2 font-medium border-b">File Name</th>
                <th className="px-4 py-2 font-medium border-b">Date</th>
                <th className="px-4 py-2 font-medium border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3"><span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">{doc.document_type}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate max-w-[200px]" title={doc.file_name}>{doc.file_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleView(doc)}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}