// Powered by OnSpace.AI
import { API_BASE_URL } from '@/constants/config';

export interface CompanyBalance {
  id: string;
  companyId: string;
  balance: number;
  creditLimit: number;
  company?: { id: string; name: string };
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  allRoutesEnabled?: boolean;
  companyId?: string;
  companyName?: string;
  createdAt: string;
}

export interface Shop {
  id: string;
  name: string;
  ownerName: string;
  area: string;
  address: string;
  phone: string;
  routeDays: string[];  // Array of route days (e.g., ['monday', 'thursday'] for twice-weekly shops)
  orderbookerId: string;
  balance: number;
  creditLimit: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  lat?: number;
  lng?: number;
  orderbooker?: { id: string; name: string };
  companyBalances?: CompanyBalance[];
}

export interface Transaction {
  id: string;
  shopId: string;
  type: 'credit' | 'recovery';
  status: 'pending' | 'approved' | 'rejected';
  amount: number;
  previousBalance: number;
  newBalance: number;
  description?: string;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectReason?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAddress?: string | null;
  companyId?: string | null;
  createdAt: string;
  shop?: { id: string; name: string; area?: string };
  creator?: { id: string; name: string; role?: string };
}

export interface LedgerSummary {
  totalCredit: number;
  totalRecovery: number;
  totalTransactions: number;
  currentBalance: number;
}

export interface LedgerResponse {
  shop: Shop & { orderbooker?: { id: string; name: string; phone?: string } };
  transactions: Transaction[];
  summary: LedgerSummary;
}

export interface RecoverySummaryShop {
  shopId: string;
  shopName: string;
  shopArea: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
  visited: boolean;
  recoveryEntries: {
    id: string;
    amount: number;
    time: string;
    description?: string;
    hasGps: boolean;
  }[];
}

export interface RecoverySummaryOrderbooker {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string;
  totalRecovery: number;
  totalShops: number;
  visitedShops: number;
  shops: RecoverySummaryShop[];
}

export interface RecoverySummaryResponse {
  date: string;
  grandTotalRecovery: number;
  orderbookers: RecoverySummaryOrderbooker[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  // Read token from storage for authenticated requests
  let token: string | null = null;
  try {
    const { StorageService } = require('./storage');
    token = await StorageService.getToken();
  } catch {}

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    headers,
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const ApiService = {
  login: (username: string, password: string) =>
    request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  validate: () =>
    request<{ status: string; app: string; timestamp: string }>('/api/auth/validate'),

  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    request<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ userId, currentPassword, newPassword }),
    }),

  getShops: (params: { orderbookerId?: string; routeDay?: string; search?: string; balanceOnly?: boolean }) => {
    const q = new URLSearchParams();
    if (params.orderbookerId) q.set('orderbookerId', params.orderbookerId);
    if (params.routeDay) q.set('routeDay', params.routeDay);
    if (params.search) q.set('search', params.search);
    if (params.balanceOnly !== undefined) q.set('balanceOnly', String(params.balanceOnly));
    return request<Shop[]>(`/api/shops?${q.toString()}`);
  },

  submitRecovery: (payload: {
    shopId: string;
    type: 'recovery';
    amount: number;
    createdBy: string;
    description?: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAddress?: string;
    outOfRange?: boolean;
    companyId?: string;
    idempotencyKey?: string;
  }) =>
    request<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTransactions: (params: {
    shopId?: string;
    createdBy?: string;
    orderbookerId?: string;
    type?: string;
    date?: string;
    limit?: number;
    page?: number;
  }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) q.set(k, String(v));
    });
    return request<{ transactions: Transaction[]; total: number; page: number; totalPages: number }>(
      `/api/transactions?${q.toString()}`
    );
  },

  getLedger: (shopId: string, limit?: number) => {
    const q = new URLSearchParams({ shopId });
    if (limit) q.set('limit', String(limit));
    return request<LedgerResponse>(`/api/reports/ledger?${q.toString()}`);
  },

  getRecoverySummary: (date?: string) => {
    const q = date ? `?date=${date}` : '';
    return request<RecoverySummaryResponse>(`/api/reports/recovery-summary${q}`);
  },

  getSummary: () =>
    request<{
      totalUsers: number;
      totalShops: number;
      totalTransactions: number;
      totalCredit: number;
      totalRecovery: number;
      netBalance: number;
    }>('/api/summary'),

  mobileSync: (userId: string) =>
    request<{ user: User; shops: Shop[]; transactions: Transaction[]; shopNotes?: any[]; dailyTarget?: any; userPreferences?: any; syncTime: string }>(
      `/api/mobile/sync?userId=${userId}`
    ),

  batchSync: (transactions: any[]) =>
    request<{ synced: number; failed: number; results: any[] }>('/api/mobile/sync', {
      method: 'POST',
      body: JSON.stringify({ transactions }),
    }),

  deleteTransaction: (transactionId: string) =>
    request<{ success: boolean }>(`/api/transactions/${transactionId}`, {
      method: 'DELETE',
    }),

  recordVisit: (shopId: string, payload: {
    orderbookerId: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAddress?: string;
    inRange?: boolean;
  }) =>
    request<any>(`/api/shops/${shopId}/visits`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateShopPhone: (shopId: string, phone: string) =>
    request<{ success: boolean; shopId: string; newPhone: string }>('/api/shops/phone', {
      method: 'PATCH',
      body: JSON.stringify({ shopId, phone }),
    }),

  updateUserPhone: (userId: string, phone: string) =>
    request<{ success: boolean; userId: string; newPhone: string }>('/api/users/phone', {
      method: 'PATCH',
      body: JSON.stringify({ userId, phone }),
    }),

  // Fetch distributor phone from company settings (for receipts)
  fetchDistributorPhone: (companyId?: string) => {
    const params = companyId ? `?companyId=${companyId}` : '';
    return request<{ distributorPhone: string | null; companyName: string | null; companyId: string | null }>(`/api/companies/distributor-phone${params}`, {
      method: 'GET',
    });
  },
};
