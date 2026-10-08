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


