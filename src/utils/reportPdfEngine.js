import { useSettingsStore } from '@/store/settingsStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { adToBS, formatBS, formatAD } from '@/lib/nepaliDate';

import { sajilo } from '@/api/sajiloClient';

/**
 * Standardized data-driven vector PDF engine for Sajilo ERP reports.
 * Completely decouples PDF generation from the React DOM.
 * 
 * @param {Object} options
 * @param {string} options.title - Report title (e.g., 'TRIAL BALANCE')
 * @param {string} [options.subtitle] - Optional subtitle
 * @param {Array<string>} [options.columns] - Array of column headers
 * @param {Array<Array<any>>} [options.data] - 2D Array of raw data rows
 * @param {Array<any>} [options.footer] - Optional single footer row
 * @param {Object} [options.companyConfig] - Branding profile (name, address, tax_id, phone, email, company_logo_url)
 * @param {string} [options.filename] - Filename
 * @param {string} [options.fromDate] - Filter period start
 * @param {string} [options.toDate] - Filter period end
 * @param {string} [options.orientation='landscape'] - 'l' or 'p'
 */
export const generateReportVectorPDF = async (options) => {
  try {
    let {
      title = 'Report',
      subtitle = '',
      columns = [],
      data = [],
      footer,
      companyConfig = null,
      filename = 'report.pdf',
      fromDate,
      toDate,
      orientation,
      columnStyles = {},
      user = null
    } = options;

    if (!data || data.length === 0) {
      console.warn("No data available for PDF export.");
      return;
    }

    if (!companyConfig) {
      try {
        const settings = await sajilo.entities.CompanySettings.list();
        if (settings && settings.length > 0) {
          companyConfig = settings[0];
        } else {
          companyConfig = {};
        }
      } catch (e) {
        console.warn("Failed to fetch company settings for PDF", e);
        companyConfig = {};
      }
    }

    // Determine Orientation
    const docOrientation = orientation ? orientation : (columns.length <= 5 ? 'p' : 'l');
    console.log("generateReportVectorPDF: Initializing jsPDF in", docOrientation);
    const doc = new jsPDF(docOrientation, 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Base64 Logo Handling
    let logoBase64 = useSettingsStore.getState().companyLogoBase64 || null;
    if (!logoBase64 && companyConfig.company_logo_url) {
      try {
        const res = await fetch(companyConfig.company_logo_url);
        const blob = await res.blob();
        logoBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("Failed to fetch company logo for PDF", e);
      }
    }

    autoTable(doc, {
      head: [columns],
      body: data,
      foot: footer ? [footer] : undefined,
      margin: { top: 140, right: 40, bottom: 60, left: 40 },
      startY: 140,
      theme: 'grid',
      columnStyles: columnStyles,
      styles: {
        fontSize: 8,
        font: 'helvetica',
        textColor: [40, 40, 40],
        cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      },
      headStyles: {
        fillColor: [30, 41, 59], // Slate-800
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'left'
      },
      footStyles: {
        fillColor: [226, 232, 240], // Slate-200
        textColor: [15, 23, 42],
        fontSize: 9,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Slate-50
      },
      didDrawPage: function (hookData) {
        const margin = 40;
        let currentY = margin;

        // --- Multi-Page Header ---
        if (logoBase64) {
          doc.addImage(logoBase64, 'PNG', margin, currentY, 50, 50);
        }

        const centerX = pageWidth / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        if (companyConfig.tax_id) {
          doc.text(`PAN: ${companyConfig.tax_id}`, centerX, currentY + 5, { align: 'center' });
        }

        doc.setFontSize(16);
        doc.setTextColor(20, 20, 20);
        const companyName = companyConfig.name || 'Sajilo ERP';
        doc.text(companyName, centerX, currentY + 22, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        if (companyConfig.address) {
          doc.text(companyConfig.address, centerX, currentY + 36, { align: 'center' });
        }
        const contactInfo = [companyConfig.phone, companyConfig.email].filter(Boolean).join(' | ');
        if (contactInfo) {
          doc.text(contactInfo, centerX, currentY + 48, { align: 'center' });
        }

        const rightColX = pageWidth - margin;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
        doc.text(title.toUpperCase(), rightColX, currentY + 12, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        
        let rightColY = currentY + 26;
        if (subtitle) {
          doc.text(subtitle, rightColX, rightColY, { align: 'right' });
          rightColY += 12;
        }

        if (fromDate && toDate) {
          const fromBS = adToBS(fromDate);
          const toBS = adToBS(toDate);
          if (fromBS && toBS) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(20, 20, 20);
            doc.text(`${formatBS(fromBS)} -- ${formatBS(toBS)} (B.S.)`, rightColX, rightColY, { align: 'right' });
            rightColY += 12;
          }
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 100, 100);
          doc.text(`${formatAD(fromDate)} -- ${formatAD(toDate)} (A.D.)`, rightColX, rightColY, { align: 'right' });
        }

        currentY += Math.max(50, 48) + 15;

        doc.setDrawColor(220, 220, 220);
        doc.line(margin, currentY, pageWidth - margin, currentY);

        // --- Multi-Page Footer (Audit) ---
        const pageNumber = `Page ${doc.internal.getNumberOfPages()}`;
        const timestamp = `Generated by ${user?.name || user?.email || 'System'} on ${new Date().toLocaleString()}`;
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.text(timestamp, hookData.settings.margin.left, pageHeight - 20);
        doc.text(pageNumber, pageWidth - hookData.settings.margin.right, pageHeight - 20, { align: 'right' });
      },
      didParseCell: function(hookData) {
        if (hookData.section === 'body') {
          const cell = hookData.cell;
          // Mathematical indentation via metadata
          if (hookData.row.raw && typeof hookData.row.raw.level === 'number' && hookData.column.index === 0) {
            const indent = hookData.row.raw.level * 15;
            cell.styles.cellPadding = { top: 6, right: 6, bottom: 6, left: 6 + indent };
            
            if (hookData.row.raw.isGroup) {
               cell.styles.fontStyle = 'bold';
            }
          }
          
          // Dynamically right-align numeric data based on content parsing
          const content = String(cell.raw?.content ?? cell.raw ?? '');
          if (content.match(/^NPR|^[\d,.]+$|^\([\d,.]+\)$/) || hookData.row.raw?.rightAlign) {
            cell.styles.halign = 'right';
          }
        }
      }
    });

    doc.save(filename);
  } catch (err) {
    console.error(err);
    alert("CRITICAL ERROR IN PDF ENGINE: " + err.message);
    throw err;
  }
};

/**
 * Dedicated vector PDF generator for Bank Reconciliation Statement (BRS).
 * Implements multi-table audit layout with BRS Walk schedule, itemized schedules,
 * and 3-column auditor signature block.
 */
export const generateBankReconciliationVectorPDF = async ({
  companyConfig = null,
  bankAccount,
  statementDate,
  statementBalance,
  bookBalance,
  totalUnclearedCheques,
  totalUnclearedDeposits,
  bankCharges = 0,
  bankInterest = 0,
  adjustments = 0,
  adjustedBankBalance,
  adjustedBookBalance,
  differenceAmount,
  isReconciled,
  unclearedCheques = [],
  unclearedDeposits = [],
  user = null
}) => {
  try {
    if (!companyConfig) {
      try {
        const settings = await sajilo.entities.CompanySettings.list();
        companyConfig = settings?.[0] || {};
      } catch (e) {
        console.warn('Failed to fetch company settings for BRS PDF', e);
        companyConfig = {};
      }
    }

    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    const fmt = (n) => {
      const num = Number(n || 0);
      return Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Base64 Logo Handling
    let logoBase64 = useSettingsStore.getState().companyLogoBase64 || null;
    if (!logoBase64 && companyConfig.company_logo_url) {
      try {
        const res = await fetch(companyConfig.company_logo_url);
        const blob = await res.blob();
        logoBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('Failed to fetch logo for BRS PDF', e);
      }
    }

    const curr = bankAccount?.currency || 'NPR';
    const fromBS = adToBS(statementDate);
    const dateStrBS = fromBS ? formatBS(fromBS) : '';
    const dateStrAD = formatAD(statementDate);

    // Multi-Page Header & Footer Function
    const drawHeaderFooter = (hookData) => {
      const currentY = margin;

      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', margin, currentY, 45, 45);
      }

      const centerX = pageWidth / 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      if (companyConfig.tax_id) {
        doc.text(`PAN: ${companyConfig.tax_id}`, centerX, currentY + 4, { align: 'center' });
      }

      doc.setFontSize(15);
      doc.setTextColor(20, 20, 20);
      doc.text(companyConfig.name || 'Sajilo ERP', centerX, currentY + 20, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      if (companyConfig.address) {
        doc.text(companyConfig.address, centerX, currentY + 33, { align: 'center' });
      }

      const rightColX = pageWidth - margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('BANK RECONCILIATION STATEMENT', rightColX, currentY + 10, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Bank: ${bankAccount?.account_name || 'Bank Account'}`, rightColX, currentY + 23, { align: 'right' });
      doc.text(`A/C: ${bankAccount?.account_number || '—'}`, rightColX, currentY + 34, { align: 'right' });
      doc.text(`Cutoff Date: ${dateStrBS ? dateStrBS + ' (B.S.) / ' : ''}${dateStrAD} (A.D.)`, rightColX, currentY + 45, { align: 'right' });

      const lineY = currentY + 54;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, lineY, pageWidth - margin, lineY);

      // Footer
      const pNum = `Page ${doc.internal.getNumberOfPages()}`;
      const stamp = `Generated by ${user?.name || user?.email || 'System'} on ${new Date().toLocaleString()}`;
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text(stamp, margin, pageHeight - 16);
      doc.text(pNum, pageWidth - margin, pageHeight - 16, { align: 'right' });
    };

    // ── Table 1: Executive BRS Walk Table ──
    const brsBody = [
      ['Balance as per Bank Statement', 'Bank Statement Ending Balance', fmt(statementBalance)],
      ['Add: Deposits in Transit', `${unclearedDeposits.length} Uncleared Receipts`, fmt(totalUnclearedDeposits)],
      ['Less: Outstanding Cheques', `${unclearedCheques.length} Uncleared Payments`, `(${fmt(totalUnclearedCheques)})`],
      [
        { content: 'Adjusted Bank Balance', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: 'Theoretical Bank Position', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: fmt(adjustedBankBalance), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } }
      ],
      ['', '', ''],
      ['Balance as per ERP General Ledger', 'Book Balance as of Cutoff', fmt(bookBalance)],
      ['Add: Bank Interest Received', 'Credits pending book entry', fmt(bankInterest)],
      ['Less: Bank Charges & Service Fees', 'Debits pending book entry', `(${fmt(bankCharges)})`],
      ['Add/Less: Adjustments & Book Errors', 'Reconciling Memos', fmt(adjustments)],
      [
        { content: 'Adjusted Book Balance', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: 'Verified Cash Position', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: fmt(adjustedBookBalance), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } }
      ],
      [
        { 
          content: 'RECONCILIATION VARIANCE (DIFFERENCE)', 
          styles: { fontStyle: 'bold', fillColor: isReconciled ? [240, 253, 244] : [254, 242, 242], textColor: isReconciled ? [22, 101, 52] : [185, 28, 28] } 
        },
        { 
          content: isReconciled ? 'PERFECTLY RECONCILED' : 'DISCREPANCY DETECTED', 
          styles: { fontStyle: 'bold', fillColor: isReconciled ? [240, 253, 244] : [254, 242, 242], textColor: isReconciled ? [22, 101, 52] : [185, 28, 28] } 
        },
        { 
          content: fmt(differenceAmount), 
          styles: { fontStyle: 'bold', halign: 'right', fillColor: isReconciled ? [240, 253, 244] : [254, 242, 242], textColor: isReconciled ? [22, 101, 52] : [185, 28, 28] } 
        }
      ]
    ];

    autoTable(doc, {
      startY: 115,
      head: [['Reconciliation Particulars', 'Audit Note / References', `Amount (${curr})`]],
      body: brsBody,
      theme: 'grid',
      margin: { top: 110, bottom: 90, left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 260 },
        1: { cellWidth: 140 },
        2: { halign: 'right', cellWidth: 115 }
      },
      didDrawPage: drawHeaderFooter
    });

    let lastY = doc.lastAutoTable.finalY + 20;

    // ── Table 2: Schedule of Outstanding Cheques ──
    if (unclearedCheques.length > 0) {
      if (lastY > pageHeight - 160) {
        doc.addPage();
        lastY = 115;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`Schedule A: Outstanding Cheques / Payments (${unclearedCheques.length})`, margin, lastY);
      lastY += 8;

      autoTable(doc, {
        startY: lastY,
        head: [['Voucher No', 'Cheque / Ref No', 'Issue Date', 'Particulars / Beneficiary', `Amount (${curr})`]],
        body: unclearedCheques.map(c => [
          c.voucher_no || '—',
          c.cheque_no || c.reference_no || '—',
          c.transaction_date || '—',
          c.narration || '—',
          fmt(c.amount)
        ]),
        theme: 'striped',
        margin: { top: 110, bottom: 90, left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 4 },
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          4: { halign: 'right' }
        },
        didDrawPage: drawHeaderFooter
      });

      lastY = doc.lastAutoTable.finalY + 20;
    }

    // ── Table 3: Schedule of Deposits in Transit ──
    if (unclearedDeposits.length > 0) {
      if (lastY > pageHeight - 160) {
        doc.addPage();
        lastY = 115;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`Schedule B: Deposits in Transit / Uncleared Receipts (${unclearedDeposits.length})`, margin, lastY);
      lastY += 8;

      autoTable(doc, {
        startY: lastY,
        head: [['Voucher No', 'Slip / Ref No', 'Receipt Date', 'Particulars / Depositor', `Amount (${curr})`]],
        body: unclearedDeposits.map(d => [
          d.voucher_no || '—',
          d.slip_no || d.reference_no || '—',
          d.transaction_date || '—',
          d.narration || '—',
          fmt(d.amount)
        ]),
        theme: 'striped',
        margin: { top: 110, bottom: 90, left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 4 },
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          4: { halign: 'right' }
        },
        didDrawPage: drawHeaderFooter
      });

      lastY = doc.lastAutoTable.finalY + 20;
    }

    // ── 3-Column Auditor Signature Block (Rendered on final page) ──
    if (lastY > pageHeight - 90) {
      doc.addPage();
      drawHeaderFooter({ settings: { margin: { left: margin, right: margin } } });
      lastY = 115;
    }

    const sigY = pageHeight - 65;
    const colWidth = (pageWidth - (margin * 2)) / 3;

    doc.setDrawColor(180, 180, 180);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);

    // Column 1: Prepared By
    doc.line(margin + 10, sigY, margin + colWidth - 20, sigY);
    doc.text('Prepared By (Accountant)', margin + (colWidth / 2) - 5, sigY + 12, { align: 'center' });
    doc.text('Date: ________________', margin + (colWidth / 2) - 5, sigY + 22, { align: 'center' });

    // Column 2: Checked By
    doc.line(margin + colWidth + 10, sigY, margin + (colWidth * 2) - 20, sigY);
    doc.text('Checked By (Finance Manager)', margin + colWidth + (colWidth / 2) - 5, sigY + 12, { align: 'center' });
    doc.text('Date: ________________', margin + colWidth + (colWidth / 2) - 5, sigY + 22, { align: 'center' });

    // Column 3: Approved By
    doc.line(margin + (colWidth * 2) + 10, sigY, pageWidth - margin - 10, sigY);
    doc.text('Approved By (Auditor / Director)', margin + (colWidth * 2) + (colWidth / 2) - 5, sigY + 12, { align: 'center' });
    doc.text('Date: ________________', margin + (colWidth * 2) + (colWidth / 2) - 5, sigY + 22, { align: 'center' });

    const safeFilename = `BRS_${(bankAccount?.account_name || 'Bank').replace(/\s+/g, '_')}_${statementDate}.pdf`;
    doc.save(safeFilename);
  } catch (err) {
    console.error('Vector PDF BRS Generation Error:', err);
    alert('Failed to generate BRS PDF: ' + err.message);
    throw err;
  }
};



