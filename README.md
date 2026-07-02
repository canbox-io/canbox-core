# canbox-core

Canbox 核心注入模块。通过 Electron `-r` 预加载机制，为所有 Canbox APP 提供**统一运行时环境**与**可选公共服务**。

## 架构理念

```
          ┌──────────────────────────────┐
          │       electron 运行时          │
          │                              │
          │  electron -r canbox-core/     │
          │    injection.js APP/          │
          │                              │
          │  ┌────────────────────────┐   │
          │  │    canbox-core          │   │
          │  │                        │   │
          │  │  ┌─ 隐性能力 ────────┐  │   │
          │  │  │  统一 userData    │  │   │
          │  │  │  统一日志          │  │   │
          │  │  │  路径别名          │  │   │
          │  │  │  崩溃处理          │  │   │
          │  │  └──────────────────┘  │   │
          │  │                        │   │
          │  │  ┌─ 显性 API ────────┐  │   │
          │  │  │  store / db       │  │   │
          │  │  │  dialog / window  │  │   │
          │  │  │  lifecycle        │  │   │
          │  │  │  shortcut / sudo  │  │   │
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

**canbox-core 是一个环境，不是一个框架。** APP 无需做任何"适配"即可享受基础设施（统一 userData、统一日志），主动调用 API 即可获得公共服务（存储、数据库、对话框等）。

## 项目结构

```
canbox-core/
├── package.json              # npm 包元数据
├── injection.js              # 入口：electron -r 预加载脚本
├── lib/                      # 内部模块（按需拆分）
│   ├── env.js                # 环境初始化
│   ├── logger.js             # 统一日志
│   ├── store.js              # electron-store 封装
│   ├── db.js                 # PouchDB 封装
│   ├── dialog.js             # 原生对话框
│   ├── window.js             # 窗口管理 / 通知
│   ├── lifecycle.js          # 生命周期
│   ├── shortcut.js           # 全局快捷键
│   ├── sudo.js               # 提权执行
│   └── misc.js               # 杂项功能
├── .gitignore
└── README.md
```

## 产品包结构（供最终用户使用）

```
canbox-{version}-{platform}/
├── electron/                  # Electron 运行时（二进制 + 资源文件）
│   ├── electron               # Electron 可执行文件
│   ├── resources/             # Electron 资源
│   ├── locales/               # 多语言资源
│   └── ...
├── canbox-core/               # 核心注入模块
│   ├── package.json
│   ├── injection.js
│   ├── lib/
│   └── node_modules/          # 运行时依赖
├── canbox-manager/            # 管理器 APP（唯一预装 APP）
│   ├── package.json           # { "name": "canbox-manager", "main": "main.js" }
│   ├── main.js
│   ├── preload.js
│   └── build/                 # 构建后的前端资源
└── canbox-manager.desktop     # Linux .desktop 启动器
```

产品包解压即用，无需安装脚本。**canbox-manager 是产品包中唯一的预装 APP。** 其他 APP 由用户通过 manager 的「导入已有 APP」或「仓库管理」页面下载安装，存放于用户数据目录外部。

### 用户数据目录结构

```
{user-data}/                   # app.setPath('userData') 指向的目录
├── canbox.json                # electron-store 持久化数据
├── db/
│   ├── core/                  # 核心数据库（设置、操作历史等）
│   └── apps/                  # APP 数据
├── apps/                      # 🆕 用户安装的 APP 存放位置
│   ├── imagebox/              # 从 repo 下载的 APP
│   ├── my-tools/              # 用户手动导入的 APP
│   └── ...
├── logs/
│   └── canbox.log             # 统一日志文件
└── cache/                     # 临时缓存
```

**注意：** `canbox-core` 仓库**不包含**任何 APP 源码。`canbox-manager` 是独立仓库，通过构建流程聚合到产品包中。

## 启动方式

```bash
# 启动 canbox-manager（产品包预装）
./electron/electron -r ./canbox-core/injection.js ./canbox-manager/

# 启动用户安装的 APP
./electron/electron -r ./canbox-core/injection.js {user-data}/apps/imagebox/

# 启动用户手动导入的 APP（任意路径）
./electron/electron -r ./canbox-core/injection.js /path/to/some-app/

# APP 不使用 canbox API → 仅享受隐性能力，无感知
# APP 使用 canbox API → 额外获得 store/db/dialog 等公共服务
```

### 用户数据隔离

canbox-core 设置 `app.setPath('userData', '${user-data}' )`，所有通过此方式启动的 APP 共享同一数据目录：

```
user-data/
├── canbox.json               # electron-store 持久化数据
├── db/
│   ├── core/                 # 核心数据库（设置等）
│   ├── apps/                 # APP 数据
│   └── history/              # 操作历史
├── logs/
│   └── canbox.log            # 统一日志文件
└── cache/                    # 临时缓存
```

> 如果 APP 使用自己的 Electron 独立启动（不通过 canbox-core），则会使用 Electron 默认 userData 路径，彼此互不影响。

## 隐性能力（对 APP 透明）

| 能力 | 说明 | APP 是否感知 |
|------|------|-------------|
| 统一 userData | `app.setPath('userData')` 指向共享目录 | 不感知 |
| 统一日志 | `log4js` 写入 `user-data/logs/canbox.log` | 不感知 |
| 路径别名 | `@canbox-core` → `./lib/` | 不感知 |
| 环境变量 | `CANBOX_USER_DATA`、`CANBOX_HOME` | 不感知 |

## 显性 API（APP 主动调用）

### store — 键值存储

```javascript
// preload.js / renderer
await window.api.canbox.store.set('imagebox', 'theme', 'dark');
const theme = await window.api.canbox.store.get('imagebox', 'theme');
await window.api.canbox.store.delete('imagebox', 'theme');
```

### db — 文档数据库

```javascript
// PouchDB 封装，支持 put / get / allDocs / bulkDocs / remove / find / createIndex
await window.api.canbox.db.put('apps', { _id: 'settings', theme: 'dark' });
const doc = await window.api.canbox.db.get('apps', 'settings');
const all = await window.api.canbox.db.allDocs('apps', { include_docs: true });
```

### dialog — 原生对话框

```javascript
const result = await window.api.canbox.dialog.showMessageBox({
    type: 'info',
    message: '确认操作？'
});
```

### window — 窗口管理 / 通知

```javascript
await window.api.canbox.window.createWindow({ width: 800, height: 600 });
await window.api.canbox.window.notification({ title: '完成', body: '操作已成功' });
```

### lifecycle — 生命周期

```javascript
await window.api.canbox.lifecycle.registerCloseCallback();
```

### shortcut — 全局快捷键

```javascript
await window.api.canbox.shortcut.register('Alt+Shift+X');
await window.api.canbox.shortcut.isRegistered('Alt+Shift+X');
await window.api.canbox.shortcut.unregister('Alt+Shift+X');
```

### sudo — 提权执行

```javascript
const result = await window.api.canbox.sudo.exec('whoami');
```

### misc — 杂项

```javascript
const greeting = await window.api.canbox.misc.hello();
await window.api.canbox.misc.openUrl('https://example.com');
const userData = await window.api.canbox.misc.getUserData();
const version = await window.api.canbox.misc.getCoreVersion();
```

## APP 开发指南

### preload.js 暴露 canbox API

```javascript
// APP 的 preload.js
const { contextBridge, ipcRenderer } = require('electron');

const canboxAPI = {
    store: {
        get: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
        set: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value),
        delete: (name, key) => ipcRenderer.invoke('canbox.store.delete', name, key),
        has: (name, key) => ipcRenderer.invoke('canbox.store.has', name, key)
    },
    db: {
        put: (dbName, doc) => ipcRenderer.invoke('canbox.db.put', dbName, doc),
        get: (dbName, docId) => ipcRenderer.invoke('canbox.db.get', dbName, docId),
        allDocs: (dbName, options) => ipcRenderer.invoke('canbox.db.allDocs', dbName, options),
        bulkDocs: (dbName, docs) => ipcRenderer.invoke('canbox.db.bulkDocs', dbName, docs),
        remove: (dbName, doc) => ipcRenderer.invoke('canbox.db.remove', dbName, doc),
        find: (dbName, query) => ipcRenderer.invoke('canbox.db.find', dbName, query),
        createIndex: (dbName, index) => ipcRenderer.invoke('canbox.db.createIndex', dbName, index)
    },
    dialog: {
        showMessageBox: (options) => ipcRenderer.invoke('canbox.dialog.showMessageBox', options),
        showOpenDialog: (options) => ipcRenderer.invoke('canbox.dialog.showOpenDialog', options),
        showSaveDialog: (options) => ipcRenderer.invoke('canbox.dialog.showSaveDialog', options)
    },
    window: {
        createWindow: (options) => ipcRenderer.invoke('canbox.window.createWindow', options),
        notification: (options) => ipcRenderer.invoke('canbox.window.notification', options)
    },
    lifecycle: {
        registerCloseCallback: () => ipcRenderer.invoke('canbox.lifecycle.registerCloseCallback')
    },
    shortcut: {
        register: (accelerator, options) => ipcRenderer.invoke('canbox.shortcut.register', accelerator, options),
        unregister: (accelerator) => ipcRenderer.invoke('canbox.shortcut.unregister', accelerator),
        isRegistered: (accelerator) => ipcRenderer.invoke('canbox.shortcut.isRegistered', accelerator)
    },
    sudo: {
        exec: (command, options) => ipcRenderer.invoke('canbox.sudo.exec', command, options)
    },
    misc: {
        hello: () => ipcRenderer.invoke('canbox.misc.hello'),
        openUrl: (url) => ipcRenderer.invoke('canbox.misc.openUrl', url),
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
        getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion')
    }
};

contextBridge.exposeInMainWorld('canboxAPI', canboxAPI);
```

### APP 无需依赖 canbox-core

APP 的 `package.json` **不需要**声明 `canbox-core` 为依赖。APP 可以：

- **独立运行** — `electron APP/`，用自己的 Electron 二进制，不共享 anybox 环境
- **canbox 模式运行** — `electron -r canbox-core/injection.js APP/`，自动获得 canbox 环境

两种方式下 APP 代码**完全相同**，无需任何条件编译。
