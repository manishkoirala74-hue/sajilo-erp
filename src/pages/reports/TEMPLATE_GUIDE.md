# Sajilo ERP — Standard Report Developer Guide

This document describes how to create new reports using the **Sajilo Enterprise Report Framework (SERF)**.

All reports automatically inherit:
1. **Centralized Typography & Fonts:** Consistent headings, body scale, and monospace numbers.
2. **Branded Business Header:** Company logo, PAN, address, and dual B.S. & A.D. date ranges on both screen and paper.
3. **Multi-Channel Export Toolbar:** Instant Excel (.xlsx), Vector PDF (.pdf), and Print dialog.
4. **Standard Column Presets & Alignments:** Pre-configured widths, alignments, and formats for `code`, `date`, `amount`, `status`, etc.
5. **Print-Perfect Layout:** Zero overflow, repeating table headers across printed pages, and anchored summary footers.

---

## 1. Quick Example: Creating a New Report

To create any new report, create a new file in `src/pages/reports/MyNewReport.jsx`:

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { FileText } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { ReportPageTemplate, StandardReportTable, ReportFilterBar } from '@/components/reports';

export default function MyNewReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({
    fromDate: format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch your report data
      const items = await sajilo.entities.MyEntity.list();
      setData(items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 2. Define columns using standard presets
  const columns = useMemo(() => [
    { key: 'code', label: 'Item Code', preset: 'code', stickyFirst: true },
    { key: 'name', label: 'Item Name', preset: 'description' },
    { key: 'category', label: 'Category', preset: 'category' },
    { key: 'date', label: 'Date', preset: 'date' },
    { key: 'quantity', label: 'Quantity', preset: 'quantity' },
    { key: 'amount', label: 'Total Amount (NPR)', preset: 'amount' },
  ], []);

  // 3. Compute totals for footer
  const totalAmount = useMemo(() => (data || []).reduce((acc, r) => acc + (r.amount || 0), 0), [data]);
  const footer = useMemo(() => ({
    code: 'TOTAL',
    amount: totalAmount,
  }), [totalAmount]);

  // 4. Render using the Central Template Shell
  return (
    <ReportPageTemplate
      title="My New Report"
      subtitle="Brief explanation of what this report analyzes"
      category="Sales"
      icon={FileText}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={loadData}
      exportConfig={{
        columns,
        data,
        footer,
        filename: `My_New_Report_${filters.fromDate}_${filters.toDate}`,
      }}
      filterSlot={
        <ReportFilterBar
          filters={filters}
          onChange={setFilters}
          onApply={loadData}
          showApplyButton
        />
      }
    >
      <StandardReportTable
        columns={columns}
        data={data}
        loading={loading}
        footer={footer}
        emptyMessage="No records found for the selected period."
      />
    </ReportPageTemplate>
  );
}
```

---

## 2. Standard Column Presets Reference

When defining columns, supply `preset: '<name>'` to inherit standard width, alignment, and formatting:

| Preset | Width | Min Width | Alignment | Formatting & Typography |
| :--- | :--- | :--- | :--- | :--- |
| `code` | `110px` | `100px` | Left | Monospace, bold text |
| `date` | `115px` | `110px` | Center | Formatted date string |
| `voucher` | `130px` | `120px` | Center | Monospace voucher badge |
| `description`| `auto` | `220px` | Left | Standard body text |
| `category` | `140px` | `120px` | Left | Muted text |
| `amount` | `135px` | `120px` | Right | Monospace tabular numbers, commas, zero as `—`, negative in parens/red |
| `quantity` | `100px` | `90px` | Right | Monospace numbers with thousands separators |
| `percentage` | `95px` | `85px` | Right | Monospace tabular numbers with `%` suffix |
| `status` | `110px` | `95px` | Center | Pill badge wrapper |
| `actions` | `70px` | `60px` | Right | Action buttons (hidden on print) |

---

## 3. Registering the Report

1. Register your route in `src/App.jsx`:
   ```jsx
   const MyNewReport = React.lazy(() => import('@/pages/reports/MyNewReport'));
   // ...
   <Route path="/reports/sales/my-new-report" element={<MyNewReport />} />
   ```

2. Register the report in `src/config/reportsRegistry.js`:
   ```js
   {
     id: 'my_new_report',
     label: 'My New Report',
     desc: 'Brief description',
     keywords: ['sales', 'summary'],
     permissionKey: 'reports.view',
     isRoute: true,
     path: '/reports/sales/my-new-report'
   }
   ```
