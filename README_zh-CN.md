# canbox-core

Canbox 核心注入模块。通过 Electron `-r` 预加载机制，为所有 Canbox APP 提供**统一运行时环境**与**可选公共服务**。

[English Documentation](./README.md)

## 架构理念

```
          ┌──────────────────────────────┐
          │       electron 运行时          │
          │                              │
          │  electron -r canbox-core/     │
          │    injection.js APP/          │
          │    --app-id={appId}           │
          │                              │
          │  ┌────────────────────────┐   │
          │  │    canbox-core          │   │
          │  │                        │   │
          │  │  ┌─ 隐性能力 ────────┐  │   │
          │  │  │  统一 userData    │  │   │
          │  │  │  业务数据根 Users  │  │   │
          │  │  │  appId 解析        │  │   │
          │  │  │  路径别名          │  │   │
          │  │  │  统一日志          │  │   │
          │  │  └──────────────────┘  │   │
          │  │                        │   │
          │  │  ┌─ 显性 API ────────┐  │   │
          │  │  │  store / db       │  │   │
          │  │  │  misc             │  │   │
          │  │  └──────────────────┘  │   │
          │  └────────────────────────┘   │
          │                              │
          │  ┌────────────────────────┐   │
          │  │  APP（任意 Electron 应用）│   │
          │  │  - 调 API → 获得便利    │   │
          │  │  - 不调 API → 无感知    │   │
          │  └────────────────────────┘   │
          └──────────────────────────────┘
```

**canbox-core 是可选服务提供层，不是框架。** APP 无需做任何"适配"即可享受基础设施（统一 userData、统一日志），主动调用 API 即可获得公共服务（键值存储、文档数据库、平台信息）。

**设计原则：** canbox-core 只提供 APP 自己做不了、或做起来会破坏平台约定（如数据隔离）的能力。窗口创建、对话框、快捷键、提权、shell 等 APP 一行 Electron 代码即可完成的能力，不再由 core 提供，避免侵入 APP 开发、避免让 APP 离不开 core。

## 项目结构

```
canbox-core/
├── package.json              # npm 包元数据
├── injection.js              # 入口：electron -r 预加载脚本（三阶段编排）
├── lib/                      # 内部模块
│   ├── env.js                # 环境初始化（隐性能力）
│   ├── logger.js             # 统一日志（log4js）
│   ├── store.js              # 键值存储（electron-store，按 appId 黑盒隔离）
│   ├── db.js                 # 文档数据库（PouchDB，按 appId 黑盒隔离）
│   ├── misc.js               # 平台环境/诊断信息
│   └── whats-new.js          # 更新内容（lastSeenVersion + CHANGELOG 解析）
├── .gitignore
├── README.md
└── README_zh-CN.md
```

## 启动方式

```bash
# 启动 canbox-manager（产品包预装）
electron -r ./canbox-core/injection.js ./canbox-manager/ --app-id=canbox-manager

# 启动用户安装的 APP
electron -r ./canbox-core/injection.js {Users}/apps/{appId}/ --app-id={appId}

# 启动用户手动导入的 APP（任意路径）
electron -r ./canbox-core/injection.js /path/to/some-app/ --app-id={appId}
```

`--app-id` 决定数据隔离边界：store/db 自动路由到 `data/{appId}/`，APP 调用时无需传 appId。

## 隐性能力（对 APP 透明）

| 能力             | 说明                                    | APP 是否感知 |
| ---------------- | --------------------------------------- | ------------ |
| 统一 userData    | `~/.config/canbox/`，config.json 在此 | 不感知       |
| 业务数据根 Users | 可由 customDataRoot 整体搬迁            | 不感知       |
| appId 解析       | 从`--app-id` 参数获取                 | 不感知       |
| 路径别名         | `@canbox-core` → `./lib/`          | 不感知       |
| 统一日志         | 写入`{Users}/logs/canbox.log`         | 不感知       |
| module-alias     | `@canbox-core` 别名注册               | 不感知       |

## 显性 API（APP 主动调用）

显性 API 通过 `ipcMain.handle` 注册，APP 在 preload.js 用 `ipcRenderer.invoke` 调用。所有 store/db 调用为黑盒式——APP 不传 appId，由 core 从 `--app-id` 自动路由到 `data/{appId}/`。

### store — 键值存储（4 个通道）

数据物理隔离于 `data/{appId}/store/{name}.json`。

```javascript
// preload.js
store: {
    get: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
    set: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value),
    delete: (name, key) => ipcRenderer.invoke('canbox.store.delete', name, key),
    clear: (name) => ipcRenderer.invoke('canbox.store.clear', name)
}
```

| 方法   | 参数             | 返回       |
| ------ | ---------------- | ---------- |
| get    | name, key        | any\| null |
| set    | name, key, value | true       |
| delete | name, key        | true       |
| clear  | name             | true       |

### db — 文档数据库（7 个通道）

PouchDB 封装，数据物理隔离于 `data/{appId}/db/`。

```javascript
db: {
    put: (doc) => ipcRenderer.invoke('canbox.db.put', doc),
    get: (docId) => ipcRenderer.invoke('canbox.db.get', docId),
    allDocs: (options) => ipcRenderer.invoke('canbox.db.allDocs', options),
    bulkDocs: (docs) => ipcRenderer.invoke('canbox.db.bulkDocs', docs),
    remove: (doc) => ipcRenderer.invoke('canbox.db.remove', doc),
    find: (query) => ipcRenderer.invoke('canbox.db.find', query),
    createIndex: (index) => ipcRenderer.invoke('canbox.db.createIndex', index)
}
```

| 方法        | 参数    | 返回               |
| ----------- | ------- | ------------------ |
| put         | doc     | doc（含 _id/_rev） |
| get         | docId   | doc                |
| allDocs     | options | { rows }           |
| bulkDocs    | docs    | results[]          |
| remove      | doc     | { ok }             |
| find        | query   | { docs }           |
| createIndex | index   | { result }         |

### misc — 平台环境/诊断信息（5 个通道）

仅提供渲染进程无法直接获取的平台/环境信息。

```javascript
misc: {
    hello: () => ipcRenderer.invoke('canbox.misc.hello'),
    getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
    getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion'),
    getCorePath: () => ipcRenderer.invoke('canbox.misc.getCorePath'),
    getPlatformInfo: () => ipcRenderer.invoke('canbox.misc.getPlatformInfo')
}
```

| 方法            | 返回   | 说明                   |
| --------------- | ------ | ---------------------- |
| hello           | string | 测试 core 是否加载     |
| getUserData     | string | Users 业务数据目录路径 |
| getCoreVersion  | string | canbox-core 版本号     |
| getCorePath     | string | canbox-core 根目录路径 |
| getPlatformInfo | object | platform/arch/versions |

### whatsNew — 更新内容（3 个通道）

APP 升级后告知用户"改了什么"的通用能力：按 APP 记录 `lastSeenVersion`、读取并解析 APP 根目录的 `CHANGELOG.md`、聚合期间所有版本段落（跨多版本升级也完整）。**APP 不需要自己实现解析与去重逻辑。**

```javascript
whatsNew: {
    check: (options) => ipcRenderer.invoke('canbox.whatsNew.check', options),
    ack: (version) => ipcRenderer.invoke('canbox.whatsNew.ack', version),
    getVersion: () => ipcRenderer.invoke('canbox.whatsNew.getVersion')
}
```

`check` 参数（全部可选）：`{ version, maxSections, changelog, changelogPath }`

- `version`：当前 APP 版本，默认 `app.getVersion()`
- `maxSections`：最多返回的版本段落数，默认 3
- `changelog`：直接传入 changelog 文本（优先于 `changelogPath`）
- `changelogPath`：默认 `{appPath}/CHANGELOG.md`

返回：`{ success, show, currentVersion, lastSeenVersion, sections[] }`，`sections` 为 `{ version, date, body }[]`。

约定：changelog 条目格式为 `## [x.y.z] - YYYY-MM-DD`，正文中文一行、英文一行成对书写；渲染层可用 `splitBilingualBody(body, locale)` 筛选当前语言。首次运行（无记录）只写入当前版本、不返回待展示内容。

模块也可在主进程直接引用：`require(corePath + '/lib/whats-new')`，使用 `check` / `ack` / `parseChangelog` / `splitBilingualBody`。

## APP 无需依赖 canbox-core

APP 的 `package.json` **不需要**声明 `canbox-core` 为依赖。APP 可以：

- **独立运行** — `electron APP/`，用自己的 Electron 二进制，不共享 canbox 环境
- **canbox 模式运行** — `electron -r canbox-core/injection.js APP/ --app-id={appId}`，自动获得 canbox 环境

两种方式下 APP 代码**完全相同**，无需任何条件编译。使用 canbox-core 提供的 store/db/whatsNew 时，IPC 通道为 `canbox.store.*` / `canbox.db.*` / `canbox.misc.*` / `canbox.whatsNew.*`；不使用则无感知。

## 许可证

Apache-2.0
