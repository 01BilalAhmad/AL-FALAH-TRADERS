// Powered by OnSpace.AI
// WhatsApp utility - opens WhatsApp directly to the shopkeeper's number
// IMPORTANT: We do NOT send editable text with amounts (fraud risk - OB could change amounts).
// Instead, we just open the WhatsApp chat so OB can send the receipt image.
import { Linking, Alert, Platform } from 'react-native';

interface WhatsappPayload {
  shopPhone: string;
  shopName: string;
  openingBalance: number;
  recoveryAmount: number;
  remainingBalance: number;
}

/** Format phone to international format (923001234567) */
function formatPhoneIntl(phone: string): string {
  let p = phone.trim().replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('92')) p = '92' + p;
  return p.replace(/[^0-9]/g, '');
}

/**
 * Open WhatsApp chat directly to the shopkeeper's number.
 * Does NOT pre-fill amounts (fraud risk - OB could edit amounts).
 * OB should use the Receipt Image sharing instead (image cannot be edited).
 */
export async function sendRecoveryWhatsapp(payload: WhatsappPayload): Promise<boolean> {
  const { shopPhone, shopName } = payload;

  if (!shopPhone || shopPhone.trim().length === 0) {
    Alert.alert('No Phone Number', 'This shop has no phone number to send WhatsApp.');
    return false;
  }

  const phone = formatPhoneIntl(shopPhone);

  // Just open the WhatsApp chat directly - no pre-filled text with amounts
  // Receipt image (non-editable) should be sent separately via RecoveryReceipt component
  const url = `https://wa.me/${phone}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    } else {
      if (Platform.OS === 'android') {
        const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.whatsapp';
        Alert.alert(
          'WhatsApp Not Installed',
          'WhatsApp is not installed on this device. Would you like to install it?',
          [
            { text: 'Install', onPress: () => Linking.openURL(playStoreUrl) },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert('WhatsApp Not Available', 'Please install WhatsApp to send recovery notifications.');
      }
      return false;
    }
  } catch (error: any) {
    Alert.alert('Error', 'Could not open WhatsApp. Please try again.');
    return false;
  }
}

// Keep buildRecoveryMessage for backward compat (used in SMS, not WhatsApp)
export function buildRecoveryMessage(
  shopName: string,
  openingBalance: number,
  recoveryAmount: number,
  remainingBalance: number,
): string {
  const today = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return `Al FALAH Credit System - Recovery Update\n\n`
    + `Dear ${shopName},\n\n`
    + `Your account has been updated:\n\n`
    + `Opening Balance: Rs. ${openingBalance.toLocaleString('en-PK')}\n`
    + `Recovery Received: Rs. ${recoveryAmount.toLocaleString('en-PK')}\n`
    + `Remaining Balance: Rs. ${remainingBalance.toLocaleString('en-PK')}\n\n`
    + `Date: ${today}\n\n`
    + `Thank you for your payment!\n`
    + `Al FALAH Credit System`;
}
