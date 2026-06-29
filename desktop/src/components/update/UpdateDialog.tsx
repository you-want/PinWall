import { useI18n } from "../../i18n";
import type { UpdateState } from "../../types";
import { openUrl } from "@tauri-apps/plugin-opener";

interface UpdateDialogProps {
  state: UpdateState;
  isOpen: boolean;
  onUpdateNow: () => void;
  onSkip: () => void;
  onLater: () => void;
  getReleaseUrl: () => string;
}

export function UpdateDialog({
  state,
  isOpen,
  onUpdateNow,
  onSkip,
  onLater,
  getReleaseUrl,
}: UpdateDialogProps) {
  const { t } = useI18n();

  if (!isOpen || !state.info) return null;

  const handleOpenReleasePage = async () => {
    await openUrl(getReleaseUrl());
  };

  const isUpdating = state.status === "downloading" || state.status === "installing";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1c1c1e] rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <div className="text-lg font-semibold text-white">
            {t.update_available_title}
          </div>
          <div className="mt-2 text-sm text-white/60">{t.update_available_desc}</div>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">{t.update_version_label}</span>
              <span className="text-sm font-medium text-green-400">
                v{state.info.version}
              </span>
            </div>

            {state.info.date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">{t.update_release_date}</span>
                <span className="text-sm text-white/80">{state.info.date}</span>
              </div>
            )}

            {state.info.size && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">{t.update_download_size}</span>
                <span className="text-sm text-white/80">
                  {Math.round(state.info.size / 1024 / 1024)} MB
                </span>
              </div>
            )}

            {state.info.body && (
              <div className="mt-4">
                <div className="text-sm font-medium text-white/80 mb-2">
                  {t.update_changelog}
                </div>
                <div className="text-xs text-white/50 bg-white/5 rounded-lg p-3 max-h-32 overflow-y-auto">
                  {state.info.body}
                </div>
              </div>
            )}

            {state.status === "downloading" && state.progress && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-white/60 mb-2">
                  <span>{t.update_download_size}</span>
                  <span>
                    {Math.round(state.progress.downloadedBytes / 1024 / 1024)} /{" "}
                    {Math.round(state.progress.totalBytes / 1024 / 1024)} MB ({state.progress.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${state.progress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {state.status === "installing" && (
              <div className="mt-4 text-center">
                <div className="text-sm text-blue-400">{t.update_status_installing}</div>
              </div>
            )}

            {state.status === "pending-restart" && (
              <div className="mt-4 text-center">
                <div className="text-sm text-yellow-400">
                  {t.update_status_pending_restart}
                </div>
              </div>
            )}

            {state.status === "failed" && state.error && (
              <div className="mt-4 bg-red-500/10 rounded-lg p-3">
                <div className="text-sm font-medium text-red-400">
                  {t.update_status_failed}
                </div>
                <div className="mt-1 text-xs text-white/45">{state.error}</div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-white/10 space-y-3">
          {!isUpdating && state.status !== "pending-restart" && state.status !== "failed" && (
            <button
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
              onClick={onUpdateNow}
            >
              {t.update_btn_update_now}
            </button>
          )}

          {state.status === "pending-restart" && (
            <button
              className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition-colors"
              onClick={() => {
                window.location.reload();
              }}
            >
              {t.update_btn_restart}
            </button>
          )}

          {state.status === "failed" && (
            <>
              <button
                className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                onClick={handleOpenReleasePage}
              >
                {t.update_btn_open_download}
              </button>
              <button
                className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                onClick={onLater}
              >
                {t.update_btn_later}
              </button>
            </>
          )}

          {!isUpdating && state.status !== "pending-restart" && state.status !== "failed" && (
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white/70 rounded-lg text-sm font-medium transition-colors"
                onClick={onSkip}
              >
                {t.update_btn_skip}
              </button>
              <button
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white/70 rounded-lg text-sm font-medium transition-colors"
                onClick={onLater}
              >
                {t.update_btn_later}
              </button>
            </div>
          )}

          <button
            className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition-colors"
            onClick={handleOpenReleasePage}
          >
            {t.update_btn_view_details}
          </button>
        </div>
      </div>
    </div>
  );
}