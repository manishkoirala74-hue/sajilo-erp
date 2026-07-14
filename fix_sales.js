const fs = require('fs');
const file = 'src/pages/sales/SalesInvoices.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const { activeCompany, mainGodownId, activeGodowns } = useAuth();',
  'const { activeCompany, mainGodownId, activeGodowns, activeFiscalYear } = useAuth();'
);

content = content.replace(
  /const openNew = \(\) => \{\n\s+const isAuto = !settings \|\| settings\.invoice_numbering_method !== 'Manual';\n\s+const invNumber = isAuto \? generateInvoiceNumber\(\) : '';\n\s+setForm\(\{ \.\.\.emptySI, id: crypto\.randomUUID\(\), invoice_number: invNumber, godown_id: mainGodownId \|\| '', _isNew: true \}\);\n\s+setDupWarning\(false\);\n\s+setPendingPostStatus\(null\);\n\s+setShowForm\(true\);\n\s+\};/,
  const getSafeDefaultDate = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (activeFiscalYear) {
      if (today > activeFiscalYear.end_date) return activeFiscalYear.end_date;
      if (today < activeFiscalYear.start_date) return activeFiscalYear.start_date;
    }
    return today;
  };

  const openNew = () => {
    const isAuto = !settings || settings.invoice_numbering_method !== 'Manual';
    const invNumber = isAuto ? generateInvoiceNumber() : '';
    const safeDate = getSafeDefaultDate();
    setForm({ 
      ...emptySI, 
      id: crypto.randomUUID(), 
      invoice_number: invNumber, 
      godown_id: mainGodownId || '', 
      invoice_date: safeDate,
      due_date: format(new Date(new Date(safeDate).getTime() + 30 * 86400000), 'yyyy-MM-dd'),
      _isNew: true 
    });
    setDupWarning(false);
    setPendingPostStatus(null);
    setShowForm(true);
  };
);

content = content.replace(
  /<PageHeader\n\s+title="Sales Invoices"\n\s+subtitle="Create and manage customer invoices and track payments"\n\s+action=\{canCreate \? openNew : undefined\}\n\s+actionLabel=\{canCreate \? "New Invoice" : undefined\}\n\s+actionIcon=\{canCreate \? Plus : undefined\}\n\s+\/>/,
  <PageHeader
        title="Sales Invoices"
        subtitle="Create and manage customer invoices and track payments"
        action={canCreate ? openNew : undefined}
        actionLabel={canCreate ? "New Invoice" : undefined}
        actionIcon={canCreate ? Plus : undefined}
        actionDisabled={!activeFiscalYear}
      />
);

const dateInputTarget = <DateInput\n                        value={form.invoice_date}\n                        onChange={(val) => setForm(f => ({ ...f, invoice_date: val }))}\n                        label="Invoice Date"\n                        required\n                      />;
const dateInputReplacement = <DateInput
                        value={form.invoice_date}
                        onChange={(val) => setForm(f => ({ ...f, invoice_date: val }))}
                        label="Invoice Date"
                        min={activeFiscalYear?.start_date}
                        max={activeFiscalYear?.end_date}
                        required
                      />;

content = content.replace(dateInputTarget, dateInputReplacement);

fs.writeFileSync(file, content, 'utf8');
