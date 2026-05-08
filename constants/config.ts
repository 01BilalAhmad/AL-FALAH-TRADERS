// Powered by OnSpace.AI
export const API_BASE_URL = 'https://alfalah-traders.vercel.app';

// Working days for Al-Falah Traders (Pakistan schedule)
// Friday is the weekly off day. Saturday through Thursday are working days.
export const ROUTE_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

export const DAY_NAMES: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

export const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];
export const MIN_RECOVERY = 1;
export const MAX_RECOVERY = 500000;
