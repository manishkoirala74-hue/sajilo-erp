import { useState } from 'react';
import ExcelJS from 'exceljs';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimeMinutes, parseTimeString } from '@/lib/attendanceRules';

export default function AttendanceImportModal({ open, onOpenChange, companyId, period, employees, onSuccess }) {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. Generate & Download Template
  const downloadTemplate = async () => {
    if (!period || !employees || employees.length === 0) {
      toast.error("Period or employees missing.");
      return;
    }
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance');
    
    // Header Row
    const columns = [
      { header: 'Emp Code', key: 'code', width: 15 },
      { header: 'Emp ID (Do Not Edit)', key: 'id', width: 20 },
      { header: 'Emp Name', key: 'name', width: 25 },
    ];
    
    period.days.forEach(d => {
      columns.push({ header: `Day ${d.bsDay} (${d.ad})`, key: d.ad, width: 15 });
    });
    
    sheet.columns = columns;
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn('id').hidden = true; // hide the ID column

    // Employee Rows
    employees.forEach(emp => {
      const rowData = {
        code: emp.employee_code,
        id: emp.id,
        name: emp.full_name
      };
      sheet.addRow(rowData);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_Template_${period.label.replace(' ', '_')}.xlsx`;
    a.click();
  };

  // 2. Parse Uploaded Excel (Unpivot)
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFile(file);
    setLoading(true);

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.getWorksheet('Attendance');
      
      if (!sheet) throw new Error("Worksheet 'Attendance' not found. Please use the downloaded template.");
      
      const flatRecords = [];
      const headerRow = sheet.getRow(1);
      
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        
        const empId = row.getCell(2).value;
        if (!empId) return; // skip empty rows
        
        // Loop through day columns starting from col 4
        for (let colNumber = 4; colNumber <= sheet.columnCount; colNumber++) {
          const headerVal = headerRow.getCell(colNumber).value;
          if (!headerVal) continue;
          
          // Header format: "Day X (YYYY-MM-DD)"
          const match = headerVal.match(/\((.*?)\)/);
          if (!match) continue;
          const dateStr = match[1];
          
          const cell = row.getCell(colNumber);
          let cellValue = cell.value;
          
          if (!cellValue) continue;

          let checkIn = null;
          let checkOut = null;
          let status = 'Present';
          
          // Strict defensive parsing
          if (typeof cellValue === 'string') {
            cellValue = cellValue.trim().toUpperCase();
            if (['P', 'A', 'HD', 'H', 'UL', 'L'].includes(cellValue)) {
              if (cellValue === 'L') throw new Error(`Row ${rowNumber}: 'L' (Leave) cannot be uploaded via Excel. Please use Leave Management.`);
              const map = { 'P': 'Present', 'A': 'Absent', 'HD': 'Half Day', 'H': 'Holiday', 'UL': 'Unpaid Leave' };
              status = map[cellValue];
            } else if (cellValue.includes('-') || cellValue.includes('–')) { // e.g. 10:00-17:00
              const parts = cellValue.split(/[-–]/).map(s => s.trim());
              if (parts.length === 2) {
                checkIn = parts[0];
                checkOut = parts[1];
              }
            }
          } else if (typeof cellValue === 'number' && cellValue < 1) {
             // Excel time fraction (e.g. 0.41666 = 10:00)
             // But if it's a single time, they need two (In/Out) in the template...
             // So if it's a number, it's malformed for our single-cell logic.
             throw new Error(`Row ${rowNumber}: Invalid time format. Please use HH:MM-HH:MM or Status codes (P, A).`);
          }

          flatRecords.push({
            employee_id: empId,
            employee_name: row.getCell(3).value,
            attendance_date: dateStr,
            status,
            check_in: checkIn,
            check_out: checkOut
          });
        }
      });
      
      setPreviewData(flatRecords);
    } catch (error) {
      toast.error(error.message);
      setFile(null);
      e.target.value = null; // reset input
    } finally {
      setLoading(false);
    }
  };

  // 3. Import RPC Call
  const handleImport = async () => {
    if (previewData.length === 0) return;
    setLoading(true);
    try {
      // Pass the JSONB array to the RPC
      const { data, error } = await sajilo.auth.supabase.rpc('rpc_bulk_upsert_attendance', {
        p_company_id: companyId,
        p_file_name: file.name,
        p_period_label: period.label,
        p_records: previewData
      });

      if (error) throw error;
      
      toast.success(`Successfully imported ${previewData.length} records!`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Import failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Upload Attendance ({period?.label})</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 flex-1 min-h-0">
          <div className="flex items-center gap-4 bg-muted/50 p-4 rounded-md">
            <Button variant="secondary" onClick={downloadTemplate}>
              1. Download Template
            </Button>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">2. Upload Filled Template</label>
              <input 
                type="file" 
                accept=".xlsx" 
                onChange={handleFileChange}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
          </div>

          {previewData.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0 border rounded-md">
              <div className="p-2 border-b bg-muted/30 font-semibold text-sm">
                Preview ({previewData.length} entries detected)
              </div>
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 100).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.employee_name}</TableCell>
                        <TableCell>{row.attendance_date}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.check_in || '-'}</TableCell>
                        <TableCell>{row.check_out || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {previewData.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          ... and {previewData.length - 100} more rows
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={previewData.length === 0 || loading} onClick={handleImport}>
            {loading ? 'Importing...' : `Confirm Import`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
