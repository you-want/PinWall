import { useState, useCallback } from 'react';
import {
  developerLogin,
  developerRegister,
  submitWidget,
  checkForUpdates,
} from '../services/marketplaceService';
import { useWidgetStore } from '../stores/widgetStore';

interface DeveloperPortalPanelProps {
  onClose: () => void;
  lang: string;
}

type PortalTab = 'login' | 'register' | 'submit' | 'updates';

export function DeveloperPortalPanel({
  onClose,
  lang,
}: DeveloperPortalPanelProps) {
  const isZh = lang === 'zh';
  const [tab, setTab] = useState<PortalTab>('login');
  const [token, setToken] = useState<string | null>(null);
  const [devName, setDevName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleLogin = async (email: string, password: string) => {
    clearMessages();
    try {
      const res = await developerLogin(email, password);
      setToken(res.accessToken);
      setDevName(res.developer.name);
      setTab('submit');
      setSuccess(isZh ? '登录成功！' : 'Login successful!');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleRegister = async (
    email: string,
    name: string,
    password: string,
  ) => {
    clearMessages();
    try {
      await developerRegister(email, name, password);
      setSuccess(
        isZh
          ? '注册成功！请使用邮箱登录。'
          : 'Registration successful! Please login with your email.',
      );
      setTab('login');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  const handleSubmitWidget = async (data: {
    name: string;
    slug: string;
    description: string;
    category: string;
    widgetType: string;
  }) => {
    if (!token) return;
    clearMessages();
    try {
      await submitWidget(token, data);
      setSuccess(
        isZh
          ? '提交成功！等待审核。'
          : 'Submitted! Awaiting review.',
      );
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[520px] max-h-[80vh] bg-[#1e1e2e] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {isZh ? '🛠 开发者中心' : '🛠 Developer Portal'}
          </h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-6">
          {(
            [
              { id: 'login', label: isZh ? '登录' : 'Login' },
              { id: 'register', label: isZh ? '注册' : 'Register' },
              { id: 'submit', label: isZh ? '提交扩展' : 'Submit Widget' },
              { id: 'updates', label: isZh ? '检查更新' : 'Check Updates' },
            ] as Array<{ id: PortalTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                clearMessages();
              }}
              className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'text-indigo-400 border-indigo-400'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className="px-6 pt-3">
            {error && (
              <div className="text-xs px-3 py-2 rounded-lg bg-red-500/15 text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="text-xs px-3 py-2 rounded-lg bg-green-500/15 text-green-400">
                {success}
              </div>
            )}
          </div>
        )}

        {/* Developer status */}
        {devName && (
          <div className="px-6 pt-3 text-xs text-white/40">
            {isZh ? '已登录为' : 'Logged in as'}{' '}
            <span className="text-indigo-400">{devName}</span>
            <button
              onClick={() => {
                setToken(null);
                setDevName(null);
                setTab('login');
              }}
              className="ml-2 text-white/30 hover:text-white/60 underline"
            >
              {isZh ? '退出' : 'Logout'}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'login' && (
            <LoginForm isZh={isZh} onLogin={handleLogin} />
          )}
          {tab === 'register' && (
            <RegisterForm isZh={isZh} onRegister={handleRegister} />
          )}
          {tab === 'submit' && (
            <SubmitWidgetForm
              isZh={isZh}
              hasToken={!!token}
              onSubmit={handleSubmitWidget}
              onGoLogin={() => setTab('login')}
            />
          )}
          {tab === 'updates' && <UpdateChecker isZh={isZh} />}
        </div>
      </div>
    </div>
  );
}

function LoginForm({
  isZh,
  onLogin,
}: {
  isZh: boolean;
  onLogin: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="space-y-3">
      <InputField
        label={isZh ? '邮箱' : 'Email'}
        type="email"
        value={email}
        onChange={setEmail}
      />
      <InputField
        label={isZh ? '密码' : 'Password'}
        type="password"
        value={password}
        onChange={setPassword}
      />
      <button
        onClick={() => onLogin(email, password)}
        disabled={!email || !password}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50 transition-colors"
      >
        {isZh ? '登录' : 'Login'}
      </button>
    </div>
  );
}

function RegisterForm({
  isZh,
  onRegister,
}: {
  isZh: boolean;
  onRegister: (
    email: string,
    name: string,
    password: string,
  ) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="space-y-3">
      <InputField
        label={isZh ? '开发者名称' : 'Developer Name'}
        value={name}
        onChange={setName}
      />
      <InputField
        label={isZh ? '邮箱' : 'Email'}
        type="email"
        value={email}
        onChange={setEmail}
      />
      <InputField
        label={isZh ? '密码' : 'Password'}
        type="password"
        value={password}
        onChange={setPassword}
      />
      <button
        onClick={() => onRegister(email, name, password)}
        disabled={!email || !name || !password}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50 transition-colors"
      >
        {isZh ? '注册' : 'Register'}
      </button>
    </div>
  );
}

function SubmitWidgetForm({
  isZh,
  hasToken,
  onSubmit,
  onGoLogin,
}: {
  isZh: boolean;
  hasToken: boolean;
  onSubmit: (data: {
    name: string;
    slug: string;
    description: string;
    category: string;
    widgetType: string;
  }) => void;
  onGoLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('utility');

  if (!hasToken) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-3">🔒</div>
        <p className="text-sm text-white/50 mb-4">
          {isZh
            ? '请先登录开发者账号'
            : 'Please login as a developer first'}
        </p>
        <button
          onClick={onGoLogin}
          className="px-4 py-2 rounded-lg text-sm bg-indigo-500/80 hover:bg-indigo-500 text-white transition-colors"
        >
          {isZh ? '去登录' : 'Go to Login'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InputField
        label={isZh ? '扩展名称' : 'Widget Name'}
        value={name}
        onChange={setName}
      />
      <InputField
        label={isZh ? '唯一标识 (slug)' : 'Slug (unique id)'}
        value={slug}
        onChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="my-awesome-widget"
      />
      <div>
        <label className="block text-xs text-white/50 mb-1">
          {isZh ? '描述' : 'Description'}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-500/50 resize-none transition-colors"
          placeholder={
            isZh
              ? '描述你的小组件功能...'
              : 'Describe your widget...'
          }
        />
      </div>
      <div>
        <label className="block text-xs text-white/50 mb-1">
          {isZh ? '分类' : 'Category'}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none cursor-pointer"
        >
          <option value="utility" className="bg-[#1e1e2e]">
            {isZh ? '工具' : 'Utility'}
          </option>
          <option value="productivity" className="bg-[#1e1e2e]">
            {isZh ? '效率' : 'Productivity'}
          </option>
          <option value="beautification" className="bg-[#1e1e2e]">
            {isZh ? '美化' : 'Beautification'}
          </option>
          <option value="entertainment" className="bg-[#1e1e2e]">
            {isZh ? '娱乐' : 'Entertainment'}
          </option>
          <option value="system" className="bg-[#1e1e2e]">
            {isZh ? '系统' : 'System'}
          </option>
        </select>
      </div>
      <button
        onClick={() =>
          onSubmit({
            name,
            slug,
            description,
            category,
            widgetType: 'community',
          })
        }
        disabled={!name || !slug || !description}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50 transition-colors"
      >
        {isZh ? '提交审核' : 'Submit for Review'}
      </button>
    </div>
  );
}

function UpdateChecker({ isZh }: { isZh: boolean }) {
  const { widgets } = useWidgetStore();
  const [checking, setChecking] = useState(false);
  const [updates, setUpdates] = useState<
    Array<{
      id: string;
      currentVersion: string;
      latestVersion: string;
    }>
  >([]);
  const [checked, setChecked] = useState(false);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setUpdates([]);
    try {
      const installed = widgets.map((w) => ({
        id: w.manifest.id,
        version: w.manifest.version,
      }));
      const result = await checkForUpdates(installed);
      setUpdates(result);
      setChecked(true);
    } catch {
      // silently fail - marketplace might be offline
      setChecked(true);
    } finally {
      setChecking(false);
    }
  }, [widgets]);

  if (widgets.length === 0) {
    return (
      <div className="text-center py-8 text-white/40">
        <div className="text-2xl mb-2">📦</div>
        <p className="text-sm">
          {isZh ? '尚未安装任何小组件' : 'No widgets installed'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-indigo-500/80 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors mb-4"
      >
        {checking
          ? isZh
            ? '检查中...'
            : 'Checking...'
          : isZh
            ? '检查所有更新'
            : 'Check All Updates'}
      </button>

      {checked && updates.length === 0 && (
        <div className="text-center py-6 text-white/40">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-sm">
            {isZh ? '所有小组件已是最新版本' : 'All widgets are up to date'}
          </p>
        </div>
      )}

      {updates.length > 0 && (
        <div className="space-y-2">
          {updates.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/5"
            >
              <div>
                <div className="text-sm text-white font-medium">{u.id}</div>
                <div className="text-xs text-white/40 mt-0.5">
                  v{u.currentVersion} → v{u.latestVersion}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                {isZh ? '有更新' : 'Update'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Show installed widgets list */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <h4 className="text-xs font-semibold text-white/40 mb-2 uppercase tracking-wider">
          {isZh ? '已安装' : 'Installed'} ({widgets.length})
        </h4>
        <div className="space-y-1">
          {widgets.map((w) => (
            <div
              key={w.manifest.id}
              className="flex items-center justify-between text-xs text-white/40 py-1"
            >
              <span>{w.manifest.name}</span>
              <span className="font-mono">v{w.manifest.version}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-500/50 transition-colors"
      />
    </div>
  );
}
