import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { NoteBackup } from './NoteBackup';

vi.mock('../i18n', () => ({ useI18n: () => ({ t: {
  backup_title: 'Backup', backup_description: 'Notes only', backup_export: 'Export notes',
  backup_restore: 'Restore notes', backup_confirm: 'Merge {count} notes?',
  backup_exported: 'Exported', backup_restored: 'Restored {count}', backup_failed: 'Backup failed',
  backup_busy: 'Working', btn_confirm: 'Confirm', btn_cancel: 'Cancel',
} }) }));

beforeEach(() => { vi.mocked(invoke).mockReset(); vi.mocked(confirm).mockReset(); });

describe('NoteBackup', () => {
  it('does not restore if the file dialog or confirmation is cancelled', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null).mockResolvedValueOnce([{}]);
    vi.mocked(confirm).mockResolvedValue(false);
    render(<NoteBackup />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore notes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore notes' })).toBeEnabled());
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore notes' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual(['read_note_backup', 'read_note_backup']);
  });

  it('shows completion only after the native commit succeeds', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{}]).mockResolvedValueOnce(1);
    vi.mocked(confirm).mockResolvedValue(true);
    render(<NoteBackup />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore notes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restored 1'));
    expect(invoke).toHaveBeenLastCalledWith('restore_note_backup', { cards: [{}] });
  });

  it('shows a safe error without revealing native error contents', async () => {
    vi.mocked(invoke).mockRejectedValue('private-path-and-secret');
    render(<NoteBackup />);
    fireEvent.click(screen.getByRole('button', { name: 'Export notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Backup failed');
    expect(document.body).not.toHaveTextContent('private-path-and-secret');
    expect(screen.getByRole('button', { name: 'Export notes' })).toBeEnabled();
  });
});
