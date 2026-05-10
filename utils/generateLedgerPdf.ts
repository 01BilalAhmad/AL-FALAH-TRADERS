// Powered by OnSpace.AI
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { shareAsync, isAvailableAsync } from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import { LedgerResponse } from '@/services/api';
import { formatPKR, formatDateTime } from '@/utils/format';

function generateLedgerHtml(data: LedgerResponse, companyName?: string, distributorPhone?: string): string {
  const { shop, transactions, summary } = data;
  const displayName = companyName || 'Al FALAH Credit System';

  const txnRows = transactions
    .map((t) => {
      const isCredit = t.type === 'credit';
      const bgColor = isCredit ? '#FEF3C7' : '#DBEAFE';
      const typeColor = isCredit ? '#92400E' : '#1D4ED8';
      const typeLabel = isCredit ? 'CREDIT' : 'RECOVERY';
      const amountPrefix = isCredit ? '+' : '-';
      const statusBadge =
        t.status === 'pending'
          ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;">Pending</span>'
          : t.status === 'rejected'
          ? '<span style="background:#FEE2E2;color:#EF4444;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;">Rejected</span>'
          : '';

      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#6B7280;">${formatDateTime(t.createdAt)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;">
            <span style="background:${bgColor};color:${typeColor};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;">${typeLabel}</span>
            ${statusBadge}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.description || '—'}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:${isCredit ? '#F59E0B' : '#2563EB'};text-align:right;">${amountPrefix} ${formatPKR(t.amount)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#6B7280;text-align:right;">${formatPKR(t.previousBalance)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#111827;text-align:right;">${formatPKR(t.newBalance)}</td>
        </tr>
      `;
    })
    .join('');

  const balanceColor = summary.currentBalance > 0 ? '#EF4444' : '#2563EB';
  const generatedDate = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Ledger - ${shop.name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; }
        .page { padding: 24px; max-width: 800px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #2563EB, #1E40AF); color: white; padding: 24px; border-radius: 12px; margin-bottom: 20px; }
        .header h1 { font-size: 22px; margin-bottom: 4px; }
        .header p { opacity: 0.8; font-size: 13px; }
        .shop-info { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
        .shop-info h2 { font-size: 17px; margin-bottom: 8px; }
        .shop-info .meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: #6B7280; }
        .shop-info .meta span { display: flex; align-items: center; gap: 4px; }
        .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .summary-card { border-radius: 10px; padding: 14px; text-align: center; border: 1px solid #E5E7EB; }
        .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9CA3AF; margin-bottom: 4px; font-weight: 600; }
        .summary-card .value { font-size: 16px; font-weight: 700; }
        .section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; color: #111827; display: flex; align-items: center; gap: 8px; }
        .section-title .count { background: #2563EB; color: white; font-size: 11px; padding: 2px 8px; border-radius: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #F3F4F6; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; text-align: left; }
        th:last-child, th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
        .footer { text-align: center; padding-top: 16px; border-top: 1px solid #E5E7EB; color: #9CA3AF; font-size: 11px; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <h1>${displayName}</h1>
          <p>Customer Account Statement (Ledger)</p>
          ${distributorPhone ? `<p style="margin-top:4px;font-size:11px;opacity:0.75;">Distributor: ${distributorPhone}</p>` : ''}
          <p style="margin-top:8px;opacity:0.7;font-size:11px;">Generated: ${generatedDate}</p>
        </div>

        <div class="shop-info">
          <h2>${shop.name}</h2>
          <div class="meta">
            <span>👤 ${shop.ownerName}</span>
            <span>📍 ${shop.area}${shop.address ? ', ' + shop.address : ''}</span>
            ${shop.phone ? `<span>📞 ${shop.phone}</span>` : ''}
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-card" style="background:#FEF3C7;">
            <div class="label">Total Credit</div>
            <div class="value" style="color:#F59E0B;">${formatPKR(summary.totalCredit)}</div>
          </div>
          <div class="summary-card" style="background:#DBEAFE;">
            <div class="label">Total Recovery</div>
            <div class="value" style="color:#2563EB;">${formatPKR(summary.totalRecovery)}</div>
          </div>
          <div class="summary-card" style="background:${summary.currentBalance > 0 ? '#FEE2E2' : '#DBEAFE'};">
            <div class="label">Balance</div>
            <div class="value" style="color:${balanceColor};">${formatPKR(summary.currentBalance)}</div>
          </div>
        </div>

        <div class="section-title">
          Transactions <span class="count">${summary.totalTransactions}</span>
        </div>

        ${transactions.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Prev Bal</th>
              <th>New Bal</th>
            </tr>
          </thead>
          <tbody>
            ${txnRows}
          </tbody>
        </table>
        ` : '<p style="text-align:center;color:#9CA3AF;padding:32px;">No transactions found</p>'}

        <div class="footer">
          ${displayName}<br>
          ${distributorPhone ? `Distributor: ${distributorPhone}<br>` : ''}
          This is a system-generated document.
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function downloadLedgerPdf(data: LedgerResponse, companyName?: string, distributorPhone?: string): Promise<void> {
  const html = generateLedgerHtml(data, companyName, distributorPhone);

  try {
    // Step 1: Generate PDF file
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    console.log('[PDF] Generated at:', uri);

    // Step 2: Try to share the file
    try {
      const canShare = await isAvailableAsync();
      if (canShare) {
        await shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Ledger - ${data.shop.name}`,
          UTI: 'com.adobe.pdf',
        });
        return; // Successfully shared
      }
    } catch (shareError: any) {
      console.warn('[PDF] Share failed, trying fallback:', shareError?.message);
    }

    // Step 3: Fallback - Copy to Downloads directory on Android
    if (Platform.OS === 'android') {
      try {
        const downloadsDir = FileSystem.cacheDirectory;
        const fileName = `Ledger_${data.shop.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
        const destPath = `${downloadsDir}${fileName}`;

        await FileSystem.copyAsync({
          from: uri,
          to: destPath,
        });

        // Try sharing from new location
        const canShareAgain = await isAvailableAsync();
        if (canShareAgain) {
          await shareAsync(destPath, {
            mimeType: 'application/pdf',
            dialogTitle: `Ledger - ${data.shop.name}`,
            UTI: 'com.adobe.pdf',
          });
          return;
        }

        Alert.alert(
          'PDF Saved',
          `Ledger saved successfully.\nFile: ${fileName}`,
          [{ text: 'OK' }]
        );
      } catch (fallbackError: any) {
        console.error('[PDF] Fallback also failed:', fallbackError?.message);
      }
    }

    // Step 4: Final fallback - open the file directly
    if (Platform.OS === 'ios') {
      try {
        const canShareAgain = await isAvailableAsync();
        if (canShareAgain) {
          await shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Ledger - ${data.shop.name}`,
          });
          return;
        }
      } catch (e) {
        console.warn('[PDF] iOS share retry failed');
      }
    }

    // If nothing worked, show info
    Alert.alert(
      'PDF Generated',
      'The PDF was generated but could not be shared. Please check your device settings for sharing permissions.',
      [{ text: 'OK' }]
    );
  } catch (error: any) {
    console.error('[PDF] Error:', error?.message || error);
    Alert.alert(
      'PDF Error',
      error?.message || 'Failed to generate PDF. Please try again.'
    );
    throw error;
  }
}
