import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Resend } from 'resend';

// Load environment variables (assuming running locally or passed via process.env)
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SAJILO_APP_ID || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing VITE_SAJILO_APP_BASE_URL or VITE_SAJILO_APP_ID");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Express setup for validation handshake engine
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/communication/test', async (req, res) => {
  const { type, config } = req.body;
  try {
    if (type === 'RESEND') {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ success: false, error: 'Platform RESEND_API_KEY environment variable is missing' });
      }

      const resend = new Resend(apiKey);
      const senderEmail = process.env.PLATFORM_SENDER_EMAIL || 'onboarding@resend.dev';
      
      const { data, error } = await resend.emails.send({
        from: config.email_from_name ? `${config.email_from_name} <${senderEmail}>` : senderEmail,
        reply_to: config.email_smtp_user,
        to: config.email_smtp_user, // Send a test email to the user's Reply-To address
        subject: 'Sajilo ERP - Platform Email Delivery Test',
        html: '<h3>Delivery Successful</h3><p>Your platform-managed email is correctly configured in Sajilo ERP.</p>'
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      
      return res.json({ success: true, message: 'Platform Email Handshake Successful' });
    }
    return res.status(400).json({ success: false, error: 'Invalid type' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

const PORT = process.env.PORT || process.env.WORKER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Communication Worker Admin Handshake API running on port ${PORT}`);
});


// 5-second polling queue
const POLLING_INTERVAL = 5000;

async function generatePDF(payload) {
  const browser = await puppeteer.launch({ 
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  const page = await browser.newPage();
  
  const html = `
    <html>
      <head>
        <style>
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; }
          .header { font-size: 24px; font-weight: bold; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .amount { font-family: monospace; font-size: 18px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">Invoice / Document</div>
        <div class="row">
          <span>Reference:</span>
          <span>${payload.voucher_no || 'N/A'}</span>
        </div>
        <div class="row">
          <span>Amount:</span>
          <span class="amount">${payload.net_amount || '0.00'}</span>
        </div>
      </body>
    </html>
  `;
  
  await page.setContent(html);
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return pdfBuffer;
}

async function processOutbox() {
  try {
    const { data: outboxRows, error } = await supabase
      .from('CommunicationOutbox')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;
    if (!outboxRows || outboxRows.length === 0) return;

    for (const row of outboxRows) {
      await supabase.from('CommunicationOutbox').update({ status: 'PROCESSING' }).eq('id', row.id);

      const { data: configRows, error: configError } = await supabase
        .from('CompanyCommunicationSetting')
        .select('*')
        .eq('company_id', row.company_id)
        .single();

      if (configError || !configRows) {
        await supabase.from('CommunicationOutbox').update({ 
          status: 'FAILED', 
          error_log: 'Missing company communication config' 
        }).eq('id', row.id);
        continue;
      }

      let emailSuccess = false;
      let errorLog = [];

      const payload = row.payload || {};

      try {
        const pdfBuffer = await generatePDF(payload);

        if (row.type === 'EMAIL') {
          const apiKey = process.env.RESEND_API_KEY;
          if (!apiKey) {
            throw new Error('Platform RESEND_API_KEY is missing');
          }

          const resend = new Resend(apiKey);
          const senderEmail = process.env.PLATFORM_SENDER_EMAIL || 'onboarding@resend.dev';

          const { data, error } = await resend.emails.send({
            from: configRows.email_from_name ? `"${configRows.email_from_name}" <${senderEmail}>` : senderEmail,
            reply_to: configRows.email_smtp_user,
            to: row.recipient_email,
            subject: `Document ${payload.voucher_no || ''} from ${configRows.email_from_name}`,
            text: `Please find the attached document.\n\nThank you.`,
            attachments: [{
              filename: `document_${payload.voucher_no || 'doc'}.pdf`,
              content: pdfBuffer
            }]
          });
          
          if (error) {
            throw new Error(`Resend API Error: ${error.message}`);
          }
          emailSuccess = true;
        }

        if (emailSuccess) {
           await supabase.from('CommunicationOutbox').update({ 
             status: 'SENT' 
           }).eq('id', row.id);
        } else {
           throw new Error("Email sending failed");
        }

      } catch (e) {
        errorLog.push(e.message || String(e));
        await supabase.from('CommunicationOutbox').update({ 
          status: 'FAILED', 
          error_log: errorLog.join(' | '),
          retry_count: row.retry_count + 1
        }).eq('id', row.id);
      }
    }
  } catch (err) {
    console.error("Worker Error: ", err);
  }
}

setInterval(processOutbox, POLLING_INTERVAL);
console.log(`Background worker running. Polling outbox every ${POLLING_INTERVAL}ms...`);
