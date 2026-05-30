import axios, { type InternalAxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';
import type { User, Note } from '@/types';
import { getRandomColor } from '@/utils/colors';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'pinwall_token';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface UserData {
  user: User;
}

interface LoginData {
  user: User;
  access_token: string;
}

interface NotesData {
  notes: Note[];
}

interface NoteData {
  note: Note;
}

class ApiError extends Error {
  code: number;
  message: string;
  
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.message = message;
    this.name = 'ApiError';
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const { code, message, data } = response.data;
    
    if (code !== 0) {
      throw new ApiError(code, message);
    }
    
    return { ...response, data } as AxiosResponse<unknown>;
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('pinwall_user');
      window.location.href = '/login';
    }
    
    if (error.response?.data) {
      const { code, message } = error.response.data;
      throw new ApiError(code || error.response.status, message || '请求失败');
    }
    
    throw new ApiError(500, error.message || '网络错误');
  }
);

export async function register(email: string, password: string): Promise<UserData> {
  const response = await api.post<ApiResponse<UserData>>('/auth/register', { email, password });
  return response.data.data;
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const response = await api.post<ApiResponse<LoginData>>('/auth/login', { email, password });
  const data = response.data.data;
  return {
    user: data.user,
    token: data.access_token,
  };
}

export async function getNotes(): Promise<Note[]> {
  const response = await api.get<ApiResponse<NotesData>>('/notes');
  return response.data.data.notes;
}

function getRandomPosition(): { x: number; y: number; angle: number } {
  const isMobile = window.innerWidth <= 768;
  const cardWidth = isMobile ? 180 : 220;
  const cardHeight = isMobile ? 130 : 140;
  const horizontalMargin = isMobile ? 12 : 16;
  const verticalMargin = isMobile ? 12 : 20;
  const angleRange = isMobile ? 6 : 10;

  const left = horizontalMargin + Math.random() * Math.max(window.innerWidth - cardWidth - horizontalMargin * 2, 0);
  const top = verticalMargin + Math.random() * Math.max(window.innerHeight - cardHeight - verticalMargin * 2, 0);
  const angle = (Math.random() - 0.5) * angleRange;

  return { x: left, y: top, angle };
}

export async function createNote(content: string, color?: string): Promise<Note> {
  const position = getRandomPosition();
  const response = await api.post<ApiResponse<NoteData>>('/notes', {
    content,
    color: color || getRandomColor(),
    position_x: position.x,
    position_y: position.y,
    angle: position.angle,
  });
  return response.data.data.note;
}

export async function updateNote(noteId: string, updates: Partial<Pick<Note, 'content' | 'is_checked' | 'color' | 'position_x' | 'position_y' | 'angle' | 'share_token' | 'is_public'>>): Promise<Note> {
  const response = await api.put<ApiResponse<NoteData>>(`/notes/${noteId}`, updates);
  return response.data.data.note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/notes/${noteId}`);
}

export async function getNoteByShareToken(shareToken: string): Promise<Note | null> {
  try {
    const response = await api.get<ApiResponse<NoteData>>(`/notes/share/${shareToken}`);
    return response.data.data.note;
  } catch {
    return null;
  }
}

export async function getPublicNotes(): Promise<Note[]> {
  const response = await api.get<ApiResponse<NotesData>>('/notes');
  return response.data.data.notes.filter((note: Note) => note.is_public);
}

export async function toggleNoteShare(noteId: string): Promise<Note> {
  const response = await api.post<ApiResponse<NoteData>>(`/notes/${noteId}/share`);
  return response.data.data.note;
}

export { ApiError };