export type KycStatus = 'pending' | 'approved' | 'rejected'
export type KycDocumentType = 'cedula_chilena' | 'passport' | 'other'
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected'
export type DisputeType = 'payment' | 'tournament_result' | 'technical' | 'other'
export type DisputeStatus = 'open' | 'resolved' | 'rejected'
export type AppRole = 'user' | 'admin' | 'owner'
export type WalletTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'ticket_debit'
  | 'prize_credit'
  | 'refund'
  | 'adjustment'
export type TournamentType = 'standard' | 'express' | 'elite' | 'freeroll'
export type PrizeModel = 'entry_pool'
export type TournamentStatus =
  | 'scheduled'
  | 'open'
  | 'live'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
export type GameStatus =
  | 'not_started'
  | 'active'
  | 'completed'
  | 'abandoned'
  | 'invalid'
export type GameEndReason = 'no_moves' | 'timeout' | 'self_ended' | 'invalid'
export type Direction = 'up' | 'down' | 'left' | 'right'
type DbRecord = Record<string, unknown>
type InsertWithOptional<T, OptionalKeys extends keyof T> =
  Omit<T, OptionalKeys> & Partial<Pick<T, OptionalKeys>> & DbRecord

export interface Profile {
  id: string
  username: string
  full_name: string | null
  rut: string | null
  birth_date: string | null
  phone: string | null
  city: string | null
  kyc_status: KycStatus
  kyc_verified_at: string | null
  is_admin: boolean
  is_banned: boolean
  terms_accepted_at: string | null
  created_at: string
}

export interface ProfileRole {
  profile_id: string
  role: AppRole
  granted_by: string | null
  granted_at: string
}

export interface WalletTransaction {
  id: string
  user_id: string
  type: WalletTransactionType
  amount_cents: number
  balance_after_cents: number
  reference_type: string | null
  reference_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Tournament {
  id: string
  name: string
  description: string | null
  game_type: string
  tournament_type: TournamentType
  prize_model: PrizeModel
  entry_fee_cents: number
  prize_1st_cents: number
  prize_2nd_cents: number
  prize_3rd_cents: number
  prize_fund_bps: number
  platform_fee_bps: number
  prize_1st_bps: number
  prize_2nd_bps: number
  prize_3rd_bps: number
  min_players: number
  max_players: number
  registration_opens_at: string
  play_window_start: string
  play_window_end: string
  status: TournamentStatus
  max_game_duration_seconds: number
  is_test: boolean
  created_by: string | null
  created_at: string
}

export interface Registration {
  id: string
  tournament_id: string
  user_id: string
  entry_fee_cents: number | null
  prize_fund_contribution_cents: number | null
  platform_fee_gross_cents: number | null
  platform_fee_net_cents: number | null
  platform_fee_iva_cents: number | null
  prize_model: PrizeModel | null
  accounting_metadata: Record<string, unknown>
  registered_at: string
}

export interface Game {
  id: string
  tournament_id: string
  user_id: string
  seed: string
  status: GameStatus
  final_score: number
  highest_tile: number
  move_count: number
  current_board: number[][] | null
  started_at: string | null
  ended_at: string | null
  end_reason: GameEndReason | null
}

export interface GameMove {
  id: string
  game_id: string
  move_number: number
  direction: Direction
  board_before: number[][]
  board_after: number[][]
  score_gained: number
  spawned_tile: { row: number; col: number; value: 2 | 4 } | null
  client_timestamp: number
  server_timestamp: string
}

export interface TournamentResult {
  id: string
  tournament_id: string
  user_id: string
  rank: number
  final_score: number
  prize_awarded_cents: number
  created_at: string
}

export interface WithdrawalRequest {
  id: string
  user_id: string
  amount_cents: number
  status: WithdrawalStatus
  bank_name: string
  bank_account: string
  account_rut: string
  account_holder: string
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface KycSubmission {
  id: string
  user_id: string
  full_name: string
  rut: string
  birth_date: string
  phone: string
  city: string
  document_type: KycDocumentType
  document_number: string
  document_front_path: string
  document_back_path: string | null
  bank_account_holder: string
  bank_account_rut: string
  status: KycStatus
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface KycAuditEvent {
  id: string
  user_id: string
  actor_id: string | null
  event_type: string
  metadata: Record<string, unknown>
  created_at: string
}

export type FlowAttemptStatus = 'pending' | 'paid' | 'rejected' | 'cancelled' | 'expired'

export interface AdminAction {
  id: string
  admin_id: string
  action: string
  target_type: string
  target_id: string | null
  summary: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface FlowPaymentAttempt {
  id: string
  user_id: string
  commerce_order: string
  flow_token: string | null
  flow_order: number | null
  net_amount_cents: number
  charged_amount_cents: number
  user_fee_cents: number
  status: FlowAttemptStatus
  flow_status_code: number | null
  payment_method: string | null
  payer_email: string | null
  raw_response: Record<string, unknown> | null
  intent: 'wallet_deposit' | 'tournament_registration'
  tournament_id: string | null
  created_at: string
  settled_at: string | null
}

export type DteDocumentType = 'boleta_electronica' | 'nota_credito'
export type DteDocumentStatus = 'pending' | 'emitting' | 'emitted' | 'failed' | 'cancelled'

export interface DteDocument {
  id: string
  registration_id: string | null
  flow_payment_attempt_id: string
  document_type: DteDocumentType
  total_cents: number
  net_cents: number
  iva_cents: number
  status: DteDocumentStatus
  libredte_track_id: string | null
  folio: number | null
  error_message: string | null
  retry_count: number
  last_attempted_at: string | null
  references_dte_id: string | null
  created_at: string
  emitted_at: string | null
}

export interface Dispute {
  id: string
  user_id: string
  tournament_id: string | null
  type: DisputeType
  description: string
  status: DisputeStatus
  admin_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

// Tipo Database completo requerido por @supabase/supabase-js v2
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile & DbRecord
        Insert: InsertWithOptional<Profile, 'created_at' | 'full_name' | 'rut' | 'birth_date' | 'phone' | 'city' | 'kyc_status' | 'kyc_verified_at' | 'is_admin' | 'is_banned' | 'terms_accepted_at'>
        Update: Partial<Omit<Profile, 'id'>> & DbRecord
        Relationships: []
      }
      profile_roles: {
        Row: ProfileRole & DbRecord
        Insert: InsertWithOptional<ProfileRole, 'granted_by' | 'granted_at'>
        Update: Partial<Omit<ProfileRole, 'profile_id' | 'role'>> & DbRecord
        Relationships: []
      }
      wallet_transactions: {
        Row: WalletTransaction & DbRecord
        Insert: InsertWithOptional<WalletTransaction, 'id' | 'created_at' | 'reference_type' | 'reference_id'>
        Update: Partial<Omit<WalletTransaction, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      tournaments: {
        Row: Tournament & DbRecord
        Insert: InsertWithOptional<Tournament, 'id' | 'created_at' | 'description' | 'game_type' | 'tournament_type' | 'prize_model' | 'prize_2nd_cents' | 'prize_3rd_cents' | 'prize_fund_bps' | 'platform_fee_bps' | 'prize_1st_bps' | 'prize_2nd_bps' | 'prize_3rd_bps' | 'min_players' | 'max_players' | 'status' | 'max_game_duration_seconds' | 'is_test' | 'created_by'>
        Update: Partial<Omit<Tournament, 'id'>> & DbRecord
        Relationships: []
      }
      registrations: {
        Row: Registration & DbRecord
        Insert: InsertWithOptional<Registration, 'id' | 'registered_at' | 'entry_fee_cents' | 'prize_fund_contribution_cents' | 'platform_fee_gross_cents' | 'platform_fee_net_cents' | 'platform_fee_iva_cents' | 'prize_model' | 'accounting_metadata'>
        Update: Partial<Omit<Registration, 'id' | 'registered_at'>> & DbRecord
        Relationships: []
      }
      games: {
        Row: Game & DbRecord
        Insert: InsertWithOptional<Game, 'id' | 'status' | 'final_score' | 'highest_tile' | 'move_count' | 'current_board' | 'started_at' | 'ended_at' | 'end_reason'>
        Update: Partial<Omit<Game, 'id'>> & DbRecord
        Relationships: []
      }
      game_moves: {
        Row: GameMove & DbRecord
        Insert: InsertWithOptional<GameMove, 'id' | 'server_timestamp' | 'spawned_tile'>
        Update: Partial<Omit<GameMove, 'id' | 'server_timestamp'>> & DbRecord
        Relationships: []
      }
      tournament_results: {
        Row: TournamentResult & DbRecord
        Insert: InsertWithOptional<TournamentResult, 'id' | 'created_at' | 'prize_awarded_cents'>
        Update: Partial<Omit<TournamentResult, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      withdrawal_requests: {
        Row: WithdrawalRequest & DbRecord
        Insert: InsertWithOptional<WithdrawalRequest, 'id' | 'created_at' | 'status' | 'admin_notes' | 'reviewed_by' | 'reviewed_at'>
        Update: Partial<Omit<WithdrawalRequest, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      kyc_submissions: {
        Row: KycSubmission & DbRecord
        Insert: InsertWithOptional<KycSubmission, 'id' | 'status' | 'document_back_path' | 'review_notes' | 'reviewed_by' | 'reviewed_at' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<KycSubmission, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      kyc_audit_events: {
        Row: KycAuditEvent & DbRecord
        Insert: InsertWithOptional<KycAuditEvent, 'id' | 'actor_id' | 'metadata' | 'created_at'>
        Update: Partial<Omit<KycAuditEvent, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      disputes: {
        Row: Dispute & DbRecord
        Insert: InsertWithOptional<Dispute, 'id' | 'created_at' | 'tournament_id' | 'status' | 'admin_notes' | 'resolved_by' | 'resolved_at'>
        Update: Partial<Omit<Dispute, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      flow_payment_attempts: {
        Row: FlowPaymentAttempt & DbRecord
        Insert: InsertWithOptional<FlowPaymentAttempt, 'id' | 'created_at' | 'flow_token' | 'flow_order' | 'status' | 'flow_status_code' | 'payment_method' | 'payer_email' | 'raw_response' | 'settled_at' | 'intent' | 'tournament_id'>
        Update: Partial<Omit<FlowPaymentAttempt, 'id' | 'created_at' | 'commerce_order' | 'user_id'>> & DbRecord
        Relationships: []
      }
      dte_documents: {
        Row: DteDocument & DbRecord
        Insert: InsertWithOptional<DteDocument, 'id' | 'created_at' | 'registration_id' | 'status' | 'libredte_track_id' | 'folio' | 'error_message' | 'retry_count' | 'last_attempted_at' | 'references_dte_id' | 'emitted_at'>
        Update: Partial<Omit<DteDocument, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
      admin_actions: {
        Row: AdminAction & DbRecord
        Insert: InsertWithOptional<AdminAction, 'id' | 'created_at' | 'target_id' | 'summary' | 'payload'>
        Update: Partial<Omit<AdminAction, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
    }
    Views: {
      prize_liability: {
        Row: {
          committed_cents: number
          contingent_cents: number
          collected_cents: number
          prize_fund_collected_cents: number
          platform_fee_gross_cents: number
          platform_fee_net_cents: number
          platform_fee_iva_cents: number
          active_count: number
          pending_count: number
        } & DbRecord
        Relationships: []
      }
      monthly_platform_finance: {
        Row: {
          period: string
          registrations_count: number
          unique_users: number
          tournaments_with_revenue: number
          gross_revenue_cents: number
          prize_fund_cents: number
          platform_fee_gross_cents: number
          platform_fee_net_cents: number
          platform_fee_iva_cents: number
        } & DbRecord
        Relationships: []
      }
    }
    Functions: {
      wallet_insert_transaction: {
        Args: {
          p_user_id: string
          p_type: string
          p_amount_cents: number
          p_reference_type?: string | null
          p_reference_id?: string | null
          p_metadata?: Record<string, unknown>
        } & DbRecord
        Returns: WalletTransaction
      }
      wallet_withdrawable_balance: {
        Args: { p_user_id: string } & DbRecord
        Returns: number
      }
      wallet_withdrawn_in_window: {
        Args: { p_user_id: string; p_window: string } & DbRecord
        Returns: number
      }
      wallet_mark_flow_attempt_failed: {
        Args: {
          p_commerce_order: string
          p_flow_token: string
          p_flow_status_code: number
          p_raw: Record<string, unknown>
        } & DbRecord
        Returns: undefined
      }
      register_for_tournament: {
        Args: {
          p_user_id: string
          p_tournament_id: string
          p_entry_fee_cents: number
        } & DbRecord
        Returns: string
      }
      settle_tournament_registration: {
        Args: {
          p_commerce_order: string
          p_flow_token: string
          p_flow_order: number
          p_amount_cents: number
          p_payment_method: string | null
          p_payer_email: string | null
          p_raw: Record<string, unknown>
        } & DbRecord
        Returns: { idempotent: boolean; registration_id: string; attempt_id: string }
      }
      finalize_tournament: {
        Args: {
          p_tournament_id: string
        } & DbRecord
        Returns: Record<string, unknown>
      }
      cancel_tournament: {
        Args: {
          p_tournament_id: string
        } & DbRecord
        Returns: Record<string, unknown>
      }
      approve_withdrawal: {
        Args: {
          p_request_id: string
          p_admin_id: string
          p_notes?: string | null
        } & DbRecord
        Returns: undefined
      }
      reject_withdrawal: {
        Args: {
          p_request_id: string
          p_admin_id: string
          p_notes?: string | null
        } & DbRecord
        Returns: undefined
      }
      record_admin_action: {
        Args: {
          p_admin_id: string
          p_action: string
          p_target_type: string
          p_target_id: string | null
          p_summary?: string | null
          p_payload?: Record<string, unknown>
        } & DbRecord
        Returns: string
      }
      rate_limit_consume: {
        Args: {
          p_key: string
          p_limit: number
          p_window_ms: number
        } & DbRecord
        Returns: {
          ok: boolean
          limit: number
          count: number
          remaining: number
          expires_at: string
          retry_after_seconds: number
        }
      }
    }
    Enums: {
      app_role: AppRole
    }
    CompositeTypes: Record<string, never>
  }
}
