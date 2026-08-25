import pdf from 'html-pdf-node';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to convert numeric amounts to Indian currency words
const numberToWordsIndian = (num) => {
  if (!num || isNaN(num) || num === 0) return 'Zero';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n) => {
    n = parseInt(n, 10);
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  };

  const integerPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

  let result = inWords(integerPart);
  if (!result) result = 'Zero';

  if (decimalPart > 0) {
    result += ` and ${inWords(decimalPart)} Paise`;
  }
  return result.trim();
};

const formatDate = (d) => {
  const date = d ? new Date(d) : new Date();
  if (isNaN(date.getTime())) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const generateInvoicePDF = async (payment, user, service, quote) => {
  try {
    const invoiceDir = path.join(__dirname, '../../uploads/invoices');
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const dateObj = payment?.payment_date ? new Date(payment.payment_date) : new Date();
    const year = dateObj.getFullYear();
    const paddedId = String(payment?.id || 1).padStart(4, '0');
    
    let invoiceNumber = `GLA-INV-${year}-${paddedId}`;
    if (payment?.invoice_reference && !payment.invoice_reference.startsWith('order_') && payment.invoice_reference.length <= 20) {
      invoiceNumber = payment.invoice_reference;
    }

    const fileName = `INV-${invoiceNumber.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
    const filePath = path.join(invoiceDir, fileName);

    // Quote and payment calculation values
    const quantity = parseInt(quote?.quantity || 1, 10);
    const unitPrice = parseFloat(quote?.unit_price || quote?.monthly_price || 0);
    const subtotal = parseFloat(quote?.subtotal || quote?.subtotal_price || quote?.monthly_price || 0);
    const taxableAmount = parseFloat(quote?.taxable_amount || subtotal);
    const gstAmount = parseFloat(quote?.gst_amount || 0);
    const grandTotal = parseFloat(quote?.grand_total || payment?.amount || 0);

    const halfTaxAmount = gstAmount > 0 ? (gstAmount / 2) : 0;
    const invoiceDateStr = formatDate(payment?.payment_date);
    const quoteDateStr = quote?.created_at ? formatDate(quote.created_at) : invoiceDateStr;

    const amountInWords = numberToWordsIndian(grandTotal);
    const taxInWords = numberToWordsIndian(gstAmount);

    const userName = user?.name || 'Customer';
    const userPhone = user?.phone || '';
    const userEmail = user?.email || '';
    const serviceName = service?.service_name || quote?.service_type || 'datacentre';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #000000;
            font-size: 11px;
            line-height: 1.3;
            background-color: #ffffff;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            border-spacing: 0;
          }
          .invoice-main-table {
            width: 100%;
            border: 1.5px solid #000;
            border-collapse: collapse;
          }
          .invoice-main-table > tbody > tr > td {
            padding: 0;
            vertical-align: top;
          }
          .title-header {
            text-align: center;
            font-weight: bold;
            font-size: 13px;
            padding: 6px;
            border-bottom: 1.5px solid #000;
          }
          .border-bottom {
            border-bottom: 1px solid #000;
          }
          .border-right {
            border-right: 1px solid #000;
          }
          .border-top {
            border-top: 1px solid #000;
          }
          .cell-padding {
            padding: 5px 8px;
          }
          .sub-table td {
            padding: 4px 6px;
            font-size: 10.5px;
            line-height: 1.25;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
          }
          .items-table th {
            border-bottom: 1px solid #000;
            border-top: 1px solid #000;
            border-right: 1px solid #000;
            padding: 6px 6px;
            font-size: 10.5px;
            font-weight: bold;
            text-align: center;
          }
          .items-table th:last-child {
            border-right: none;
          }
          .items-table td {
            border-right: 1px solid #000;
            padding: 5px 6px;
            font-size: 10.5px;
            vertical-align: top;
          }
          .items-table td:last-child {
            border-right: none;
          }
          .hsn-table {
            width: 100%;
            border-collapse: collapse;
          }
          .hsn-table th, .hsn-table td {
            border: 1px solid #000;
            padding: 4px 6px;
            font-size: 10px;
            text-align: center;
          }
          .text-left { text-align: left; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <table class="invoice-main-table">
          <tbody>
            <!-- Title Bar -->
            <tr>
              <td class="title-header">Tax Invoice</td>
            </tr>

            <!-- Company Info & Invoice Metadata Section -->
            <tr class="border-bottom">
              <td>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <!-- Seller Details -->
                    <td style="width: 50%; vertical-align: top; padding: 8px 10px;" class="border-right">
                      <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px;">greenleaf</div>
                      <div style="font-size: 10.5px; line-height: 1.4; color: #000;">
                        2/156 E 13, Moiyanadamaplayam,<br>
                        Ettiveerampalayam Village, Perumanallur,<br>
                        Avinashi, Tiruppur - 638 052<br>
                        <strong>GSTIN/UIN:</strong> 33AAVFG1866D1ZA<br>
                        <strong>State Name:</strong> Tamil Nadu, Code : 33
                      </div>
                    </td>

                    <!-- Meta details right grid -->
                    <td style="width: 50%; vertical-align: top; padding: 0;">
                      <table class="sub-table" style="width: 100%; border-collapse: collapse;">
                        <tr class="border-bottom">
                          <td style="width: 50%;" class="border-right">
                            <span style="font-size: 9.5px; color: #222;">Invoice No.</span><br>
                            <strong>${invoiceNumber}</strong>
                          </td>
                          <td style="width: 50%;">
                            <span style="font-size: 9.5px; color: #222;">Dated</span><br>
                            <strong>${invoiceDateStr}</strong>
                          </td>
                        </tr>
                        <tr class="border-bottom">
                          <td class="border-right">
                            <span style="font-size: 9.5px; color: #222;">Delivery Note</span><br>
                            &nbsp;
                          </td>
                          <td>
                            <span style="font-size: 9.5px; color: #222;">Mode/Terms of Payment</span><br>
                            <strong>${payment?.payment_method || 'Online'}</strong>
                          </td>
                        </tr>
                        <tr class="border-bottom">
                          <td class="border-right">
                            <span style="font-size: 9.5px; color: #222;">Supplier's Ref.</span><br>
                            &nbsp;
                          </td>
                          <td>
                            <span style="font-size: 9.5px; color: #222;">Other Reference(s)</span><br>
                            <strong>${payment?.transaction_reference || ''}</strong>
                          </td>
                        </tr>
                        <tr class="border-bottom">
                          <td class="border-right">
                            <span style="font-size: 9.5px; color: #222;">Buyer's Order No.</span><br>
                            <strong>${quote?.quote_number || ''}</strong>
                          </td>
                          <td>
                            <span style="font-size: 9.5px; color: #222;">Dated</span><br>
                            <strong>${quoteDateStr}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2">
                            <span style="font-size: 9.5px; color: #222;">Terms of Delivery</span><br>
                            &nbsp;
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Buyer Section -->
            <tr class="border-bottom">
              <td class="cell-padding" style="padding: 8px 10px;">
                <div style="font-size: 9.5px; color: #222;">Buyer</div>
                <div style="font-size: 12px; font-weight: bold; margin-top: 2px;">${userName}</div>
                <div style="font-size: 10.5px; line-height: 1.35; margin-top: 2px;">
                  ${userPhone ? userPhone + '<br>' : ''}
                  ${userEmail ? userEmail + '<br>' : ''}
                </div>
              </td>
            </tr>

            <!-- Items Table -->
            <tr>
              <td>
                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="width: 5%;">Sl<br>No.</th>
                      <th style="width: 43%; text-align: center;">Description of Goods</th>
                      <th style="width: 10%;">HSN/SAC</th>
                      <th style="width: 10%;">Quantity</th>
                      <th style="width: 12%;">Rate</th>
                      <th style="width: 6%;">per</th>
                      <th style="width: 14%;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- Item Row -->
                    <tr>
                      <td class="text-center">1</td>
                      <td class="text-left">
                        <strong>${serviceName}</strong>
                      </td>
                      <td class="text-center">9983</td>
                      <td class="text-center"><strong>${quantity} Nos</strong></td>
                      <td class="text-right">${unitPrice.toFixed(2)}</td>
                      <td class="text-center">Nos</td>
                      <td class="text-right"><strong>${subtotal.toFixed(2)}</strong></td>
                    </tr>

                    <!-- CGST line -->
                    ${gstAmount > 0 ? `
                    <tr>
                      <td></td>
                      <td class="text-right bold">Output CGST</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td class="text-right bold">${halfTaxAmount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td></td>
                      <td class="text-right bold">Output SGST</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td class="text-right bold">${halfTaxAmount.toFixed(2)}</td>
                    </tr>
                    ` : ''}

                    <!-- Spacer row for height structure -->
                    <tr style="height: 160px;">
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>

                    <!-- Total Row -->
                    <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
                      <td></td>
                      <td colspan="5" class="text-right bold" style="padding-right: 12px;">Total</td>
                      <td class="text-right bold" style="white-space: nowrap;">₹ ${grandTotal.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            <!-- Amount Chargeable in words -->
            <tr class="border-bottom">
              <td class="cell-padding" style="padding: 6px 10px;">
                <div style="font-size: 9.5px; color: #222;">Amount Chargeable (in words)</div>
                <div style="font-size: 11px; font-weight: bold; margin-top: 2px;">
                  INR ${amountInWords} Only
                </div>
              </td>
            </tr>

            <!-- Tax Summary Table -->
            <tr class="border-bottom">
              <td style="padding: 0;">
                <table class="hsn-table" style="border: none;">
                  <thead>
                    <tr>
                      <th rowspan="2" style="width: 16%; border-left: none; border-top: none;">HSN/SAC</th>
                      <th rowspan="2" style="width: 20%; border-top: none;">Taxable Value</th>
                      <th colspan="2" style="width: 24%; border-top: none;">Central Tax</th>
                      <th colspan="2" style="width: 24%; border-top: none;">State Tax</th>
                      <th rowspan="2" style="width: 16%; border-right: none; border-top: none;">Total Tax Amount</th>
                    </tr>
                    <tr>
                      <th style="width: 8%;">Rate</th>
                      <th style="width: 16%;">Amount</th>
                      <th style="width: 8%;">Rate</th>
                      <th style="width: 16%;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="border-left: none;">9983</td>
                      <td class="text-right">${taxableAmount.toFixed(2)}</td>
                      <td>${gstAmount > 0 ? '9%' : '0%'}</td>
                      <td class="text-right">${halfTaxAmount.toFixed(2)}</td>
                      <td>${gstAmount > 0 ? '9%' : '0%'}</td>
                      <td class="text-right">${halfTaxAmount.toFixed(2)}</td>
                      <td class="text-right" style="border-right: none;">${gstAmount.toFixed(2)}</td>
                    </tr>
                    <tr class="bold">
                      <td class="text-right" style="border-left: none;">Total</td>
                      <td class="text-right">${taxableAmount.toFixed(2)}</td>
                      <td></td>
                      <td class="text-right">${halfTaxAmount.toFixed(2)}</td>
                      <td></td>
                      <td class="text-right">${halfTaxAmount.toFixed(2)}</td>
                      <td class="text-right" style="border-right: none;">${gstAmount.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            <!-- Tax Amount in words -->
            <tr class="border-bottom">
              <td class="cell-padding" style="padding: 6px 10px; font-size: 10.5px;">
                <strong>Tax Amount (in words) :</strong> INR ${taxInWords} Only
              </td>
            </tr>

            <!-- Declaration and Signatory -->
            <tr class="border-bottom">
              <td>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="width: 55%; vertical-align: top; padding: 8px 10px;" class="border-right">
                      <div style="font-size: 10px; font-weight: bold; text-decoration: underline; margin-bottom: 4px;">Declaration</div>
                      <div style="font-size: 9.5px; line-height: 1.4; color: #222;">
                        We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                      </div>
                    </td>
                    <td style="width: 45%; vertical-align: top; padding: 8px 10px; text-align: right;">
                      <div style="font-size: 11px; font-weight: bold; margin-bottom: 45px;">for greenleaf</div>
                      <div style="font-size: 10.5px; font-weight: bold;">Authorised Signatory</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Bottom Disclaimer -->
            <tr>
              <td style="text-align: center; padding: 5px; font-size: 10px;">
                This is a Computer Generated Invoice
              </td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    let options = { 
      format: 'A4',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true
    };
    let file = { content: htmlContent };

    await pdf.generatePdf(file, options).then(pdfBuffer => {
      fs.writeFileSync(filePath, pdfBuffer);
    });

    return `/uploads/invoices/${fileName}`;
  } catch (error) {
    console.error('Error generating PDF invoice:', error);
    return null;
  }
};

