'use strict';

const PDFDocument = require('pdfkit');

/**
 * Generate a quote PDF
 * @param {Object} quote - quote row from DB (with items parsed)
 * @param {Object} prospect - prospect row (name, address, etc.)
 * @param {Object} user - user row (email, etc.)
 * @param {Object} [settings] - optional business settings
 * @returns {Buffer} PDF buffer
 */
function generateQuotePDF(quote, prospect, user, settings = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const items = typeof quote.items === 'string' ? JSON.parse(quote.items) : (quote.items || []);

    // ── Colors ──
    const DARK   = '#020b18';
    const ACCENT = '#00c8f8';
    const GRAY   = '#7a9ab8';
    const LIGHT  = '#ddeeff';
    const WHITE  = '#ffffff';
    const LINE   = '#1e3a5f';

    // ── Helper: draw a horizontal rule ──
    const hr = (y, color = LINE, width = 1) => {
      doc.moveTo(50, y).lineTo(545, y).lineWidth(width).strokeColor(color).stroke();
    };

    // ── Background ──
    doc.rect(0, 0, 595, 842).fill(DARK);

    // ── Header band ──
    doc.rect(0, 0, 595, 120).fill('#030f1e');

    // ── Logo / Company name ──
    const bizName = settings.company_name || user.email.split('@')[0] || 'Empire Leads';
    doc.fillColor(ACCENT).fontSize(22).font('Helvetica-Bold').text(bizName, 50, 30);
    doc.fillColor(GRAY).fontSize(10).font('Helvetica').text(user.email, 50, 58);
    if (settings.phone) doc.text(settings.phone, 50, 72);
    if (settings.siret) doc.fillColor(GRAY).text('SIRET : ' + settings.siret, 50, 86);

    // ── Quote title + number ──
    doc.fillColor(WHITE).fontSize(26).font('Helvetica-Bold').text('DEVIS', 380, 28, { width: 165, align: 'right' });
    doc.fillColor(ACCENT).fontSize(14).text('N° ' + quote.number, 380, 62, { width: 165, align: 'right' });
    const createdDate = new Date(quote.created_at).toLocaleDateString('fr-FR');
    doc.fillColor(GRAY).fontSize(10).font('Helvetica').text('Date : ' + createdDate, 380, 82, { width: 165, align: 'right' });
    if (quote.valid_until) {
      const validDate = new Date(quote.valid_until).toLocaleDateString('fr-FR');
      doc.text('Valable jusqu\'au : ' + validDate, 380, 96, { width: 165, align: 'right' });
    }

    // ── Client section ──
    let y = 140;
    doc.fillColor(GRAY).fontSize(9).font('Helvetica-Bold').text('CLIENT', 50, y);
    doc.fillColor(WHITE).fontSize(13).font('Helvetica-Bold').text(prospect.name || 'Client', 50, y + 14);
    if (prospect.address) doc.fillColor(LIGHT).fontSize(10).font('Helvetica').text(prospect.address, 50, y + 30);
    if (prospect.phone) doc.fillColor(GRAY).text(prospect.phone, 50, y + 44);
    if (prospect.email) doc.text(prospect.email, 50, y + 57);

    // ── Status badge ──
    const STATUS_COLORS = { draft: '#6b7280', sent: '#3b82f6', accepted: '#10b981', refused: '#ef4444' };
    const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', refused: 'Refusé' };
    const sBg = STATUS_COLORS[quote.status] || '#6b7280';
    const sLabel = STATUS_LABELS[quote.status] || quote.status;
    doc.roundedRect(390, y + 14, 110, 24, 5).fill(sBg);
    doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold').text(sLabel, 390, y + 21, { width: 110, align: 'center' });

    // ── Divider ──
    y += 90;
    hr(y);

    // ── Table header ──
    y += 14;
    doc.rect(50, y, 495, 26).fill('#0d1f35');
    doc.fillColor(ACCENT).fontSize(10).font('Helvetica-Bold');
    doc.text('Description', 60, y + 8);
    doc.text('Qté', 330, y + 8, { width: 50, align: 'right' });
    doc.text('P.U. HT', 388, y + 8, { width: 80, align: 'right' });
    doc.text('Total HT', 474, y + 8, { width: 65, align: 'right' });

    // ── Table rows ──
    y += 26;
    items.forEach((item, i) => {
      const rowH = 30;
      const bg = i % 2 === 0 ? '#061222' : '#081828';
      doc.rect(50, y, 495, rowH).fill(bg);

      const lineTotal = (parseFloat(item.qty) || 1) * (parseFloat(item.price) || 0);
      doc.fillColor(WHITE).fontSize(10).font('Helvetica');
      doc.text(item.description || '', 60, y + 10, { width: 260, ellipsis: true });
      doc.text(String(item.qty || 1), 330, y + 10, { width: 50, align: 'right' });
      doc.text(formatEur(item.price), 388, y + 10, { width: 80, align: 'right' });
      doc.text(formatEur(lineTotal), 474, y + 10, { width: 65, align: 'right' });
      y += rowH;
    });

    hr(y);

    // ── Totals ──
    y += 14;
    const subtotal = parseFloat(quote.subtotal) || 0;
    const tvaRate  = parseFloat(quote.tva_rate) || 20;
    const tva      = parseFloat(quote.tva) || 0;
    const total    = parseFloat(quote.total) || 0;

    const totalRow = (label, value, bold = false, color = LIGHT) => {
      doc.fillColor(GRAY).fontSize(10).font('Helvetica').text(label, 370, y, { width: 105, align: 'right' });
      doc.fillColor(color).fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(value, 480, y, { width: 60, align: 'right' });
      y += 18;
    };

    totalRow('Sous-total HT', formatEur(subtotal));
    totalRow(`TVA (${tvaRate}%)`, formatEur(tva));
    hr(y - 4, ACCENT, 0.5);
    totalRow('TOTAL TTC', formatEur(total), true, ACCENT);

    // ── Notes ──
    if (quote.notes) {
      y += 10;
      doc.fillColor(GRAY).fontSize(9).font('Helvetica-Bold').text('Notes :', 50, y);
      doc.fillColor(LIGHT).fontSize(9).font('Helvetica').text(quote.notes, 50, y + 14, { width: 495 });
    }

    // ── Signature area ──
    if (quote.signature_data && quote.signed_at) {
      const signedDate = new Date(quote.signed_at).toLocaleDateString('fr-FR');
      y = Math.max(y + 60, 650);
      hr(y);
      y += 14;
      doc.fillColor(GRAY).fontSize(9).text('Signature du client (acceptation du devis)', 50, y);
      doc.fillColor(ACCENT).fontSize(9).text('Signé le ' + signedDate, 400, y, { width: 145, align: 'right' });
      y += 14;
      // Embed signature image
      try {
        const sigBuf = Buffer.from(quote.signature_data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        doc.image(sigBuf, 50, y, { width: 200, height: 60 });
      } catch (e) { /* ignore invalid signature */ }
    } else if (quote.status === 'sent') {
      // Show signature placeholder
      y = Math.max(y + 60, 650);
      hr(y);
      y += 14;
      doc.fillColor(GRAY).fontSize(9).text('Signature du client (bon pour accord) :', 50, y);
      doc.rect(50, y + 14, 200, 70).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(GRAY).fontSize(8).text('Date : ____/____/________', 50, y + 90);
    }

    // ── Footer ──
    const footY = 800;
    hr(footY - 10, LINE, 0.5);
    doc.fillColor(GRAY).fontSize(8).text(
      settings.mentions || `${bizName} — Tous droits réservés`,
      50, footY, { width: 495, align: 'center' }
    );

    doc.end();
  });
}

function formatEur(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

module.exports = { generateQuotePDF };
