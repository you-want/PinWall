import { useI18n } from "../../i18n";
import type { UpdateState, UpdateChannel } from "../../types";

interface UpdateCardProps {
  state: UpdateState;
  autoCheckUpdates: boolean;
  updateChannel: string;
  lastCheckAt: number;
  onCheckUpdates: () => void;
  onToggleAutoCheck: (enabled: boolean) => void;
  onChannelChange: (channel: UpdateChannel) => void;
  onShowUpdateDialog: () => void;
}

export function UpdateCard({
  state,
  autoCheckUpdates,
  updateChannel,
  lastCheckAt,
  onCheckUpdates,
  onToggleAutoCheck,
  onChannelChange,
  onShowUpdateDialog,
}: UpdateCardProps) {
  const { t, lang } = useI18n();

  const formatLastCheck = (timestamp: number) => {
    if (!timestamp) return t.update_status_idle;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return t.update_status_checking;
    if (diffMins < 60) return `${diffMins}${lang === "zh" ? "分钟前" : "m ago"}`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}${lang === "zh" ? "小时前" : "h ago"}`;
    return date.toLocaleDateString(lang);
  };

  const getStatusText = () => {
    switch (state.status) {
      case "idle":
        return t.update_status_idle;
      case "checking":
        return t.update_status_checking;
      case "up-to-date":
        return t.update_status_up_to_date;
      case "available":
        return t.update_status_available;
      case "downloading":
        return t.update_status_downloading;
      case "installing":
        return t.update_status_installing;
      case "pending-restart":
        return t.update_status_pending_restart;
      case "failed":
        return t.update_status_failed;
      default:
        return t.update_status_idle;
    }
  };

  const getStatusColor = () => {
    switch (state.status) {
      case "available":
        return "text-green-400";
      case "downloading":
      case "installing":
        return "text-blue-400";
      case "pending-restart":
        return "text-yellow-400";
      case "failed":
        return "text-red-400";
      case "up-to-date":
        return "text-white/60";
      default:
        return "text-white/45";
    }
  };

  return (
    <div className="ap-group">
      <div className="ap-group-label">{t.update_title}</div>
      <div className="ap-card">
        <div className="ap-row ap-row-toggle">
          <div className="min-w-0 pr-4">
            <div className="ap-row-label">{t.update_current_version}</div>
            <div className="mt-1 text-xs text-white/60">v{state.currentVersion}</div>
          </div>
          <div className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>

        <div className="ap-divider" />

        <div className="ap-row ap-row-toggle">
          <div className="min-w-0 pr-4">
            <div className="ap-row-label">{t.update_auto_check}</div>
            <div className="mt-1 text-xs text-white/45">{t.update_auto_check_desc}</div>
          </div>
          <label className="ap-switch">
            <input
              type="checkbox"
              checked={autoCheckUpdates}
              onChange={(e) => onToggleAutoCheck(e.target.checked)}
            />
            <span className="ap-switch-track">
              <span className="ap-switch-thumb" />
            </span>
          </label>
        </div>

        <div className="ap-divider" />

        <div className="ap-row">
          <div className="min-w-0 flex-1">
            <div className="ap-row-label">{t.update_channel}</div>
            <div className="ap-segmented mt-1.5">
              <button
                className={`ap-segment ${updateChannel === "stable" ? "active" : ""}`}
                onClick={() => onChannelChange("stable")}
              >
                {t.update_stable}
              </button>
              <button
                className={`ap-segment ${updateChannel === "beta" ? "active" : ""}`}
                onClick={() => onChannelChange("beta")}
              >
                {t.update_beta}
              </button>
            </div>
          </div>
        </div>

        <div className="ap-divider" />

        <div className="ap-row">
          <div className="min-w-0 flex-1">
            <div className="ap-row-label">{t.update_last_check}</div>
            <div className="mt-1 text-xs text-white/45">{formatLastCheck(lastCheckAt)}</div>
          </div>
          <button
            className="ap-btn px-4 py-2 text-xs"
            onClick={onCheckUpdates}
            disabled={state.status === "checking" || state.status === "downloading" || state.status === "installing"}
          >
            {state.status === "checking"
              ? t.update_status_checking
              : t.update_check_now}
          </button>
        </div>

        {state.status === "available" && state.info && (
          <>
            <div className="ap-divider" />
            <div className="ap-row bg-green-500/10 rounded-lg p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-green-400">
                  {t.update_available_title}: v{state.info.version}
                </div>
                {state.info.date && (
                  <div className="mt-1 text-xs text-white/45">
                    {t.update_release_date}: {state.info.date}
                  </div>
                )}
              </div>
              <button
                className="ap-btn px-4 py-2 text-xs bg-green-500 hover:bg-green-600"
                onClick={onShowUpdateDialog}
              >
                {t.update_btn_update_now}
              </button>
            </div>
          </>
        )}

        {state.status === "downloading" && state.progress && (
          <>
            <div className="ap-divider" />
            <div className="ap-field">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>{t.update_download_size}</span>
                <span>
                  {Math.round(state.progress.downloadedBytes / 1024 / 1024)} /{" "}
                  {Math.round(state.progress.totalBytes / 1024 / 1024)} MB
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.progress.percentage}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-white/45 text-right">
                {state.progress.percentage}%
              </div>
            </div>
          </>
        )}

        {state.status === "pending-restart" && (
          <>
            <div className="ap-divider" />
            <div className="ap-row bg-yellow-500/10 rounded-lg p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-yellow-400">
                  {t.update_status_pending_restart}
                </div>
              </div>
              <button
                className="ap-btn px-4 py-2 text-xs bg-yellow-500 hover:bg-yellow-600"
                onClick={() => {
                  window.location.reload();
                }}
              >
                {t.update_btn_restart}
              </button>
            </div>
          </>
        )}

        {state.status === "failed" && state.error && (
          <>
            <div className="ap-divider" />
            <div className="ap-row bg-red-500/10 rounded-lg p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-red-400">
                  {t.update_status_failed}
                </div>
                <div className="mt-1 text-xs text-white/45">{state.error}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}