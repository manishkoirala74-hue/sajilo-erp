import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDualDateString } from '@/lib/nepaliDate';

/**
 * Generates a PDF document purely on the client side using jsPDF.
 * 
 * @param {Object} data - The transaction data (e.g., invoice details, company details, line items).
 * @param {Object} layoutConfig - The JSON configuration representing the user's template design.
 * @returns {Blob} The generated PDF as a Blob.
 */
export const generatePDF = async (data, layoutConfig = {}) => {
  // Extract configuration with defaults
  const config = {
    primaryColor: layoutConfig.primaryColor || '#3b82f6', // Default blue
    textColor: layoutConfig.textColor || '#333333',
    fontFamily: layoutConfig.fontFamily || 'helvetica',
    fontSizeHeading: parseInt(layoutConfig.fontSizeHeading, 10) || 24,
    fontSizeCompanyName: parseInt(layoutConfig.fontSizeCompanyName, 10) || 14,
    fontSizeAddress: parseInt(layoutConfig.fontSizeAddress, 10) || 10,
    fontSizeBody: parseInt(layoutConfig.fontSizeBody, 10) || 10,
    logoSize: layoutConfig.logoSize !== undefined ? parseInt(layoutConfig.logoSize, 10) : 30,
    showTaxColumn: layoutConfig.showTaxColumn !== undefined ? layoutConfig.showTaxColumn : true,
    showLogo: layoutConfig.showLogo !== undefined ? layoutConfig.showLogo : true,
    showCompanyName: layoutConfig.showCompanyName !== undefined ? layoutConfig.showCompanyName : true,
    showCompanyAddress: layoutConfig.showCompanyAddress !== undefined ? layoutConfig.showCompanyAddress : true,
    showVatNumber: layoutConfig.showVatNumber !== undefined ? layoutConfig.showVatNumber : true,
    showCustomerAddress: layoutConfig.showCustomerAddress !== undefined ? layoutConfig.showCustomerAddress : true,
    showCustomerVatNumber: layoutConfig.showCustomerVatNumber !== undefined ? layoutConfig.showCustomerVatNumber : true,
    showCustomerContact: layoutConfig.showCustomerContact !== undefined ? layoutConfig.showCustomerContact : true,
    showDueDate: layoutConfig.showDueDate !== undefined ? layoutConfig.showDueDate : true,
    headerText: layoutConfig.headerText || 'INVOICE',
    footerText: layoutConfig.footerText || 'Thank you for your business!',
    termsConditions: layoutConfig.termsConditions || '',
    paymentInformation: layoutConfig.paymentInformation || '',
    ...layoutConfig
  };

  // Convert hex color to RGB array for jspdf-autotable
  const hexToRgb = (hex) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  };

  const primaryRgb = hexToRgb(config.primaryColor);

  // Initialize jsPDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  doc.setFont(config.fontFamily);
  
  // -- 1. Header Section --
  let startY = 20;

  // Title
  doc.setFontSize(config.fontSizeHeading);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text(config.headerText, 190, startY, { align: 'right' });

  // Company Details (Left)
  doc.setFontSize(config.fontSizeAddress);
  doc.setTextColor(config.textColor);
  let currentY = startY - 8; // Starting a bit higher for logo if any
  if (data.company) {
    let logoLoaded = false;
    const logoToUse = data.company.logo_url || data.company.company_logo_url;
    if (config.showLogo && logoToUse) {
      try {
        const response = await fetch(logoToUse);
        const blob = await response.blob();
        const base64data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        const logoHeight = config.logoSize / 2;
        doc.addImage(base64data, 'PNG', 14, currentY, config.logoSize, logoHeight);
        currentY += logoHeight + 6; // Push text down below the logo
        logoLoaded = true;
      } catch (e) {
        console.error("Failed to load logo", e);
      }
    }
    
    if (!logoLoaded) {
      // If no logo was displayed, adjust currentY down to match normal text baseline
      currentY = startY; 
    }

    if (config.showCompanyName) {
      doc.setFont(config.fontFamily, 'bold');
      doc.setFontSize(config.fontSizeCompanyName);
      doc.text(data.company.name || data.company.company_name || 'Your Company', 14, currentY);
      doc.setFont(config.fontFamily, 'normal');
      doc.setFontSize(config.fontSizeAddress); // Reset font size
      currentY += 6;
    }

    doc.setFontSize(config.fontSizeAddress);
    if (config.showCompanyAddress) {
      if (data.company.address) { doc.text(data.company.address, 14, currentY); currentY += 6; }
      if (data.company.email) { doc.text(data.company.email, 14, currentY); currentY += 6; }
      if (data.company.phone) { doc.text(data.company.phone, 14, currentY); currentY += 6; }
    }
    
    if (config.showVatNumber && data.company.tax_number) {
      doc.text(`VAT/TAX No: ${data.company.tax_number}`, 14, currentY);
    }
  }

  // -- 2. Customer Section --
  let displayBsDate = false;
  if (layoutConfig && layoutConfig.display_bs_date !== undefined) {
    displayBsDate = layoutConfig.display_bs_date;
  } else if (data.company && data.company.display_bs_date !== undefined) {
    displayBsDate = data.company.display_bs_date;
  }

  startY += 10;
  doc.setFontSize(config.fontSizeBody);
  const formattedDate = formatDualDateString(data.date || new Date().toISOString(), displayBsDate);
  doc.text(`Date: ${formattedDate}`, 190, startY, { align: 'right' });
  doc.text(`Reference: ${data.reference_number || 'N/A'}`, 190, startY + 6, { align: 'right' });
  if (config.showDueDate && data.due_date) {
    const formattedDueDate = formatDualDateString(data.due_date, displayBsDate);
    doc.text(`Due Date: ${formattedDueDate}`, 190, startY + 12, { align: 'right' });
  }
  
  startY += 30;
  doc.setFont(config.fontFamily, 'bold');
  doc.text('Bill To:', 14, startY);
  doc.setFont(config.fontFamily, 'normal');
  
  if (data.customer) {
    let custY = startY + 6;
    doc.text(data.customer.name || 'Customer Name', 14, custY);
    custY += 6;
    if (config.showCustomerAddress) {
      doc.text(data.customer.address || '', 14, custY);
      custY += 6;
    }
    if (config.showCustomerContact) {
      if (data.customer.email) { doc.text(data.customer.email, 14, custY); custY += 6; }
      if (data.customer.phone) { doc.text(data.customer.phone, 14, custY); custY += 6; }
    }
    if (config.showCustomerVatNumber && data.customer.tax_number) {
      doc.text(`VAT/TAX No: ${data.customer.tax_number}`, 14, custY);
    }
  }

  // -- 3. Line Items Table --
  startY += 30;
  
  const tableColumns = ['Item', 'Description', 'Quantity', 'Rate'];
  if (config.showTaxColumn) tableColumns.push('Tax');
  tableColumns.push('Amount');

  const tableRows = (data.line_items || []).map(item => {
    const row = [
      item.item_name || '',
      item.description || '',
      item.quantity?.toString() || '0',
      item.rate?.toString() || '0.00'
    ];
    if (config.showTaxColumn) row.push(item.tax_amount?.toString() || '0.00');
    row.push(item.total_amount?.toString() || '0.00');
    return row;
  });

  autoTable(doc, {
    startY: startY,
    head: [tableColumns],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: config.fontFamily,
      textColor: config.textColor,
    },
    headStyles: {
      fillColor: primaryRgb,
      textColor: 255, // White text
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251] // Light gray (Tailwind gray-50)
    }
  });

  // -- 4. Totals Section --
  const finalY = doc.lastAutoTable.finalY + 10;
  const totalsX = 140;
  
  doc.text(`Subtotal:`, totalsX, finalY);
  doc.text((data.subtotal || 0).toString(), 190, finalY, { align: 'right' });
  
  if (config.showTaxColumn) {
    doc.text(`Tax:`, totalsX, finalY + 6);
    doc.text((data.tax_total || 0).toString(), 190, finalY + 6, { align: 'right' });
  }

  doc.setFont(config.fontFamily, 'bold');
  doc.text(`Total:`, totalsX, finalY + 14);
  doc.text((data.total || 0).toString(), 190, finalY + 14, { align: 'right' });
  doc.setFont(config.fontFamily, 'normal');

  // -- 5. Terms & Payment Info --
  let bottomY = finalY + 10;
  
  if (config.paymentInformation) {
    doc.setFont(config.fontFamily, 'bold');
    doc.text('Payment Information:', 14, bottomY);
    doc.setFont(config.fontFamily, 'normal');
    doc.text(config.paymentInformation, 14, bottomY + 6, { maxWidth: 100 });
    // calculate approx height based on length
    bottomY += 6 + (Math.ceil(config.paymentInformation.length / 50) * 5);
  }

  if (config.termsConditions) {
    doc.setFont(config.fontFamily, 'bold');
    doc.text('Terms & Conditions:', 14, bottomY);
    doc.setFont(config.fontFamily, 'normal');
    doc.text(config.termsConditions, 14, bottomY + 6, { maxWidth: 100 });
  }

  // -- 6. Footer --
  const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(config.footerText, 14, pageHeight - 15);

  // Return the PDF as a Blob
  return doc.output('blob');
};

/**
 * Helper to download the generated PDF directly.
 */
export const downloadPDF = async (data, layoutConfig, filename = 'document.pdf') => {
  const blob = await generatePDF(data, layoutConfig);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
