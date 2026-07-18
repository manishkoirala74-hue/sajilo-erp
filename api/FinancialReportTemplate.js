import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { formatValue } from '../src/lib/reports/reportDataTransformer.js';

// Register standard web font to handle UTF-8 and currency symbols correctly
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf', fontWeight: 300 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf', fontWeight: 500 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 }
  ]
});

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 9,
    padding: 30,
    backgroundColor: '#ffffff',
    color: '#0f172a'
  },
  corporateHeader: {
    marginBottom: 20,
    borderBottom: '1pt solid #cbd5e1',
    paddingBottom: 10,
    textAlign: 'center'
  },
  companyName: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
    color: '#1e293b'
  },
  companyDetails: {
    fontSize: 9,
    color: '#475569',
    marginBottom: 2
  },
  reportTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 8,
    marginBottom: 4,
    color: '#334155'
  },
  dateStrings: {
    fontSize: 9,
    color: '#64748b'
  },
  table: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottom: '1pt solid #cbd5e1',
    backgroundColor: '#f1f5f9',
    padding: '4 8',
    fontWeight: 700
  },
  // Row Typography Styles
  row_account: {
    flexDirection: 'row',
    borderBottom: '1pt solid #e2e8f0',
    padding: '4 8'
  },
  row_transaction: {
    flexDirection: 'row',
    borderBottom: '1pt solid #e2e8f0',
    padding: '4 8'
  },
  row_header: {
    flexDirection: 'row',
    padding: '6 8 2 8',
    fontWeight: 700,
    color: '#1e293b',
    marginTop: 4
  },
  row_kpi_primary: {
    flexDirection: 'row',
    padding: '6 8',
    fontWeight: 700,
    color: '#000000',
    borderTop: '1pt solid #000000',
    borderBottom: '2pt solid #000000',
    marginTop: 4,
    marginBottom: 8
  },
  row_kpi_secondary: {
    flexDirection: 'row',
    padding: '4 8',
    fontWeight: 500,
    color: '#1e293b',
    borderTop: '1pt solid #cbd5e1',
    marginTop: 2,
    marginBottom: 4
  },
  cellText: {
    fontSize: 9
  }
});

const CorporateHeader = ({ companyData, dateStrings, reportTitle }) => {
  return React.createElement(View, { style: styles.corporateHeader, fixed: true },
    React.createElement(Text, { style: styles.companyName }, companyData?.name || 'Sajilo ERP'),
    React.createElement(Text, { style: styles.companyDetails }, `PAN: ${companyData?.pan_no || 'N/A'} | ${companyData?.address || ''}`),
    React.createElement(Text, { style: styles.companyDetails }, `Contact: ${companyData?.contact_number || ''} ${companyData?.email ? '| ' + companyData.email : ''}`.trim()),
    React.createElement(Text, { style: styles.reportTitle }, reportTitle),
    dateStrings?.bs && React.createElement(Text, { style: styles.dateStrings }, dateStrings.bs),
    dateStrings?.ad && React.createElement(Text, { style: styles.dateStrings }, dateStrings.ad)
  );
};

const ReportRow = ({ node, columns, level = 0 }) => {
  const rowStyle = styles[`row_${node.row_type}`] || styles.row_account;
  const isHeader = node.row_type === 'header';
  const isAccount = node.row_type === 'account';

  // Apply padding left for indentation on accounts and headers based on level
  const indentStyle = (isHeader || isAccount) && level > 0 
    ? { paddingLeft: 8 + (level * 10) } 
    : {};

  // Prevent KPI and account rows from breaking across pages
  const wrap = node.row_type !== 'kpi_primary' && node.row_type !== 'kpi_secondary' && node.row_type !== 'account';

  return React.createElement(React.Fragment, null,
    React.createElement(View, { 
      style: [rowStyle, indentStyle], 
      wrap: wrap,
      minPresenceAhead: isHeader ? 2 : 0 
    },
      columns.map((col, idx) => {
        const val = node.data[col.key];
        const formattedVal = formatValue(val, col.formatType);
        return React.createElement(View, { 
          key: idx, 
          style: { width: col.width, paddingRight: 4, overflow: 'hidden' } 
        },
          React.createElement(Text, { 
            style: [styles.cellText, { textAlign: col.align || 'left' }] 
          }, formattedVal !== undefined ? formattedVal.toString() : '')
        );
      })
    ),
    node.children && node.children.map((child, idx) => 
      React.createElement(ReportRow, { key: idx, node: child, columns, level: level + 1 })
    )
  );
};

export default function FinancialReportTemplate({ reportType, parameters, companyData, dateStrings, reportNodes, columnDefinitions }) {
  
  let reportTitle = 'Financial Report';
  if (reportType === 'profit_loss') reportTitle = 'Profit & Loss Statement';
  if (reportType === 'trial_balance') reportTitle = 'Trial Balance';
  if (reportType === 'ledger_detail') {
    reportTitle = `Detail General Ledger: ${parameters?.accountInfo?.account_name || 'Account'}`;
  }

  return React.createElement(Document, null,
    React.createElement(Page, { size: "A4", style: styles.page, orientation: columnDefinitions.length > 5 ? 'landscape' : 'portrait' },
      // 1. Standalone Corporate Header (Repeats if fixed=true, but we set it fixed inside the component)
      React.createElement(CorporateHeader, { companyData, dateStrings, reportTitle }),

      // 2. Dumb Table Layout
      React.createElement(View, { style: styles.table },
        
        // Dynamic Column Headers (Repeats on every page due to fixed=true)
        React.createElement(View, { style: styles.tableHeaderRow, fixed: true },
          columnDefinitions.map((col, idx) => 
            React.createElement(View, { 
              key: idx, 
              style: { width: col.width, paddingRight: 4, overflow: 'hidden' } 
            },
              React.createElement(Text, { 
                style: [styles.cellText, { textAlign: col.align || 'left' }] 
              }, col.title)
            )
          )
        ),

        // Recursive Row Rendering
        reportNodes.map((node, idx) => 
          React.createElement(ReportRow, { key: idx, node, columns: columnDefinitions })
        )
      )
    )
  );
}
