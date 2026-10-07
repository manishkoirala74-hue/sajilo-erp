import { useState, useEffect, useCallback, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Save, Calendar, Table, Hand, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from '@/components/shared/PageHeader';
import { getMonthPeriod, getTodayBS, formatDualDateString } from '@/lib/nepaliDate';
import { calculateAttendanceStatus } from '@/lib/attendanceRules';
import AttendanceImportModal from '@/components/hr/AttendanceImportModal';

export default function AttendanceTracking() {
  const { activeCompany } = useAuth();
  const [calendarView, setCalendarView] = useState('BS');
  
  // Keep AD and BS states separate so toggling doesn't pass a BS year to AD engine
  const [bsYear, setBsYear] = useState(() => getTodayBS()?.year || new Date().getFullYear());
  const [bsMonth, setBsMonth] = useState(() => getTodayBS()?.month || 1);
  const [adYear, setAdYear] = useState(() => new Date().getFullYear());
  const [adMonth, setAdMonth] = useState(() => new Date().getMonth() + 1);

  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dailyRecords, setDailyRecords] = useState([]);
  
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [companySettings, setCompanySettings] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [localChanges, setLocalChanges] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeCompany?.id || !dailyDate) return;
    sajilo.auth.supabase
      .from('AttendanceRecord')
      .select('*')
      .eq('company_id', activeCompany.id)
      .eq('attendance_date', dailyDate)
      .then(({ data }) => setDailyRecords(data || []));
  }, [activeCompany?.id, dailyDate]);

  // Fetch Company Settings
  useEffect(() => {
    if (!activeCompany?.id) return;
    sajilo.auth.supabase
      .from('CompanySettings')
      .select('hr_attendance_calendar, hr_weekly_off')
      .eq('id', activeCompany.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setCompanySettings(data);
          setCalendarView(data.hr_attendance_calendar || 'BS');
        }
      });
  }, [activeCompany?.id]);

  const period = useMemo(() => {
    return getMonthPeriod(
      calendarView, 
      calendarView === 'BS' ? bsYear : adYear, 
      calendarView === 'BS' ? bsMonth : adMonth
    );
  }, [calendarView, bsYear, bsMonth, adYear, adMonth]);

  const fetchEmployees = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('Employee')
        .select('id, full_name, employee_code')
        .eq('company_id', activeCompany.id)
        // Removed employment_status filter to ensure all created employees show up
        .order('full_name');
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      toast.error('Failed to load employees: ' + error.message);
    }
  }, [activeCompany?.id]);

  const fetchAttendance = useCallback(async () => {
    if (!activeCompany?.id || !period) return;
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('AttendanceRecord')
        .select('*')
        .eq('company_id', activeCompany.id)
        .gte('attendance_date', period.startAD)
        .lte('attendance_date', period.endAD);

      if (error) throw error;
      setAttendanceRecords(data || []);
      setLocalChanges({});
    } catch (error) {
      toast.error('Failed to load attendance: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, period]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const handlePrevMonth = () => {
    if (calendarView === 'BS') {
      if (bsMonth === 1) { setBsMonth(12); setBsYear(y => y - 1); }
      else { setBsMonth(m => m - 1); }
    } else {
      if (adMonth === 1) { setAdMonth(12); setAdYear(y => y - 1); }
      else { setAdMonth(m => m - 1); }
    }
  };

  const handleNextMonth = () => {
    if (calendarView === 'BS') {
      if (bsMonth === 12) { setBsMonth(1); setBsYear(y => y + 1); }
      else { setBsMonth(m => m + 1); }
    } else {
      if (adMonth === 12) { setAdMonth(1); setAdYear(y => y + 1); }
      else { setAdMonth(m => m + 1); }
    }
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

  const handleStatusChange = (employeeId, dateStr, newStatus) => {
    const key = `${employeeId}_${dateStr}`;
    setLocalChanges(prev => ({
      ...prev,
      [key]: { employee_id: employeeId, attendance_date: dateStr, status: newStatus, source: 'Manual' }
    }));
  };

  const handleDailyChange = (employeeId, field, value) => {
    const key = `${employeeId}_${dailyDate}`;
    setLocalChanges(prev => {
      const existing = prev[key] || dailyRecords.find(r => r.employee_id === employeeId) || {
        employee_id: employeeId,
        attendance_date: dailyDate,
        status: 'Absent',
        check_in: null,
        check_out: null,
        remarks: '',
        source: 'Manual'
      };
      
      const updated = { ...existing, [field]: value, source: 'Manual' };
      
      if (field === 'check_in' || field === 'check_out') {
        const result = calculateAttendanceStatus(updated.check_in, updated.check_out, companySettings);
        if (result.error && value) {
          // ignore error for partial typing, just fallback to status if possible
        } else {
          updated.status = result.status;
          updated.worked_hours = result.workedHours;
        }
      }
      
      return { ...prev, [key]: updated };
    });
  };

  const getCellStatus = (employeeId, dateStr) => {
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
        check_in: change.check_in || null,
        check_out: change.check_out || null,
        worked_hours: change.worked_hours || null,
        remarks: change.remarks || null,
        source: change.source || 'Manual'
      }));

      const { error } = await sajilo.auth.supabase
        .from('AttendanceRecord')
        .upsert(payload, { onConflict: 'employee_id,attendance_date' });

      if (error) throw error;
      toast.success('Attendance updated successfully');
      fetchAttendance();
      // Also refresh dailyRecords
      sajilo.auth.supabase.from('AttendanceRecord').select('*').eq('company_id', activeCompany.id).eq('attendance_date', dailyDate)
        .then(({ data }) => setDailyRecords(data || []));
    } catch (error) {
      toast.error('Failed to save attendance: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const isWeeklyOff = (weekday) => {
    if (!companySettings?.hr_weekly_off) return weekday === 6; // Default Saturday
    return companySettings.hr_weekly_off.includes(weekday);
  };

  return (
    <div className="flex flex-col h-full gap-4 p-6 overflow-hidden">
      <PageHeader 
        title="Attendance Tracking" 
        subtitle="Manage daily attendance records"
        action={saveChanges}
        actionLabel={saving ? 'Saving...' : 'Save Changes'}
        actionIcon={Save}
        actionDisabled={saving || Object.keys(localChanges).length === 0}
      />

      <Tabs defaultValue="grid" className="flex flex-col flex-1 min-h-0 h-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="grid" className="flex items-center gap-2">
              <Table className="w-4 h-4" /> Monthly Register
            </TabsTrigger>
            <TabsTrigger value="daily" className="flex items-center gap-2">
              <Hand className="w-4 h-4" /> Daily Entry
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
              Import Excel
            </Button>
            <Button 
              variant={calendarView === 'BS' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setCalendarView('BS')}
            >
              BS
            </Button>
            <Button 
              variant={calendarView === 'AD' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setCalendarView('AD')}
            >
              AD
            </Button>
          </div>
        </div>

        <TabsContent value="grid" className="flex-1 flex flex-col min-h-[500px] border-0 p-0 m-0 data-[state=inactive]:hidden">
          <div className="flex items-center justify-between bg-card p-4 rounded-t-lg border border-b-0 shrink-0">
            <Button variant="outline" size="sm" onClick={handlePrevMonth}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            <div className="font-medium text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              {period?.label}
            </div>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          <div className="bg-card rounded-b-lg border flex-1 min-h-0 relative">
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
                    {period?.days.map(dayInfo => (
                      <th 
                        key={dayInfo.ad} 
                        className={`px-1 py-2 font-medium text-center border-b border-r min-w-[40px] ${isWeeklyOff(dayInfo.weekday) ? 'bg-muted/80' : ''}`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-foreground">{calendarView === 'BS' ? dayInfo.bsDay : dayInfo.adDay}</span>
                          <span className="text-[10px] text-muted-foreground">{calendarView === 'BS' ? dayInfo.adDay : dayInfo.bsDay}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={(period?.days.length || 30) + 1} className="p-8 text-center text-muted-foreground">
                        Loading attendance data...
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={(period?.days.length || 30) + 1} className="p-8 text-center text-muted-foreground">
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
                        {period?.days.map(dayInfo => {
                          const status = getCellStatus(emp.id, dayInfo.ad);
                          const isOff = isWeeklyOff(dayInfo.weekday);
                          
                          return (
                            <td key={dayInfo.ad} className={`px-1 py-1 text-center border-r ${isOff ? 'bg-muted/30' : ''}`}>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button 
                                    className={`w-full h-8 rounded text-xs font-semibold ${getStatusColor(status)} hover:opacity-80 transition-opacity`}
                                    title={status || (isOff ? 'Weekly Off' : 'Not marked')}
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
                                        onClick={() => handleStatusChange(emp.id, dayInfo.ad, s)}
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
        </TabsContent>

        <TabsContent value="daily" className="flex-1 border rounded-lg bg-card p-6 flex flex-col min-h-0 data-[state=inactive]:hidden">
          <div className="flex items-center gap-4 mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Input 
                type="date" 
                value={dailyDate} 
                onChange={e => setDailyDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
              {formatDualDateString(dailyDate)}
            </div>
          </div>
          
          <div className="flex-1 overflow-auto border rounded-md min-h-[400px]">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-muted text-muted-foreground shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-medium border-b border-r bg-muted">Employee Name</th>
                  <th className="px-4 py-3 font-medium border-b border-r w-32 bg-muted text-center">Status</th>
                  <th className="px-4 py-3 font-medium border-b border-r w-32 bg-muted text-center">Office In</th>
                  <th className="px-4 py-3 font-medium border-b border-r w-32 bg-muted text-center">Office Out</th>
                  <th className="px-4 py-3 font-medium border-b bg-muted">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No active employees found.
                    </td>
                  </tr>
                ) : (
                  employees.map(emp => {
                    const key = `${emp.id}_${dailyDate}`;
                    const record = localChanges[key] || dailyRecords.find(r => r.employee_id === emp.id) || {};
                    const isLocked = record.source === 'Leave Sync';

                    return (
                      <tr key={emp.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 border-r">
                          <div className="font-medium">{emp.full_name}</div>
                          <div className="text-xs text-muted-foreground">{emp.employee_code}</div>
                        </td>
                        <td className="px-2 py-2 border-r text-center">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button 
                                disabled={isLocked}
                                className={`w-full h-8 rounded text-xs font-semibold ${getStatusColor(record.status)} ${isLocked ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-80 transition-opacity'}`}
                              >
                                {record.status || 'Absent'}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="center">
                              <div className="flex flex-col gap-1">
                                {['Present', 'Absent', 'Half Day', 'Unpaid Leave', 'Holiday'].map(s => (
                                  <Button key={s} variant="ghost" size="sm" className="justify-start" onClick={() => handleDailyChange(emp.id, 'status', s)}>
                                    <div className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(s).split(' ')[0]}`} />
                                    {s}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="px-2 py-2 border-r">
                          <Input 
                            type="time" 
                            value={record.check_in || ''}
                            onChange={e => handleDailyChange(emp.id, 'check_in', e.target.value)}
                            disabled={isLocked}
                            className="h-8 text-center"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
                          <Input 
                            type="time" 
                            value={record.check_out || ''}
                            onChange={e => handleDailyChange(emp.id, 'check_out', e.target.value)}
                            disabled={isLocked}
                            className="h-8 text-center"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input 
                            value={record.remarks || ''}
                            onChange={e => handleDailyChange(emp.id, 'remarks', e.target.value)}
                            disabled={isLocked}
                            placeholder={isLocked ? "Locked by Leave" : "Optional remarks"}
                            className="h-8"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <AttendanceImportModal 
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        companyId={activeCompany?.id}
        period={period}
        employees={employees}
        onSuccess={fetchAttendance}
      />
    </div>
  );
}
