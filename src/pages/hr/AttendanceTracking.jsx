import { useState, useEffect, useCallback, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import PageHeader from '@/components/shared/PageHeader';

export default function AttendanceTracking() {
  const { activeCompany } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [localChanges, setLocalChanges] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const fetchEmployees = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('Employee')
        .select('id, full_name, employee_code')
        .eq('company_id', activeCompany.id)
        .in('employment_status', ['Probation', 'Permanent', 'Notice Period'])
        .order('full_name');
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      toast.error('Failed to load employees: ' + error.message);
    }
  }, [activeCompany?.id]);

  const fetchAttendance = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const { data, error } = await sajilo.auth.supabase
        .from('AttendanceRecord')
        .select('*')
        .eq('company_id', activeCompany.id)
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);

      if (error) throw error;
      setAttendanceRecords(data || []);
      setLocalChanges({});
    } catch (error) {
      toast.error('Failed to load attendance: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, year, month]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const attendanceMap = useMemo(() => {
    const map = {};
    attendanceRecords.forEach(record => {
      const key = `${record.employee_id}_${record.attendance_date}`;
      map[key] = record;
    });
    return map;
  }, [attendanceRecords]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Present': return 'bg-emerald-100 text-emerald-700';
      case 'Absent': return 'bg-red-100 text-red-700';
      case 'Approved Leave': return 'bg-blue-100 text-blue-700';
      case 'Half Day': return 'bg-yellow-100 text-yellow-700';
      case 'Holiday': return 'bg-gray-100 text-gray-600';
      case 'Unpaid Leave': return 'bg-orange-100 text-orange-700';
      default: return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getStatusAbbr = (status) => {
    switch (status) {
      case 'Present': return 'P';
      case 'Absent': return 'A';
      case 'Approved Leave': return 'L';
      case 'Half Day': return 'HD';
      case 'Holiday': return 'H';
      case 'Unpaid Leave': return 'UL';
      default: return '-';
    }
  };

  const handleStatusChange = (employeeId, day, newStatus) => {
    const dateStr = new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];
    const key = `${employeeId}_${dateStr}`;
    setLocalChanges(prev => ({
      ...prev,
      [key]: { employee_id: employeeId, attendance_date: dateStr, status: newStatus }
    }));
  };

  const getCellStatus = (employeeId, day) => {
    const dateStr = new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];
    const key = `${employeeId}_${dateStr}`;
    if (localChanges[key]) return localChanges[key].status;
    if (attendanceMap[key]) return attendanceMap[key].status;
    return null;
  };

  const saveChanges = async () => {
    const changesArray = Object.values(localChanges);
    if (changesArray.length === 0) return;

    setSaving(true);
    try {
      const payload = changesArray.map(change => ({
        company_id: activeCompany.id,
        employee_id: change.employee_id,
        attendance_date: change.attendance_date,
        status: change.status,
      }));

      const { error } = await sajilo.auth.supabase
        .from('AttendanceRecord')
        .upsert(payload, { onConflict: 'employee_id,attendance_date' });

      if (error) throw error;
      toast.success('Attendance updated successfully');
      fetchAttendance();
    } catch (error) {
      toast.error('Failed to save attendance: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      <PageHeader 
        title="Attendance Tracking" 
        subtitle="Manage daily attendance records"
        action={saveChanges}
        actionLabel={saving ? 'Saving...' : 'Save Changes'}
        actionIcon={Save}
        actionDisabled={saving || Object.keys(localChanges).length === 0}
      />

      <div className="flex items-center justify-between bg-card p-4 rounded-lg border">
        <Button variant="outline" size="sm" onClick={handlePrevMonth}>
          <ChevronLeft className="w-4 h-4 mr-2" /> Previous
        </Button>
        <div className="font-medium text-lg">
          {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </div>
        <Button variant="outline" size="sm" onClick={handleNextMonth}>
          Next <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <div className="bg-card rounded-lg border flex-1 min-h-0 relative">
        <div 
          className="absolute inset-0 overflow-auto"
          tabIndex={0} 
          role="region" 
          aria-label="Attendance Grid"
        >
          <table className="w-full text-sm text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground shadow-sm">
              <tr>
                <th className="sticky left-0 z-30 bg-muted px-4 py-3 font-medium min-w-[200px] border-b border-r shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                  Employee Name
                </th>
                {daysArray.map(day => (
                  <th key={day} className="px-2 py-3 font-medium text-center border-b border-r min-w-[40px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={daysInMonth + 1} className="p-8 text-center text-muted-foreground">
                    Loading attendance data...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 1} className="p-8 text-center text-muted-foreground">
                    No active employees found.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="border-b hover:bg-muted/30">
                    <td className="sticky left-0 z-20 bg-background px-4 py-2 font-medium border-r shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                      <div className="truncate">{emp.full_name}</div>
                      <div className="text-xs text-muted-foreground">{emp.employee_code}</div>
                    </td>
                    {daysArray.map(day => {
                      const status = getCellStatus(emp.id, day);
                      return (
                        <td key={day} className="px-1 py-1 text-center border-r">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button 
                                className={`w-full h-8 rounded text-xs font-semibold ${getStatusColor(status)} hover:opacity-80 transition-opacity`}
                                title={status || 'Not marked'}
                              >
                                {getStatusAbbr(status)}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="center">
                              <div className="flex flex-col gap-1">
                                {['Present', 'Absent', 'Half Day', 'Unpaid Leave', 'Holiday'].map(s => (
                                  <Button 
                                    key={s} 
                                    variant="ghost" 
                                    size="sm" 
                                    className="justify-start"
                                    onClick={() => handleStatusChange(emp.id, day, s)}
                                  >
                                    <div className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(s).split(' ')[0]}`} />
                                    {s}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
