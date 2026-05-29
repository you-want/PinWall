export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  content: string;
  is_checked: boolean;
  color: string;
  created_at: string;
  updated_at: string;
  position_x?: number;
  position_y?: number;
  angle?: number;
  share_token?: string;
  is_public?: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

export interface NotesState {
  notes: Note[];
  isLoading: boolean;
  searchQuery: string;
}
