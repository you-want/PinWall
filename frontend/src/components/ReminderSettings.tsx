import { useState, useEffect } from 'react';
import { Bell, BellOff, Clock, Check, X } from 'lucide-react';
import {
  loadReminderConfig,
  saveReminderConfig,
  requestNotificationPermission,
  hasNotificationPermission,
  type ReminderConfig,
} from '@/utils/reminder';

interface ReminderSettingsProps {
  onClose: () => void;
}

export function ReminderSettings({ onClose }: ReminderSettingsProps) {
  const [config, setConfig] = useState<ReminderConfig>(loadReminderConfig);
  const [hasPermission, setHasPermission] = useState(hasNotificationPermission());
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    saveReminderConfig(config);
  }, [config]);

  const handleToggle = async () => {
    if (!hasPermission && config.enabled === false) {
      const granted = await requestNotificationPermission();
      setHasPermission(granted);
      if (!granted) {
        return;
      }
    }
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleTimeChange = (hour: number, minute: number) => {
    setConfig(prev => ({ ...prev, hour, minute }));
    setShowTimePicker(false);
  };

  const formatTime = (hour: number, minute: number): string => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">打卡提醒设置</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.enabled ? 'bg-amber-100' : 'bg-gray-100'}`}>
                {config.enabled ? (
                  <Bell className="w-5 h-5 text-amber-500" />
                ) : (
                  <BellOff className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-800">每日打卡提醒</p>
                <p className="text-sm text-gray-500">
                  {config.enabled ? `每天 ${formatTime(config.hour, config.minute)} 提醒打卡` : '点击开启提醒'}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggle}
              className={`relative w-12 h-6 rounded-full transition-colors ${config.enabled ? 'bg-amber-500' : 'bg-gray-300'}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.enabled ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>

          {config.enabled && (
            <div className="border-t border-gray-100 pt-4">
              <div
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setShowTimePicker(!showTimePicker)}
              >
                <Clock className="w-5 h-5 text-gray-400" />
                <span className="text-gray-700">提醒时间</span>
                <span className="ml-auto font-medium text-amber-600">{formatTime(config.hour, config.minute)}</span>
              </div>

              {showTimePicker && (
                <div className="mt-3 p-4 bg-gray-50 rounded-xl">
                  <div className="grid grid-cols-6 gap-2 mb-3">
                    {Array.from({ length: 24 }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => handleTimeChange(i, config.minute)}
                        className={`p-2 rounded-lg text-sm transition-colors ${
                          config.hour === i
                            ? 'bg-amber-500 text-white'
                            : 'hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {i.toString().padStart(2, '0')}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {[0, 15, 30, 45].map(m => (
                      <button
                        key={m}
                        onClick={() => handleTimeChange(config.hour, m)}
                        className={`p-2 rounded-lg text-sm transition-colors ${
                          config.minute === m
                            ? 'bg-amber-500 text-white'
                            : 'hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {m.toString().padStart(2, '0')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!hasPermission && (
            <div className="mt-4 p-3 bg-amber-50 rounded-xl flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-700">需要先开启浏览器通知权限</span>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium rounded-xl hover:from-amber-500 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}