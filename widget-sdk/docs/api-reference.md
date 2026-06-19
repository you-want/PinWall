# PinWall Widget SDK — API Reference

## 生命周期

### `PinWall.onReady(callback: (config) => void)`

Widget 加载完成并收到宿主就绪信号时调用。

```typescript
PinWall.onReady(async (config) => {
  console.log('Settings:', config.settings);
  console.log('Locale:', config.locale);
});
```

### `PinWall.onDestroy(callback: () => void)`

Widget 即将销毁时调用。

```typescript
PinWall.onDestroy(() => {
  // cleanup
});
```

---

## Storage — 本地存储

需要 `storage` 权限。每个 Widget 有独立的存储空间。

### `PinWall.storage.get<T>(key: string): Promise<T | null>`

读取存储值。

### `PinWall.storage.set(key: string, value: any): Promise<void>`

写入存储值。

### `PinWall.storage.remove(key: string): Promise<void>`

删除指定键。

### `PinWall.storage.clear(): Promise<void>`

清空所有存储。

```typescript
// 示例
await PinWall.storage.set('count', 42);
const count = await PinWall.storage.get<number>('count'); // 42
```

---

## Settings — Widget 设置

读取用户在 PinWall 设置面板中配置的 Widget 参数。

### `PinWall.settings.getAll(): Promise<Record<string, any>>`

获取所有设置。

### `PinWall.settings.get<T>(key: string): Promise<T>`

获取指定设置。

### `PinWall.settings.onChange(callback): Unsubscribe`

监听设置变化。

```typescript
const unsub = PinWall.settings.onChange((key, newVal, oldVal) => {
  console.log(`${key} changed: ${oldVal} → ${newVal}`);
});
// 取消订阅
unsub();
```

---

## Theme — 主题

### `PinWall.theme.get(): Promise<ThemeConfig>`

获取当前主题配置。

```typescript
const theme = await PinWall.theme.get();
// {
//   mode: 'light',
//   colors: { primary: '#6366f1', background: '...', text: '#1a1a1a', ... },
//   fonts: { body: "'Inter Variable', ..." }
// }
```

### `PinWall.theme.onChange(callback): Unsubscribe`

监听主题变化。

---

## I18n — 国际化

需要 `i18n` 权限。

### `PinWall.i18n.getLocale(): Promise<string>`

获取当前语言环境 (`'zh'`, `'en'`, etc.)。

### `PinWall.i18n.setMessages(locale: string, messages: Record<string, string>): void`

注册语言包。

### `PinWall.i18n.t(key: string, params?: Record<string, string>): string`

翻译函数。

### `PinWall.i18n.onLocaleChange(callback): Unsubscribe`

监听语言切换。

```typescript
// 注册语言包
PinWall.i18n.setMessages('zh', { greeting: '你好，{name}！' });
PinWall.i18n.setMessages('en', { greeting: 'Hello, {name}!' });

// 使用翻译
const text = PinWall.i18n.t('greeting', { name: 'World' });
// 当前语言为 zh → '你好，World！'
```

---

## Notify — 通知

需要 `notify` 权限。

### `PinWall.notify(options: NotifyOptions): Promise<void>`

发送桌面通知。

```typescript
await PinWall.notify({
  title: '🍅 番茄完成！',
  body: '休息一下吧～',
});
```

---

## Cards — 卡片系统

需要 `cards` 权限。操作 PinWall 的卡片（便签）系统。

### `PinWall.cards.list(filter?): Promise<Card[]>`

获取卡片列表。

### `PinWall.cards.create(card: Partial<Card>): Promise<Card>`

创建新卡片。

### `PinWall.cards.update(id: string, patch: Partial<Card>): Promise<Card>`

更新卡片。

### `PinWall.cards.delete(id: string): Promise<void>`

删除卡片。

### `PinWall.cards.onCardChange(callback): Unsubscribe`

监听卡片变化。

---

## Events — 事件系统

需要 `events` 权限。

### `PinWall.events.on(event: string, callback): Unsubscribe`

监听应用事件。

### `PinWall.events.emit(event: string, payload?): void`

触发事件。

**可用事件：**
- `app:ready` — 应用就绪
- `card:created` — 卡片创建
- `card:deleted` — 卡片删除
- `settings:changed` — 设置变更
- `widget:installed` — 新 Widget 安装
- `widget:removed` — Widget 卸载

---

## App — 应用控制

需要 `app` 权限。

### `PinWall.app.openNewCardModal(): void`

打开新建卡片弹窗。

### `PinWall.app.arrangeCards(): void`

触发卡片整理。

### `PinWall.app.getVersion(): Promise<string>`

获取 PinWall 版本号。

### `PinWall.app.getLocale(): Promise<string>`

获取当前语言。

---

## AI — AI 能力

需要 `ai` 权限。调用 PinWall 内置的 AI 服务。

### `PinWall.ai.chat(messages: Message[]): Promise<string>`

AI 对话。

### `PinWall.ai.generate(prompt: string): Promise<string>`

AI 文本生成。

```typescript
const result = await PinWall.ai.generate('写一首关于春天的诗');
```

---

## System — 系统信息

需要 `system` 权限。

### `PinWall.system.getBattery(): Promise<BatteryInfo>`

获取电池信息。`{ level: number, charging: boolean }`

### `PinWall.system.getCPUUsage(): Promise<number>`

获取 CPU 使用率 (0~100)。

### `PinWall.system.getMemoryInfo(): Promise<MemoryInfo>`

获取内存信息。`{ total: number, used: number, free: number }`

### `PinWall.system.getDiskUsage(): Promise<DiskInfo>`

获取磁盘信息。

---

## Network — 网络代理

需要 `network` 权限。通过 PinWall 宿主代理发请求，避免 CORS 问题。

### `PinWall.network.get(url: string, options?): Promise<Response>`

GET 请求。

### `PinWall.network.post(url: string, body: any, options?): Promise<Response>`

POST 请求。

```typescript
const res = await PinWall.network.get('https://api.example.com/data');
const data = res.data;
```

---

## 通信协议

Widget 通过 `window.parent.postMessage` 与 PinWall 宿主通信：

**请求格式：**
```typescript
{
  type: 'request',
  id: string,        // 请求唯一 ID
  module: string,    // API 模块名
  method: string,    // 方法名
  args: any[],       // 参数列表
}
```

**响应格式：**
```typescript
{
  type: 'response',
  id: string,        // 对应请求 ID
  success: boolean,
  data?: any,        // 成功时的返回数据
  error?: string,    // 失败时的错误信息
}
```

**事件推送格式：**
```typescript
{
  type: 'event',
  event: string,     // 事件名
  payload?: any,     // 事件数据
}
```
