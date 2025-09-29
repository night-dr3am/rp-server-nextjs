// TypeScript interfaces for the RP server

export interface User {
  id: number;
  sl_uuid: string;
  username: string;
  role: string;
  created_at: Date;
  last_active: Date;
}

export interface UserStats {
  id: number;
  user_id: number;
  health: number;
  hunger: number;
  thirst: number;
  goldCoin: number;
  silverCoin: number;
  copperCoin: number;
  last_updated: Date;
}

export interface RegisterUserRequest {
  sl_uuid: string;
  username: string;
  role?: string;
  secret_key: string;
}

export interface UpdateStatsRequest {
  sl_uuid: string;
  health: number;
  hunger: number;
  thirst: number;
  goldCoin?: number;
  silverCoin?: number;
  copperCoin?: number;
  secret_key: string;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  registration_required?: boolean;
}

export interface CheckUserRequest {
  sl_uuid: string;
  secret_key: string;
}

export interface Event {
  id: string;
  type: string;
  details: Record<string, unknown>;
  timestamp: Date;
  userId: string;
  user?: User;
}

export interface PaymentRequest {
  sender_uuid: string;
  recipient_uuid: string;
  goldCoin: number;
  silverCoin: number;
  copperCoin: number;
  secret_key: string;
}

export interface PaymentDetails {
  amount: {
    goldCoin: number;
    silverCoin: number;
    copperCoin: number;
  };
  sender?: {
    id: string;
    username: string;
  };
  recipient?: {
    id: string;
    username: string;
  };
}

export interface GetPaymentsRequest {
  sl_uuid: string;
  secret_key: string;
  limit?: number;
  offset?: number;
}
