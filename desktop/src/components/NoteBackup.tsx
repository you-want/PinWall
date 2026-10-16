import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../i18n';

export function NoteBackup() {
  const { t } = useI18n();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const run = async (restore: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      if (restore) {
        const cards = await invoke<unknown>('read_note_backup');
        if (cards === null) return;
        if (!Array.isArray(cards)) throw new Error('storage_invalid_backup');
        if (!await confirm(t.backup_confirm.replace('{count}', String(cards.length)), {
          title: t.backup_title, kind: 'warning', okLabel: t.btn_confirm, cancelLabel: t.btn_cancel,
        })) return;
        const count = await invoke<unknown>('restore_note_backup', { cards });
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('storage_invalid_backup');
        setMessage(t.backup_restored.replace('{count}', String(count)));
      } else {
        if (await invoke<boolean>('export_note_backup')) setMessage(t.backup_exported);
      }
    } catch (error: unknown) {
      setFailed(true);
      setMessage(error === 'storage_restore_reload' ? t.backup_reload : t.backup_failed);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="ap-group">
      <div className="ap-group-label">{t.backup_title}</div>
      <div className="ap-card">
        <div className="ap-row flex-col! items-start! gap-3">
          <p className="text-xs text-white/55">{t.backup_description}</p>
          <div className="flex flex-wrap gap-2" aria-busy={busy}>
            <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void run(false)}>{t.backup_export}</button>
            <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void run(true)}>{t.backup_restore}</button>
          </div>
          {busy && <p role="status">{t.backup_busy}</p>}
          {message && <p className="text-xs" role={failed ? 'alert' : 'status'}>{message}</p>}
        </div>
      </div>
    </div>
  );
}
