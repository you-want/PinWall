import '@testing-library/jest-dom';

// Set window dimensions BEFORE any module imports
Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 1080 });

// Mock Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn(),
  event: { listen: vi.fn() },
  webviewWindow: { WebviewWindow: { getByLabel: vi.fn() } },
  store: {},
  core: { invoke: vi.fn() },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  BaseDirectory: { AppData: 'AppData' },
}));

// Mock console.warn for noisy libraries
console.warn = vi.fn();
