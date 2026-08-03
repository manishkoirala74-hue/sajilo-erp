import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/api/sajiloClient';

/**
 * Generates a purely native vector PDF to guarantee crisp text, ~100KB file sizes, and 
 * selectable characters. Bypasses html2canvas completely.
 * 
 * @param {Object} documentData - The main invoice/voucher data
 * @param {string} moduleName - e.g., 'SalesInvoice', 'PurchaseInvoice', 'FinancialVoucher'
 * @param {Object} companySettings - The active company settings (name, address)
 * @param {Object} partnerData - The customer/supplier data
 * @returns {Promise<{ blob: Blob, blobUrl: string, storagePath: string }>}
 */
export async function generateVectorPDF(documentData, moduleName, companySettings, partnerData, companyId) {
  const doc = new jsPDF('p', 'pt', 'a4');
  
  // A4 dimensions in points: 595.28 x 841.89
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // 1. Header Details (Company Name & Document Title)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const title = moduleName === 'SalesInvoice' ? 'INVOICE' 
              : moduleName === 'PurchaseInvoice' ? 'PURCHASE ORDER' 
              : moduleName === 'DeliveryChallan' ? 'DELIVERY CHALLAN'
              : 'VOUCHER';
  doc.text(title, margin, margin + 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(documentData.invoice_number || documentData.purchase_number || documentData.voucher_number || '', margin, margin + 35);
  
  // Company Alignment (Right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  const companyName = companySettings?.company_name || 'My Company';
  const companyTextWidth = doc.getTextWidth(companyName);
  doc.text(companyName, pageWidth - margin - companyTextWidth, margin + 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const companyAddress = companySettings?.address || '';
  const addressTextWidth = doc.getTextWidth(companyAddress);
  doc.text(companyAddress, pageWidth - margin - addressTextWidth, margin + 35);
  
  // Line separator
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, margin + 50, pageWidth - margin, margin + 50);

  // 2. Billing & Date Info
  let currentY = margin + 80;
  
  // Billed To
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 150, 150);
  doc.text('BILLED TO', margin, currentY);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  currentY += 15;
  doc.text(partnerData?.name || 'Customer/Supplier', margin, currentY);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  if (partnerData?.address) {
    currentY += 15;
    doc.text(partnerData.address, margin, currentY);
  }
  if (partnerData?.email) {
    currentY += 15;
    doc.text(partnerData.email, margin, currentY);
  }

  // Dates
  let dateY = margin + 80;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 150, 150);
  const dateLabel = 'DATE';
  doc.text(dateLabel, pageWidth - margin - doc.getTextWidth(dateLabel), dateY);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  dateY += 15;
  const docDate = documentData.invoice_date || documentData.date || new Date().toISOString().split('T')[0];
  doc.text(docDate, pageWidth - margin - doc.getTextWidth(docDate), dateY);

  if (documentData.due_date) {
    dateY += 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150, 150, 150);
    const dueLabel = 'DUE DATE';
    doc.text(dueLabel, pageWidth - margin - doc.getTextWidth(dueLabel), dateY);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    dateY += 15;
    doc.text(documentData.due_date, pageWidth - margin - doc.getTextWidth(documentData.due_date), dateY);
  }

  currentY = Math.max(currentY, dateY) + 30;

  // 3. Line Items Grid (using autoTable)
  if (documentData.line_items && documentData.line_items.length > 0) {
    const isChallan = moduleName === 'DeliveryChallan';
    const tableColumn = isChallan ? ["Item", "Qty"] : ["Item", "Qty", "Price", "Total"];
    const tableRows = [];

    documentData.line_items.forEach(line => {
      const lineData = isChallan 
        ? [
            line.item_name || '',
            line.quantity || 0
          ]
        : [
            line.item_name || '',
            line.quantity || 0,
            Number(line.unit_price || line.rate || 0).toLocaleString(),
            Number(line.line_total || line.subtotal || 0).toLocaleString()
          ];
      tableRows.push(lineData);
    });

    autoTable(doc, {
      startY: currentY,
      head: [tableColumn],
      body: tableRows,
      theme: 'plain',
      headStyles: {
        textColor: [150, 150, 150],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 10,
        textColor: [40, 40, 40],
        cellPadding: 8
      },
      columnStyles: isChallan 
        ? { 1: { halign: 'right' } }
        : {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right', fontStyle: 'bold' }
          },
      willDrawCell: function(data) {
        // Add bottom border to rows
        if (data.row.section === 'body') {
          doc.setDrawColor(240, 240, 240);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        } else if (data.row.section === 'head') {
          doc.setDrawColor(220, 220, 220);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      }
    });

    currentY = doc.lastAutoTable.finalY + 20;
  }

  // 4. Totals Calculation
  if (moduleName !== 'DeliveryChallan') {
    const subtotal = Number(documentData.goods_subtotal || 0);
    const tax = Number(documentData.total_tax_amount || 0);
    const grandTotal = Number(documentData.grand_total || documentData.net_amount || documentData.total_amount || 0);

    doc.setFontSize(10);
    
    const rightColX = pageWidth - margin - 150;
    
    if (subtotal > 0) {
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal', rightColX, currentY);
      
      doc.setTextColor(40, 40, 40);
      const subStr = subtotal.toLocaleString();
      doc.text(subStr, pageWidth - margin - doc.getTextWidth(subStr), currentY);
      currentY += 20;
    }
    
    if (tax > 0) {
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('Tax', rightColX, currentY);
      
      doc.setTextColor(40, 40, 40);
      const taxStr = tax.toLocaleString();
      doc.text(taxStr, pageWidth - margin - doc.getTextWidth(taxStr), currentY);
      currentY += 20;
    }

    if (grandTotal > 0) {
      // Top border for grand total
      doc.setDrawColor(40, 40, 40);
      doc.setLineWidth(1.5);
      doc.line(rightColX, currentY - 10, pageWidth - margin, currentY - 10);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Grand Total', rightColX, currentY + 5);
      
      const totalStr = grandTotal.toLocaleString();
      doc.text(totalStr, pageWidth - margin - doc.getTextWidth(totalStr), currentY + 5);
      currentY += 30;
    }
  }

  // 5. Notes
  if (documentData.notes) {
    currentY += 20;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(1);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    
    currentY += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('NOTES:', margin, currentY);
    
    currentY += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    
    const splitNotes = doc.splitTextToSize(documentData.notes, pageWidth - margin * 2);
    doc.text(splitNotes, margin, currentY);
  }

  // Generate strictly as uncompressed base Blob
  const blob = doc.output('blob');
  
  // Auto-Upload immediately
  const fileName = `${documentData.id}.pdf`;
  const storagePath = `${companyId}/${moduleName}/${fileName}`;

  const { error } = await supabase.storage
    .from('erp_documents')
    .upload(storagePath, blob, {
      contentType: 'application/pdf',
      upsert: true 
    });

  if (error) {
    console.error("PDF cache upload failed", error);
    // Even if it fails, we return the blob so the user can still use it (failsafe)
  }

  return {
    blob,
    storagePath
  };
}
