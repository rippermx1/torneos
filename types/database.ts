export type KycStatus = 'pending' | 'approved' | 'rejected'
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected'
export type DisputeType = 'payment' | 'tournament_result' | 'technical' | 'other'
export type DisputeStatus = 'open' | 'resolved' | 'rejected'
export type WalletTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'ticket_debit'
  | 'prize_credit'
  | 'refund'
  | 'adjustment'
export type TournamentType = 'standard' | 'express' | 'elite' | 'freeroll'
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
  created_at: string
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
  entry_fee_cents: number
  prize_1st_cents: number
  prize_2nd_cents: number
  prize_3rd_cents: number
  min_players: number
  max_players: number
  registration_opens_at: string
  play_window_start: string
  play_window_end: string
  status: TournamentStatus
  max_game_duration_seconds: number
  created_by: string | null
  created_at: string
}

export interface Registration {
  id: string
  tournament_id: string
  user_id: string
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
        Insert: InsertWithOptional<Profile, 'created_at' | 'full_name' | 'rut' | 'birth_date' | 'phone' | 'city' | 'kyc_status' | 'kyc_verified_at' | 'is_admin' | 'is_banned'>
        Update: Partial<Omit<Profile, 'id'>> & DbRecord
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
        Insert: InsertWithOptional<Tournament, 'id' | 'created_at' | 'description' | 'game_type' | 'tournament_type' | 'prize_2nd_cents' | 'prize_3rd_cents' | 'min_players' | 'max_players' | 'status' | 'max_game_duration_seconds' | 'created_by'>
        Update: Partial<Omit<Tournament, 'id'>> & DbRecord
        Relationships: []
      }
      registrations: {
        Row: Registration & DbRecord
        Insert: InsertWithOptional<Registration, 'id' | 'registered_at'>
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
      disputes: {
        Row: Dispute & DbRecord
        Insert: InsertWithOptional<Dispute, 'id' | 'created_at' | 'tournament_id' | 'status' | 'admin_notes' | 'resolved_by' | 'resolved_at'>
        Update: Partial<Omit<Dispute, 'id' | 'created_at'>> & DbRecord
        Relationships: []
      }
    }
    Views: Record<string, never>
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
      register_for_tournament: {
        Args: {
          p_user_id: string
          p_tournament_id: string
          p_entry_fee_cents: number
        } & DbRecord
        Returns: undefined
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
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
