# canbox-core

The core injection module for Canbox. Through Electron's `-r` preload mechanism, it gives every Canbox app a **unified runtime environment** and a set of **optional shared services**.

[简体中文](./README_zh-CN.md)

## Architecture

```
          ┌──────────────────────────────┐
          │       electron runtime        │
          │                              │
          │  electron -r canbox-core/     │
          │    injection.js APP/          │
          │    --app-id={appId}           │
          │                              │
          │  ┌────────────────────────┐   │
          │  │    canbox-core          │   │
          │  │                        │   │
          │  │  ┌─ Implicit ─────────┐ │   │
          │  │  │  shared userData   │ │   │
          │  │  │  Users data root   │ │   │
          │  │  │  appId resolution  │ │   │
          │  │  │  path aliases      │ │   │
          │  │  │  shared logging    │ │   │
          │  │  └────────────────────┘ │   │
          │  │                        │   │
          │  │  ┌─ Explicit API ─────┐ │   │
          │  │  │  store / db        │ │   │
          │  │  │  misc              │ │   │
          │  │  └────────────────────┘ │   │
          │  └────────────────────────┘   │
          │                              │
          │  ┌────────────────────────┐   │
          │  │  APP (any Electron app)│   │
          │  │  - uses API → benefits │   │
          │  │  - no API → oblivious  │   │
          │  └────────────────────────┘   │
          └──────────────────────────────┘
```

**canbox-core is an optional service layer, not a framework.** Apps get the infrastructure (shared userData, shared logging) without any "adaptation", and get the shared services (key-value store, document database, platform info) by calling the APIs explicitly.

**Design principle:** canbox-core only provides capabilities an app cannot build on its own, or that would break platform conventions (such as data isolation) if it did. Capabilities that take a single line of Electron code — creating windows, dialogs, shortcuts, elevation, shell — are deliberately not provided here, so that core does not intrude on app development and apps never depend on core.

## Project structure

```
canbox-core/
├── package.json              # npm package metadata
├── injection.js              # entry: electron -r preload script (three-stage setup)
├── lib/                      # internal modules
│   ├── env.js                # environment initialization (implicit)
│   ├── logger.js             # shared logging (log4js)
│   ├── store.js              # key-value store (electron-store, black-box isolated per appId)
│   ├── db.js                 # document database (PouchDB, black-box isolated per appId)
│   └── misc.js               # platform environment / diagnostics
├── .gitignore
└── README.md
```

## Launching

```bash
# Launch canbox-manager (preinstalled in the product bundle)
electron -r ./canbox-core/injection.js ./canbox-manager/ --app-id=canbox-manager

# Launch a user-installed app
electron -r ./canbox-core/injection.js {Users}/apps/{appId}/ --app-id={appId}

# Launch a manually imported app (any path)
electron -r ./canbox-core/injection.js /path/to/some-app/ --app-id={appId}
```

`--app-id` defines the data isolation boundary: store/db are automatically routed to `data/{appId}/`, so apps never pass an appId when calling.

## Implicit capabilities (transparent to apps)

| Capability            | Description                                   | App awareness |
| --------------------- | --------------------------------------------- | ------------- |
| Shared userData       | `~/.config/canbox/`, config.json lives here   | Unaware       |
| Users data root       | Relocatable as a whole via customDataRoot     | Unaware       |
| appId resolution      | Read from the `--app-id` argument             | Unaware       |
| Path alias            | `@canbox-core` → `./lib/`                     | Unaware       |
| Shared logging        | Written to `{Users}/logs/canbox.log`          | Unaware       |
| module-alias          | `@canbox-core` alias registration             | Unaware       |

## Explicit API (called by apps)

The explicit API is registered via `ipcMain.handle` and invoked from an app's preload.js with `ipcRenderer.invoke`. All store/db calls are black-box: the app does not pass an appId, and core routes automatically from `--app-id` to `data/{appId}/`.

### store — key-value store (4 channels)

Data is physically isolated in `data/{appId}/store/{name}.json`.

```javascript
// preload.js
store: {
    get: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
    set: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value),
    delete: (name, key) => ipcRenderer.invoke('canbox.store.delete', name, key),
    clear: (name) => ipcRenderer.invoke('canbox.store.clear', name)
}
```

| Method | Arguments        | Returns    |
| ------ | ---------------- | ---------- |
| get    | name, key        | any\| null |
| set    | name, key, value | true       |
| delete | name, key        | true       |
| clear  | name             | true       |

### db — document database (7 channels)

A PouchDB wrapper; data is physically isolated in `data/{appId}/db/`.

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

| Method      | Arguments | Returns              |
| ----------- | --------- | -------------------- |
| put         | doc       | doc (with _id/_rev)  |
| get         | docId     | doc                  |
| allDocs     | options   | { rows }             |
| bulkDocs    | docs      | results[]            |
| remove      | doc       | { ok }               |
| find        | query     | { docs }             |
| createIndex | index     | { result }           |

### misc — platform environment / diagnostics (5 channels)

Provides only the platform/environment information a renderer process cannot retrieve directly.

```javascript
misc: {
    hello: () => ipcRenderer.invoke('canbox.misc.hello'),
    getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
    getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion'),
    getCorePath: () => ipcRenderer.invoke('canbox.misc.getCorePath'),
    getPlatformInfo: () => ipcRenderer.invoke('canbox.misc.getPlatformInfo')
}
```

| Method          | Returns | Description                          |
| --------------- | ------- | ------------------------------------ |
| hello           | string  | Tests whether core is loaded         |
| getUserData     | string  | Path of the Users data directory     |
| getCoreVersion  | string  | canbox-core version                  |
| getCorePath     | string  | canbox-core root directory path      |
| getPlatformInfo | object  | platform/arch/versions               |

## Apps do not need to depend on canbox-core

An app's `package.json` **does not** need to declare `canbox-core` as a dependency. An app can:

- **Run standalone** — `electron APP/`, using its own Electron binary and not sharing the canbox environment
- **Run in canbox mode** — `electron -r canbox-core/injection.js APP/ --app-id={appId}`, automatically getting the canbox environment

The app code is **identical** in both modes, with no conditional compilation. When using the store/db provided by canbox-core, the IPC channels are `canbox.store.*` / `canbox.db.*` / `canbox.misc.*`; when not using them, the app is completely unaware.

## License

Apache-2.0
