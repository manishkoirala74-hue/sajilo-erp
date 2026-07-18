import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import FinancialReportTemplate from './FinancialReportTemplate.js';
import { transformReportData } from '../src/lib/reports/reportDataTransformer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { reportType, parameters, companyId, userId, dateStrings, isoBoundaries } = req.body;
    
    if (!reportType || !parameters || !companyId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Initialize Supabase Admin client
    const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SAJILO_APP_ID || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // 1. Get current ledger timestamp
    const { data: ledgerData, error: ledgerError } = await supabaseAdmin
      .from('GeneralLedgerJournal')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (ledgerError) throw ledgerError;
    const ledgerTimestamp = ledgerData?.[0]?.updated_at || new Date().toISOString();

    // 2. Fetch CompanySettings for the Corporate Header
    const { data: companyData, error: companyError } = await supabaseAdmin
      .from('Company')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (companyError) throw companyError;

    // 3. Fetch the raw data for the report (using strict timezone ISO boundaries if present)
    let rawData = [];
    const pFromDate = isoBoundaries?.from || parameters.fromDate;
    const pToDate = isoBoundaries?.to || parameters.toDate;

    if (reportType === 'trial_balance') {
      const { data, error } = await supabaseAdmin.rpc('get_trial_balance_rpc', {
        p_company_id: companyId,
        p_from_date: pFromDate,
        p_to_date: pToDate
      });
      if (error) throw error;
      rawData = data;
    } else if (reportType === 'profit_loss') {
      // Create comparative ISO dates safely
      let compFromDate = null;
      let compToDate = null;
      if (pFromDate) {
        const fd = new Date(pFromDate);
        fd.setFullYear(fd.getFullYear() - 1);
        compFromDate = fd.toISOString();
      }
      if (pToDate) {
        const td = new Date(pToDate);
        td.setFullYear(td.getFullYear() - 1);
        compToDate = td.toISOString();
      }

      const { data, error } = await supabaseAdmin.rpc('get_comparative_profit_loss_rpc', {
        p_company_id: companyId,
        p_from_date: pFromDate,
        p_to_date: pToDate,
        p_comp_from_date: compFromDate,
        p_comp_to_date: compToDate
      });
      if (error) throw error;
      rawData = data;
    } else if (reportType === 'ledger_detail') {
      if (!parameters.accountId) {
        return res.status(400).json({ error: 'Missing accountId for ledger_detail' });
      }
      const { data, error } = await supabaseAdmin.rpc('get_stabilized_general_ledger_statement_rpc', {
        p_company_id: companyId,
        p_account_id: parameters.accountId,
        p_from_date: pFromDate,
        p_to_date: pToDate
      });
      if (error) throw error;
      
      const { data: accData, error: accError } = await supabaseAdmin
        .from('ChartOfAccount')
        .select('*')
        .eq('id', parameters.accountId)
        .single();
      
      if (accError) throw accError;
      
      rawData = data || [];
      // Pass the account info inside parameters for the header/transformer if needed
      parameters.accountInfo = accData;
    } else {
      return res.status(400).json({ error: 'Unsupported report type' });
    }

    // 4. Transform raw data into the universal layout
    // Skip zero rows globally except for ledger_detail
    const skipZeroRows = reportType !== 'ledger_detail';
    const { reportNodes, columnDefinitions } = transformReportData(reportType, rawData, parameters, skipZeroRows);

    // 5. Render the PDF to a stream
    let pdfStream;
    try {
      pdfStream = await renderToStream(
        React.createElement(FinancialReportTemplate, {
          reportType,
          parameters,
          companyData,
          dateStrings,
          reportNodes,
          columnDefinitions
        })
      );
    } catch (renderError) {
      console.error('PDF Rendering Error (Yoga WASM Exception):', renderError);
      return res.status(422).json({ error: 'Unprocessable Entity: Failed to render PDF layout.', details: renderError.message });
    }

    // Read the stream into a buffer
    const chunks = [];
    for await (const chunk of pdfStream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    // 6. Upload to bucket
    const fileName = `${companyId}/${reportType}/${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from('erp_documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 7. Insert into report_archive
    const { data: archiveData, error: archiveError } = await supabaseAdmin
      .from('report_archive')
      .insert([{
        company_id: companyId,
        report_type: reportType,
        parameters: parameters,
        generated_by: userId,
        bucket_url: fileName,
        ledger_timestamp: ledgerTimestamp
      }])
      .select('id')
      .single();

    if (archiveError) throw archiveError;

    // 8. Generate signed URL for immediate download/view
    const { data: urlData, error: urlError } = await supabaseAdmin
      .storage
      .from('erp_documents')
      .createSignedUrl(fileName, 3600);

    if (urlError) throw urlError;

    return res.status(200).json({ 
      success: true, 
      url: urlData.signedUrl,
      ledgerTimestamp 
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
