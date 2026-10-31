import PDFDocument from 'pdfkit';

export function renderInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 48 });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    if (invoice.status === 'draft' || invoice.status === 'cancelled') {
      doc.save().rotate(-35, { origin: [300, 350] }).fontSize(54).fillColor('#cccccc')
        .text(invoice.status.toUpperCase(), 100, 340, { align: 'center', width: 400 }).restore();
    }
    doc.fillColor('#111111').fontSize(20).text(`Invoice ${invoice.number}`);
    doc.fontSize(10).text(`Status: ${invoice.status}`);
    doc.text(`Invoice date: ${invoice.invoice_date}    Due: ${invoice.due_date}`);
    doc.moveDown().text(`Bill to: ${invoice.bill_to_name}`);
    if (invoice.bill_to_address) doc.text(invoice.bill_to_address);
    doc.moveDown();
    for (const line of invoice.lines ?? []) {
      doc.text(`${line.description}  |  ${line.quantity} × ${line.unit_price}  |  discount ${line.discount_amount}  |  tax ${line.tax_amount}  |  ${line.line_total}`);
    }
    doc.moveDown().text(`Subtotal: ${invoice.subtotal}`);
    doc.text(`Discount: ${invoice.discount_total}`);
    doc.text(`Tax: ${invoice.tax_total}`);
    doc.fontSize(14).text(`Total: ${invoice.total}`);
    doc.end();
  });
}
