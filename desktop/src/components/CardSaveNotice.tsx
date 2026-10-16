import { useCardSaveStatus, tauriHandler } from '../stores/cardStore';
import { useI18n } from '../i18n';

export function CardSaveNotice() {
  const failed = useCardSaveStatus(state => state.status === 'failed');
  const { t } = useI18n();
  if (!failed) return null;
  return <div className="settings-storage-error" data-interactive="true" role="alert">
    <p>{t.cards_save_failed}</p>
    <button className="btn-v2" onClick={() => void tauriHandler.retry().catch(() => {})}>{t.cards_retry_save}</button>
  </div>;
}
