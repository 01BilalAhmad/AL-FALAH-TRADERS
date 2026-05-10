// Powered by OnSpace.AI
// Direct SMS - sends silently without opening any messaging app
import { Platform } from 'react-native';
import * as Sms from 'expo-sms';
import { requireNativeModule } from 'expo-modules-core';
import { formatPKR } from '@/utils/format';

interface SmsPayload {
  shopPhone: string;
  shopName: string;
  openingBalance: number;
  recoveryAmount: number;
  remainingBalance: number;
  distributorPhone?: string;
}

// Try to load native direct SMS module (Android only)
let DirectSmsModule: any = null;
try {
  DirectSmsModule = requireNativeModule('DirectSms');
  console.log('[DirectSMS] Native module loaded successfully');
} catch {
  console.log('[DirectSMS] Native module not available, will fallback to expo-sms');
}

function formatPhoneNumber(raw: string): string {
  let phone = raw.trim().replace(/[\s\-()]/g, '');
  if (phone.startsWith('+92')) {
    // Already international format, keep as is for expo-sms
    return phone;
  } else if (phone.startsWith('0')) {
    // Local format 03XX -> keep as is for SmsManager (more reliable)
    // Will be converted to +92 only when using expo-sms fallback
    return phone;
  } else if (!phone.startsWith('+')) {
    // No prefix, assume Pakistan local number
    return '0' + phone;
  }
  return phone;
}

function formatPhoneNumberInternational(raw: string): string {
  // Format for expo-sms which needs international format
  let phone = raw.trim().replace(/[\s\-()]/g, '');
  if (phone.startsWith('+')) return phone;
  if (phone.startsWith('0')) return '+92' + phone.substring(1);
  return '+92' + phone;
}

function buildMessage(shopName: string, openingBalance: number, recoveryAmount: number, remainingBalance: number, distributorPhone?: string): string {
  const today = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  let msg = `Al FALAH Credit System - Recovery Update\n\n`
    + `Dear ${shopName},\n\n`
    + `Your account has been updated:\n\n`
    + `Opening Balance: ${formatPKR(openingBalance)}\n`
    + `Recovery Received: ${formatPKR(recoveryAmount)}\n`
    + `Remaining Balance: ${formatPKR(remainingBalance)}\n\n`
    + `Date: ${today}\n`;
  if (distributorPhone) {
    msg += `\nDistributor No: ${distributorPhone}\n`;
  }
  msg += `\nThank you for your payment!\n`
    + `Al FALAH Credit System`;
  return msg;
}

export async function sendRecoverySms(payload: SmsPayload): Promise<boolean> {
  const { shopPhone, shopName, openingBalance, recoveryAmount, remainingBalance, distributorPhone } = payload;

  if (!shopPhone || shopPhone.trim().length === 0) {
    console.log('[SMS] No phone number provided, skipping SMS');
    return false;
  }

  const localPhone = formatPhoneNumber(shopPhone); // 03XX format for SmsManager
  const intlPhone = formatPhoneNumberInternational(shopPhone); // +923XX format for expo-sms
  const message = buildMessage(shopName, openingBalance, recoveryAmount, remainingBalance, distributorPhone);

  try {
    // === METHOD 1: Native Direct SMS (Android - silent, no UI) ===
    if (Platform.OS === 'android' && DirectSmsModule) {
      console.log('[DirectSMS] Using native direct SMS (silent send)');

      // Check permission first
      const hasPermission = await DirectSmsModule.checkPermission();
      if (!hasPermission) {
        console.log('[DirectSMS] Requesting SEND_SMS permission...');
        try {
          await DirectSmsModule.requestPermission();
        } catch (permErr: any) {
          console.warn('[DirectSMS] Permission denied, falling back to expo-sms');
          return await fallbackExpoSms(intlPhone, message);
        }
      }

      // Re-check permission after request
      const hasPermissionNow = await DirectSmsModule.checkPermission();
      if (!hasPermissionNow) {
        console.warn('[DirectSMS] Permission still not granted, falling back to expo-sms');
        return await fallbackExpoSms(intlPhone, message);
      }

      // Check if SMS is available (SIM ready + permission)
      const available = await DirectSmsModule.isAvailable();
      if (!available) {
        console.warn('[DirectSMS] SMS not available (no SIM or no permission), falling back');
        return await fallbackExpoSms(intlPhone, message);
      }

      // Send directly using local format (03XX) - no UI popup!
      console.log('[DirectSMS] Sending to:', localPhone);
      const result = await DirectSmsModule.sendDirectSms(localPhone, message);
      console.log('[DirectSMS] Send result:', result);
      return !!result;
    }

    // === METHOD 2: Fallback to expo-sms (opens messaging app) ===
    return await fallbackExpoSms(intlPhone, message);

  } catch (error: any) {
    console.error('[SMS] Error:', error?.message || error);
    // If native fails, try fallback
    if (Platform.OS === 'android' && DirectSmsModule) {
      try {
        return await fallbackExpoSms(intlPhone, message);
      } catch {
        return false;
      }
    }
    return false;
  }
}

async function fallbackExpoSms(phoneNumber: string, message: string): Promise<boolean> {
  try {
    const isAvailable = await Sms.isAvailableAsync();
    if (!isAvailable) {
      console.log('[SMS Fallback] SMS not available on this device');
      return false;
    }

    const { result } = await Sms.sendSMSAsync([phoneNumber], message);
    console.log('[SMS Fallback] Result:', result);
    return result === 'sent';
  } catch (error: any) {
    console.error('[SMS Fallback] Error:', error?.message || error);
    return false;
  }
}
