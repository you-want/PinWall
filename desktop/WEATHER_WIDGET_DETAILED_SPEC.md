# PinWall 桌面天气模块详细设计文档

## 1. 文档定位

本文档是在 `WEATHER_WIDGET_REDESIGN_PLAN.md` 的基础上继续细化的实现前设计稿，目标是把“桌面天气模块改造需求”拆解到开发可执行层级。

本文档重点覆盖：

- UI 结构拆解
- 状态与数据模型
- 服务接口定义
- 页面交互流
- 文件级改造建议
- 分阶段开发任务清单
- 测试与验收细则

本文档默认以下 6 个产品决策已经确认：

1. 图 1 默认卡片展示 5 天摘要。
2. 图 2 展示未来 24 小时天气。
3. 图 3 首版支持删除已保存城市。
4. 图 3 保留“自动定位当前城市”入口。
5. 图 2 采用遮罩浮层。
6. 设置页移除现有“单城市输入框”。

---

## 2. 最终目标体验

### 2.1 视图层级

天气模块最终由三个层级组成：

1. `默认卡片`
   - 常驻在右侧边栏
   - 展示当前城市 + 当前温度 + 未来 5 天摘要
   - 点击后打开详情浮层

2. `详情浮层`
   - 在 `Wall` 主窗口内覆盖显示
   - 展示当前天气、24 小时、7 天信息
   - 右上角提供城市管理入口

3. `城市侧栏`
   - 从详情浮层右侧滑入
   - 支持搜索、切换、删除、自动定位
   - 展示已保存城市的天气摘要卡

### 2.2 信息优先级

默认卡片优先级：

- 当前城市
- 当前温度
- 当前天气图标
- 5 天趋势

详情浮层优先级：

- 当前天气总览
- 今日体感相关指标
- 未来 24 小时
- 未来 7 天

城市侧栏优先级：

- 搜索/新增城市
- 自动定位当前城市
- 已保存城市列表
- 删除城市

---

## 3. 模块架构总览

### 3.1 推荐分层

建议将天气模块拆成 4 层：

1. `持久化层`
   - 基于 `storage.ts`
   - 负责读取/保存天气配置

2. `服务层`
   - 基于 `weatherService.ts`
   - 负责城市搜索、自动定位、天气聚合查询、缓存

3. `容器层`
   - 天气父容器负责状态编排
   - 控制当前城市、详情浮层、城市侧栏、刷新行为

4. `展示层`
   - 默认卡片、详情面板、城市侧栏、列表项等纯 UI 组件

### 3.2 推荐结构图

```text
Wall
  └─ WeatherPanelContainer
      ├─ WeatherCompactCard
      ├─ WeatherDetailOverlay
      │   ├─ WeatherDetailHeader
      │   ├─ WeatherHourlyForecast
      │   ├─ WeatherDailyForecast
      │   └─ WeatherCityDrawer
      │       ├─ WeatherCitySearch
      │       ├─ WeatherLocationAction
      │       └─ WeatherSavedCityList
      └─ WeatherFeedbackLayer
```

### 3.3 容器职责

建议引入一个新的父级容器组件，例如：

```ts
WeatherPanelContainer
```

容器负责：

- 初始化当前天气配置
- 读取和维护当前活跃城市
- 拉取当前活跃城市的完整天气
- 拉取已保存城市的轻量摘要
- 控制详情浮层开关
- 控制城市侧栏开关
- 处理搜索、添加、切换、删除
- 与 `storage.ts` 同步

展示组件只负责：

- 根据 props 渲染
- 通过回调把事件抛给容器

---

## 4. UI 结构拆解

## 4.1 默认卡片 `WeatherCompactCard`

### 组件职责

- 常驻显示天气摘要
- 承担打开详情浮层的入口

### 建议结构

```text
WeatherCompactCard
  ├─ 顶部头图区域
  │   ├─ 城市名
  │   ├─ 当前温度
  │   ├─ 当前天气文案
  │   └─ 当前天气图标
  └─ 底部 5 天摘要区域
      ├─ 第 1 天
      ├─ 第 2 天
      ├─ 第 3 天
      ├─ 第 4 天
      └─ 第 5 天
```

### 展示字段

- 城市名
- 当前温度
- 当前天气文案
- 当前天气图标
- 5 天天气项
  - 标题：今天 / 明天 / `MM-DD`
  - 图标
  - 最低/最高温

### 交互

- 点击卡片主体：打开详情浮层
- 键盘聚焦后回车：打开详情浮层
- 加载中：显示卡片骨架
- 失败态：显示“天气加载失败，点击重试/查看”

### 尺寸建议

- 宽度约 340 到 380px
- 高度约 280 到 340px
- 保持适合边栏长期驻留

### 可访问性

- 卡片根节点使用 `button` 或具备 `role="button"`
- 支持 `Enter` 和 `Space`
- 点击热区大于等于 44px

---

## 4.2 详情浮层 `WeatherDetailOverlay`

### 组件职责

- 作为图 2 的承载层
- 展示完整天气信息
- 承载城市侧栏

### 建议结构

```text
WeatherDetailOverlay
  ├─ 遮罩层
  └─ 面板主体
      ├─ 顶部操作栏
      │   ├─ 标题区
      │   ├─ 城市管理按钮
      │   └─ 关闭按钮
      ├─ WeatherDetailHeader
      ├─ WeatherHourlyForecast
      └─ WeatherDailyForecast
```

### 打开方式

- 点击默认卡片打开

### 关闭方式

- 点击遮罩关闭
- 点击关闭按钮关闭
- 按 `Esc` 关闭

### 展示区域

#### A. 顶部操作栏

- 左侧：标题或城市名称
- 右侧：
  - 城市管理按钮
  - 关闭按钮

#### B. 天气总览头部 `WeatherDetailHeader`

展示：

- 城市名称
- 当前温度
- 当前天气现象
- 今日最低温
- 今日最高温
- 风向
- 风速
- 湿度
- 气压
- 大图标/插画

#### C. 未来 24 小时 `WeatherHourlyForecast`

展示：

- 24 个时间点
- 每个时间点图标
- 每个时间点温度

交互：

- 横向滚动
- 可拖动滚动或触控板滚动

#### D. 未来 7 天 `WeatherDailyForecast`

展示：

- 今天 + 后续 6 天
- 每天图标
- 最低/最高温

### 布局建议

- 面板宽度约 900 到 1080px
- 面板高度约 620 到 720px
- 顶部信息区固定
- 24 小时区域可横向滚动
- 7 天区域平铺展示

---

## 4.3 城市侧栏 `WeatherCityDrawer`

### 组件职责

- 作为图 3 的承载层
- 负责城市搜索、切换、删除、自动定位

### 建议结构

```text
WeatherCityDrawer
  ├─ 顶部搜索区
  │   ├─ 输入框
  │   ├─ 清空按钮
  │   └─ 搜索结果下拉
  ├─ 自动定位操作区
  └─ 已保存城市列表区
      ├─ 当前城市卡
      ├─ 普通城市卡
      └─ 删除按钮
```

### 核心能力

- 搜索城市
- 从候选中添加城市
- 切换当前城市
- 删除已保存城市
- 自动定位当前城市并切换

### 展示规则

每个已保存城市卡展示：

- 城市名
- 当前温度
- 当前天气图标
- 最低/最高温
- 未来 5 天简要走势
- 当前城市标识
- 删除按钮

### 删除规则

- 当前活跃城市也允许删除
- 删除当前活跃城市后：
  - 若列表还有其他城市，自动切换到列表第一项
  - 若列表为空，则尝试回退到自动定位城市
  - 若自动定位也失败，则进入空态

### 自动定位入口

建议单独作为一个操作项，文案示例：

- `定位当前城市`
- `使用当前位置`

点击后行为：

- 调用自动定位
- 成功后得到城市与坐标
- 如果该城市已存在，则切换为当前城市
- 如果该城市不存在，则新增后切换

---

## 5. 页面状态设计

## 5.1 UI 状态

建议容器层管理以下状态：

```ts
interface WeatherUiState {
  isDetailOpen: boolean;
  isCityDrawerOpen: boolean;
  searchKeyword: string;
  searchResults: WeatherCitySearchResult[];
  isSearching: boolean;
  searchError: string;
  isAutoLocating: boolean;
}
```

## 5.2 数据状态

```ts
interface WeatherDataState {
  activeCityId: string | null;
  activeBundle: WeatherBundle | null;
  savedCitySummaries: Record<string, WeatherCitySummary>;
  loadingActiveBundle: boolean;
  activeBundleError: string;
  refreshingSummaryIds: string[];
}
```

## 5.3 持久化状态

建议新增独立天气配置对象：

```ts
interface WeatherPreferences {
  enabled: boolean;
  activeCityId: string | null;
  cities: WeatherSavedCity[];
  useAutoLocation: boolean;
  lastAutoLocationCity: WeatherSavedCity | null;
  compactForecastDays: 5;
}
```

### 说明

- `enabled`
  - 天气模块总开关
- `activeCityId`
  - 当前正在查看和展示的主城市
- `cities`
  - 已保存城市列表
- `useAutoLocation`
  - 是否允许在无城市时自动定位
- `lastAutoLocationCity`
  - 最近一次成功定位的城市缓存
- `compactForecastDays`
  - 当前明确为 5，可先写死，也可预留配置位

---

## 6. 类型定义建议

## 6.1 设置层类型

建议在 `desktop/src/types/index.ts` 中新增以下类型：

```ts
export interface WeatherSavedCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
  source: "manual" | "auto";
  addedAt: number;
  lastViewedAt?: number;
}

export interface WeatherPreferences {
  enabled: boolean;
  activeCityId: string | null;
  cities: WeatherSavedCity[];
  useAutoLocation: boolean;
  lastAutoLocationCity: WeatherSavedCity | null;
  compactForecastDays: number;
}
```

并在 `Settings` 中新增：

```ts
weather?: WeatherPreferences;
```

首版暂时保留旧字段：

- `weatherCareEnabled`
- `weatherCity`

但新代码统一只读写 `settings.weather`。

## 6.2 服务层类型

建议新增：

```ts
export interface WeatherCitySearchResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
  displayName: string;
}

export interface HourlyWeatherData {
  time: string;
  weatherCode: number;
  description: string;
  temperature: number;
}

export interface WeatherCurrentDetails {
  temperature: number;
  weatherCode: number;
  description: string;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  pressure: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
}

export interface WeatherBundle {
  location: {
    city: string;
    lat: number;
    lon: number;
    country?: string;
    admin1?: string;
  };
  current: WeatherCurrentDetails;
  hourly: HourlyWeatherData[];
  daily: DailyWeatherData[];
  fetchedAt: number;
}

export interface WeatherCitySummary {
  cityId: string;
  cityName: string;
  temperature: number | null;
  weatherCode: number | null;
  description: string;
  temperatureMin: number | null;
  temperatureMax: number | null;
  dailyPreview: DailyWeatherData[];
  fetchedAt: number;
}
```

---

## 7. 设置迁移方案

## 7.1 迁移目标

把旧结构：

```ts
weatherCareEnabled?: boolean;
weatherCity?: string;
```

迁移到新结构：

```ts
weather?: WeatherPreferences;
```

## 7.2 迁移规则

当 `getSettings()` 读取历史配置时：

1. 如果 `parsed.weather` 不存在，则创建默认对象。
2. `weather.enabled` 优先取旧的 `weatherCareEnabled`，默认 `true`。
3. 如果旧 `weatherCity` 存在且非空：
   - 先构造一个占位城市对象
   - `id` 使用临时规则，例如 `legacy-${cityName}`
   - `source` 设为 `manual`
   - `activeCityId` 指向该对象
4. 如果旧 `weatherCity` 为空：
   - `cities = []`
   - `activeCityId = null`
5. `useAutoLocation` 默认 `true`
6. `compactForecastDays` 默认 `5`

## 7.3 首次升级后的补全策略

旧城市字符串迁移进来后，因为没有经纬度，需要在首次天气加载时补全：

1. 按城市名 geocode
2. geocode 成功：
   - 更新该城市项的 `lat/lon/country/admin1`
3. geocode 失败：
   - 保留城市名
   - 该城市项标记为待修复状态或在运行时跳过

推荐更简单的做法：

- 迁移时就调用 geocode
- 成功则直接生成完整对象
- 失败则不写入 `cities`，只保留空列表

---

## 8. 服务接口设计

## 8.1 新增与调整的服务函数

建议在 `desktop/src/services/weatherService.ts` 中提供以下接口。

### 城市搜索

```ts
searchWeatherCities(keyword: string): Promise<WeatherCitySearchResult[]>
```

用途：

- 图 3 输入框联想搜索

行为：

- 关键词为空时直接返回空数组
- 对中文、英文搜索都兼容
- 最多返回 8 到 10 条候选

### 自动定位

```ts
detectCurrentWeatherCity(): Promise<WeatherCitySearchResult | null>
```

用途：

- 图 3 的自动定位按钮
- 首次无城市时兜底

### 聚合天气

```ts
getWeatherBundleByCity(city: WeatherCitySearchResult | WeatherSavedCity): Promise<WeatherBundle | null>
getWeatherBundleByCoords(coords: WeatherCoords): Promise<WeatherBundle | null>
```

用途：

- 图 1
- 图 2
- 图 3 当前城市切换后的完整数据

### 城市摘要

```ts
getWeatherSummaryForCity(city: WeatherSavedCity): Promise<WeatherCitySummary | null>
```

用途：

- 图 3 已保存城市卡片列表

---

## 8.2 Open-Meteo 请求建议

### 搜索接口

使用：

```text
https://geocoding-api.open-meteo.com/v1/search
```

建议参数：

- `name`
- `count=8`
- `language=zh`
- `format=json`

### 聚合天气接口

使用：

```text
https://api.open-meteo.com/v1/forecast
```

建议请求字段：

- `current=temperature_2m,relative_humidity_2m,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m`
- `hourly=temperature_2m,weather_code`
- `daily=weather_code,temperature_2m_max,temperature_2m_min`
- `forecast_days=7`
- `timezone=auto`

然后在前端从 `hourly` 中裁出未来 24 小时数据。

---

## 8.3 服务返回规则

### 搜索结果去重

若结果中有重名城市，应按以下规则生成 `displayName`：

- `城市`
- `城市, 省/州`
- `城市, 省/州, 国家`

### 当前天气高低温

Open-Meteo 的 `current` 不直接给当天高低温时，从 `daily[0]` 注入：

- `temperatureMin = daily[0].temperatureMin`
- `temperatureMax = daily[0].temperatureMax`

### 风向展示

服务层返回风向角度即可，文案转换放到展示层工具函数中，例如：

- 0° -> 北风
- 45° -> 东北风

---

## 9. 缓存与刷新策略

## 9.1 缓存目标

避免以下问题：

- 打开详情时重复请求
- 图 3 多城市卡片同时请求过多
- 搜索切换时界面闪烁

## 9.2 建议缓存粒度

### 活跃城市完整天气

- Key：`bundle:${cityId}`
- TTL：10 分钟

### 已保存城市摘要

- Key：`summary:${cityId}`
- TTL：30 分钟

### 城市搜索结果

- Key：`search:${keyword}`
- TTL：5 分钟

## 9.3 刷新时机

### 默认卡片

- 首次渲染
- 活跃城市变化
- 手动触发刷新
- 10 分钟以上缓存失效

### 详情浮层

- 打开时校验缓存
- 如果缓存过期，则后台刷新

### 城市侧栏摘要卡

- 打开侧栏时拉取一次
- 若摘要缓存有效则直接使用

### 自动轮询

首版可以继续沿用当前 30 分钟轮询，但建议改为：

- 只刷新活跃城市完整天气
- 不主动轮询所有已保存城市摘要

---

## 10. 容器层状态流

## 10.1 初始化流程

```text
WeatherPanelContainer mount
  -> 读取 settings.weather
  -> 若 activeCityId 存在，加载 activeBundle
  -> 若没有 activeCityId 且 useAutoLocation 为 true，尝试自动定位
  -> 自动定位成功后写入 settings.weather 并加载天气
  -> 若仍无城市，则显示空态卡片
```

## 10.2 打开详情流程

```text
点击默认卡片
  -> isDetailOpen = true
  -> 如果 activeBundle 不存在或缓存过期
     -> 拉取 activeBundle
  -> 渲染详情浮层
```

## 10.3 打开侧栏流程

```text
点击详情右上角按钮
  -> isCityDrawerOpen = true
  -> 读取已保存城市摘要缓存
  -> 补拉缺失的 summary
```

## 10.4 搜索并添加城市流程

```text
输入关键词
  -> 300ms 防抖
  -> 调用 searchWeatherCities
  -> 返回候选列表

点击候选城市
  -> 如果已存在城市列表中
     -> activeCityId = existing.id
  -> 如果不存在
     -> 生成 WeatherSavedCity
     -> push 到 cities
     -> activeCityId = new.id
  -> 持久化 settings.weather
  -> 拉取新的 activeBundle
  -> 更新默认卡片和详情浮层
```

## 10.5 删除城市流程

```text
点击删除按钮
  -> 弹出轻量确认 or 二次点击确认
  -> 从 cities 中删除目标城市
  -> 如果删除的是 activeCityId
     -> 选择新的 activeCityId
     -> 优先剩余第一项
     -> 为空时尝试 lastAutoLocationCity
     -> 再为空时 activeCityId = null
  -> 持久化
  -> 更新 activeBundle / summary 缓存
```

---

## 11. 文件级改造建议

## 11.1 新增文件建议

建议新增：

- `desktop/src/components/weather/WeatherPanelContainer.tsx`
- `desktop/src/components/weather/WeatherCompactCard.tsx`
- `desktop/src/components/weather/WeatherDetailOverlay.tsx`
- `desktop/src/components/weather/WeatherDetailHeader.tsx`
- `desktop/src/components/weather/WeatherHourlyForecast.tsx`
- `desktop/src/components/weather/WeatherDailyForecast.tsx`
- `desktop/src/components/weather/WeatherCityDrawer.tsx`
- `desktop/src/components/weather/WeatherCitySearch.tsx`
- `desktop/src/components/weather/WeatherSavedCityList.tsx`
- `desktop/src/components/weather/WeatherSavedCityItem.tsx`
- `desktop/src/components/weather/index.ts`
- `desktop/src/services/weatherCache.ts`
- `desktop/src/utils/weatherFormat.ts`

## 11.2 需要修改的现有文件

### `desktop/src/pages/Wall.tsx`

修改点：

- 把原有 `WeatherCard` 替换为新的天气容器组件
- 在页面树中挂载详情浮层

### `desktop/src/components/WeatherCard.tsx`

处理建议：

- 不继续在原文件上强堆逻辑
- 可以保留为兼容壳，内部代理到新组件
- 或直接废弃，改为新的目录结构

### `desktop/src/services/weatherService.ts`

修改点：

- 新增搜索接口
- 新增聚合天气接口
- 扩展当前天气字段
- 抽出 WMO code 转描述 / 图标映射工具

### `desktop/src/services/storage.ts`

修改点：

- 新增 `weather` 默认配置
- 增加历史配置迁移逻辑
- 增加辅助更新函数：
  - `updateWeatherPreferences`
  - `upsertWeatherCity`
  - `removeWeatherCity`
  - `setActiveWeatherCity`

### `desktop/src/types/index.ts`

修改点：

- 新增天气配置与天气服务类型
- 为 `Settings` 增加 `weather`

### `desktop/src/components/SettingsPanel.tsx`

修改点：

- 删除现有单城市输入框
- 保留天气总开关
- 保留自动定位总开关
- 可展示当前主城市摘要

### `desktop/src/App.css`

修改点：

- 旧 `.weather-card` 样式不再承担全部职责
- 新增详情浮层、侧栏、小时列表、5 日卡等样式

---

## 12. 组件 Props 合约建议

## 12.1 `WeatherCompactCard`

```ts
interface WeatherCompactCardProps {
  cityName: string;
  loading: boolean;
  error: string;
  currentTemp: number | null;
  currentDescription: string;
  currentWeatherCode: number | null;
  previewDays: DailyWeatherData[];
  onOpenDetail: () => void;
  onRetry?: () => void;
}
```

## 12.2 `WeatherDetailOverlay`

```ts
interface WeatherDetailOverlayProps {
  open: boolean;
  loading: boolean;
  error: string;
  bundle: WeatherBundle | null;
  isCityDrawerOpen: boolean;
  onClose: () => void;
  onOpenCityDrawer: () => void;
  onCloseCityDrawer: () => void;
  onRetry?: () => void;
  cityDrawer: React.ReactNode;
}
```

## 12.3 `WeatherCityDrawer`

```ts
interface WeatherCityDrawerProps {
  open: boolean;
  keyword: string;
  searchResults: WeatherCitySearchResult[];
  isSearching: boolean;
  searchError: string;
  savedCities: WeatherSavedCity[];
  summaries: Record<string, WeatherCitySummary>;
  activeCityId: string | null;
  isAutoLocating: boolean;
  onKeywordChange: (value: string) => void;
  onSelectSearchResult: (city: WeatherCitySearchResult) => void;
  onSelectSavedCity: (cityId: string) => void;
  onDeleteSavedCity: (cityId: string) => void;
  onUseCurrentLocation: () => void;
  onClose: () => void;
}
```

---

## 13. 页面行为矩阵

## 13.1 默认卡片行为

| 场景 | 展示 |
|---|---|
| 有活跃城市，有数据 | 正常展示城市、温度、5 天摘要 |
| 有活跃城市，加载中 | 显示骨架卡 |
| 有活跃城市，加载失败 | 显示错误文案和重试入口 |
| 没有活跃城市 | 显示“点击设置城市”空态 |

## 13.2 详情浮层行为

| 场景 | 展示 |
|---|---|
| 打开时已有缓存 | 直接展示，再后台校验是否刷新 |
| 打开时无缓存 | 骨架屏 |
| 请求失败 | 错误态 + 重试 |
| 按下 `Esc` | 关闭浮层 |
| 点击遮罩 | 关闭浮层 |

## 13.3 城市侧栏行为

| 场景 | 展示 |
|---|---|
| 未输入关键词 | 展示已保存城市列表 |
| 正在搜索 | 下拉显示 loading |
| 搜索失败 | 下拉显示错误文案 |
| 无结果 | 下拉显示空态 |
| 已保存城市为空 | 展示定位入口和搜索引导 |

---

## 14. 视觉与样式拆解

## 14.1 色彩方向

建议统一为浅色低饱和方案：

- 面板底色：浅蓝灰
- 顶部头图：蓝色渐变
- 文本主色：深灰蓝
- 次级文本：低对比灰蓝

## 14.2 组件级样式建议

### 默认卡片

- 大圆角
- 顶部渐变块承载温度与图标
- 底部 5 日摘要等宽布局

### 详情浮层

- 独立容器
- 阴影较轻
- 遮罩层透明度中低
- 内部以分区卡片组织

### 城市侧栏

- 固定宽度约 320 到 380px
- 与详情面板右侧吸附
- 城市列表卡片保持统一高度

## 14.3 动效建议

- 打开详情：`fade + scale`
- 打开侧栏：`slide-in-right`
- 切换城市：内容交叉淡入，不做大范围位移

---

## 15. 异常态与空态设计

## 15.1 默认卡片空态

文案建议：

- `暂无天气城市，点击查看并添加`

按钮建议：

- `查看天气`

## 15.2 定位失败

文案建议：

- `暂时无法定位当前城市，请手动搜索`

## 15.3 搜索失败

文案建议：

- `搜索失败，请稍后重试`

## 15.4 完整天气加载失败

文案建议：

- `天气信息加载失败`
- `请检查网络后重试`

按钮建议：

- `重新加载`

---

## 16. 开发任务清单

## Phase 1：类型与持久化

### 目标

- 完成新天气配置结构
- 完成设置迁移

### 任务

- 在 `types/index.ts` 新增天气相关类型
- 在 `storage.ts` 增加 `weather` 默认值
- 在 `getSettings()` 增加迁移逻辑
- 增加天气配置更新函数

### 验收

- 老用户 `weatherCity` 不丢失
- 新用户默认有 `weather.enabled = true`
- 设置文件写入结构正确

## Phase 2：服务层升级

### 目标

- 支持搜索、自动定位、聚合查询、摘要查询

### 任务

- 扩展 `weatherService.ts`
- 新增缓存工具 `weatherCache.ts`
- 新增格式化工具 `weatherFormat.ts`
- 补齐服务层单测

### 验收

- 可按城市搜索候选
- 可获取未来 24 小时和 7 天数据
- 可返回城市摘要数据

## Phase 3：默认卡片重构

### 目标

- 实现图 1

### 任务

- 创建 `WeatherCompactCard`
- 创建 `WeatherPanelContainer`
- 替换 `Wall.tsx` 中旧天气组件入口
- 接入活跃城市和 5 天摘要

### 验收

- 边栏正常显示新卡片
- 点击可打开详情浮层

## Phase 4：详情浮层

### 目标

- 实现图 2

### 任务

- 创建 `WeatherDetailOverlay`
- 创建 `WeatherDetailHeader`
- 创建 `WeatherHourlyForecast`
- 创建 `WeatherDailyForecast`
- 接入遮罩关闭、`Esc` 关闭、重试逻辑

### 验收

- 正常展示当前天气、24 小时、7 天
- 浮层打开关闭流畅

## Phase 5：城市侧栏

### 目标

- 实现图 3

### 任务

- 创建 `WeatherCityDrawer`
- 创建搜索组件和保存城市列表组件
- 接入添加、切换、删除、自动定位
- 接入摘要缓存

### 验收

- 搜索并添加城市可用
- 删除城市逻辑正确
- 自动定位可用
- 当前卡片与详情同步刷新

## Phase 6：设置页与体验收尾

### 目标

- 清理旧入口
- 统一体验

### 任务

- 从 `SettingsPanel.tsx` 移除单城市输入框
- 保留天气总开关和自动定位开关
- 统一样式和空态文案
- 补齐组件测试和页面测试

### 验收

- 设置页不再出现旧单城市输入
- 天气模块入口统一

---

## 17. 测试计划

## 17.1 单元测试

建议新增或修改：

- `weatherService.test.ts`
  - 搜索城市
  - 聚合天气解析
  - 24 小时裁剪
  - 自动定位结果解析
- `storage` 相关测试
  - 旧配置迁移
  - 添加/删除/切换城市

## 17.2 组件测试

建议新增：

- `WeatherCompactCard.test.tsx`
- `WeatherDetailOverlay.test.tsx`
- `WeatherCityDrawer.test.tsx`
- `WeatherPanelContainer.test.tsx`

覆盖场景：

- 默认卡片展示 5 天
- 点击打开详情
- 打开城市侧栏
- 搜索并选择城市
- 删除当前城市后的回退逻辑

## 17.3 页面级测试

建议补充：

- `Wall.test.tsx`
  - 天气容器在侧边栏渲染
  - 详情浮层挂载正确

## 17.4 手动测试清单

- 首次启动且无城市时
- 旧版本升级后城市迁移
- 自动定位成功
- 自动定位失败
- 搜索中文城市
- 搜索英文城市
- 添加多个城市后切换
- 删除当前城市
- 删除最后一个城市
- 弱网/断网情况
- `Esc` 关闭详情
- 点击遮罩关闭详情

---

## 18. 验收标准细化

实现完成后，应满足以下详细标准：

1. 主桌面右侧边栏显示新的天气默认卡片。
2. 默认卡片展示当前天气和未来 5 天摘要。
3. 点击默认卡片后，在主窗口内以遮罩浮层方式打开天气详情。
4. 详情中展示当前天气、今日高低温、湿度、风速、风向、气压。
5. 详情中展示未来 24 小时天气，并支持横向浏览。
6. 详情中展示未来 7 天天气。
7. 右上角按钮可打开城市侧栏。
8. 城市侧栏支持搜索、添加、切换、删除和自动定位。
9. 切换城市后，默认卡片和详情内容同步更新。
10. 删除当前城市后的回退逻辑正确。
11. 设置页不再保留旧的单城市输入框。
12. 老用户历史 `weatherCity` 配置可平滑迁移。

---

## 19. 建议的实现顺序结论

为了减少返工，建议严格按下面顺序推进：

1. 先改类型和持久化。
2. 再改服务层聚合接口。
3. 再上默认卡片。
4. 再上详情浮层。
5. 最后上城市侧栏和删除逻辑。
6. 设置页收尾和旧入口清理放在最后。

这样做的原因：

- 数据结构先稳定，UI 不会来回改。
- 聚合接口先稳定，详情页不会边做边返工。
- 默认卡片最容易先出效果，便于快速验收视觉方向。
- 城市侧栏是交互最复杂的一层，适合放在后面集中处理。

---

## 20. 下一步建议

如果你认可这份详细设计，下一步最合适的是继续输出一份“实施级任务单”，把每个 Phase 再拆成：

- 具体文件改动列表
- 每个文件新增/删除/替换哪些代码块
- 先后依赖关系
- 每步改完如何验证

这样下一轮就可以直接进入编码执行，而不是再停留在产品设计层。
