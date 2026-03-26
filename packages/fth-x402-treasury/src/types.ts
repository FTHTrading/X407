export interface TreasuryAgentRow {
  agent_id: string;
  wallet_address: string;
  namespace: string | null;
  asset: string;
  rail: string;
  status: string;
  target_balance: string;
  min_balance: string;
  max_single_refill: string;
  max_daily_refill: string;
  balance: string;
  frozen: boolean;
  last_refill_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TreasuryEvaluation {
  agent_id: string;
  wallet_address: string;
  namespace: string | null;
  asset: string;
  status: string;
  current_balance: string;
  min_balance: string;
  target_balance: string;
  recommended_refill: string;
  max_single_refill: string;
  max_daily_refill: string;
  daily_refilled: string;
  refill_needed: boolean;
  blocked: boolean;
  reason: string | null;
}