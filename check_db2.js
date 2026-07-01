import { sajilo } from './src/api/sajiloClient.js';

async function fix() {
  try {
    const { data, error } = await sajilo.client.rpc('add_bill_wise_entry_setting');
    console.log('RPC Add Column (if exists):', data, error);

    // Let's just fetch it
    const { data: settings, error: err2 } = await sajilo.client.from('CompanySettings').select('enable_bill_wise_entry').limit(1);
    console.log('Select column:', settings, err2);
  } catch (e) {
    console.error(e);
  }
}
fix();
