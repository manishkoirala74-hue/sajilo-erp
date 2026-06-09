import { sajilo } from './src/api/sajiloClient.js';

async function run() {
  try {
    const items = await sajilo.entities.Item.list('', 100);
    console.log('ITEMS:');
    items.forEach(i => console.log(i.item_code, i.item_name, 'QTY:', i.quantity_on_hand, 'WAC:', i.weighted_average_cost));

    const journals = await sajilo.entities.GeneralLedgerJournal.list('', 100);
    const salesJ = journals.find(j => j.source_type === 'SalesInvoice' && j.description.includes('SI-2026-001'));
    if(salesJ) {
      const lines = await sajilo.entities.GeneralLedgerLine.filter({ journal_id: salesJ.id }, '', 100);
      console.log('\nSALES JOURNAL:', salesJ.description);
      lines.forEach(l => console.log(' ', l.account_name, 'DR:', l.debit_amount, 'CR:', l.credit_amount));
    }
  } catch (err) {
    console.error(err);
  }
}
run();
