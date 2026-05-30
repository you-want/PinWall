import type { User, Note } from '@/types';
import { getRandomColor } from '@/utils/colors';

const mockUsers: Record<string, User & { password: string }> = {};
const mockNotes: Record<string, Note[]> = {};
let userIdCounter = 1;
let noteIdCounter = 1;

const MOCK_DELAY = 500;

export async function register(email: string, password: string): Promise<{ user: User; token: string }> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  if (Object.values(mockUsers).some(u => u.email === email)) {
    throw new Error('Email already registered');
  }

  const userId = `user_${userIdCounter++}`;
  const now = new Date().toISOString();

  const user: User & { password: string } = {
    id: userId,
    email,
    password,
    created_at: now,
  };

  mockUsers[userId] = user;
  mockNotes[userId] = [];

  return {
    user: { id: userId, email, created_at: now },
    token: `token_${userId}`,
  };
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const user = Object.values(mockUsers).find(u => u.email === email);

  if (!user || user.password !== password) {
    throw new Error('Invalid email or password');
  }

  return {
    user: { id: user.id, email: user.email, created_at: user.created_at },
    token: `token_${user.id}`,
  };
}

export async function getNotes(userId: string): Promise<Note[]> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
  return mockNotes[userId] || [];
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

export async function createNote(userId: string, content: string, color?: string): Promise<Note> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const now = new Date().toISOString();
  const position = getRandomPosition();
  const note: Note = {
    id: `note_${noteIdCounter++}`,
    user_id: userId,
    content,
    is_checked: false,
    color: color || getRandomColor(),
    created_at: now,
    updated_at: now,
    position_x: position.x,
    position_y: position.y,
    angle: position.angle,
  };

  if (!mockNotes[userId]) {
    mockNotes[userId] = [];
  }
  mockNotes[userId].unshift(note);

  return note;
}

function generateShareToken(): string {
  return 'share_' + Math.random().toString(36).substring(2, 15);
}

export async function updateNote(userId: string, noteId: string, updates: Partial<Pick<Note, 'content' | 'is_checked' | 'color' | 'position_x' | 'position_y' | 'angle' | 'share_token' | 'is_public'>>): Promise<Note> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const notes = mockNotes[userId];
  if (!notes) throw new Error('Notes not found');

  const index = notes.findIndex(n => n.id === noteId);
  if (index === -1) throw new Error('Note not found');

  const updatedNote: Note = {
    ...notes[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  notes[index] = updatedNote;
  return updatedNote;
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const notes = mockNotes[userId];
  if (!notes) return;

  mockNotes[userId] = notes.filter(n => n.id !== noteId);
}

export async function getNoteByShareToken(shareToken: string): Promise<Note | null> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  for (const userId of Object.keys(mockNotes)) {
    const note = mockNotes[userId].find(n => n.share_token === shareToken && n.is_public);
    if (note) return note;
  }
  return null;
}

export async function getPublicNotes(userId: string): Promise<Note[]> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  return mockNotes[userId]?.filter(n => n.is_public) || [];
}

export async function toggleNoteShare(userId: string, noteId: string): Promise<Note> {
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const notes = mockNotes[userId];
  if (!notes) throw new Error('Notes not found');

  const index = notes.findIndex(n => n.id === noteId);
  if (index === -1) throw new Error('Note not found');

  const note = notes[index];
  const isPublic = !note.is_public;

  const updatedNote: Note = {
    ...note,
    is_public: isPublic,
    share_token: isPublic ? (note.share_token || generateShareToken()) : undefined,
    updated_at: new Date().toISOString(),
  };

  notes[index] = updatedNote;
  return updatedNote;
}

export function getUserFromToken(token: string): User | null {
  const userId = token.replace('token_', '');
  const user = mockUsers[userId];
  if (!user) return null;
  return { id: user.id, email: user.email, created_at: user.created_at };
}

export function initMockData() {
  if (Object.keys(mockUsers).length > 0) return;

  const demoUser: User & { password: string } = {
    id: 'user_demo',
    email: 'demo@example.com',
    password: '123456',
    created_at: new Date().toISOString(),
  };

  mockUsers['user_demo'] = demoUser;
  mockNotes['user_demo'] = [
    {
      id: 'note_1',
      user_id: 'user_demo',
      content: '保持好心情',
      is_checked: true,
      color: '#ffe0e3',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'note_2',
      user_id: 'user_demo',
      content: '多喝水哦',
      is_checked: false,
      color: '#c7f0ff',
      created_at: new Date(Date.now() - 72000000).toISOString(),
      updated_at: new Date(Date.now() - 72000000).toISOString(),
    },
    {
      id: 'note_3',
      user_id: 'user_demo',
      content: '今天辛苦啦',
      is_checked: false,
      color: '#ffd8a8',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'note_4',
      user_id: 'user_demo',
      content: '早点休息',
      is_checked: false,
      color: '#d9f2d9',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'note_5',
      user_id: 'user_demo',
      content: '记得吃水果',
      is_checked: true,
      color: '#e5d7ff',
      created_at: new Date(Date.now() - 1800000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'note_6',
      user_id: 'user_demo',
      content: '加油，你可以的！',
      is_checked: false,
      color: '#f9f7d9',
      created_at: new Date(Date.now() - 1200000).toISOString(),
      updated_at: new Date(Date.now() - 1200000).toISOString(),
    },
  ];
}