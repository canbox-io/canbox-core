/**
 * canbox-core/lib/db.js — 文档数据库模块
 *
 * 沿用旧架构的物理隔离模型：
 *   - APP 级 db：{Users}/data/{appId}/db/（每个 APP 独立，按 appId 物理隔离）
 *   - 平台级 db：{Users}/db/{history,fileTask}/（平台自身用）
 *
 * APP 调用 canbox.db.xxx() 不需要传 appId（黑盒），由 env 注入的 appId 自动路由。
 * 平台级 db 通过 getPlatformDb(name) 在主进程直接引用（manager 等）。
 *
 * IPC 签名（黑盒式，APP 不传 appId、不传 dbName）：
 *   canbox.db.put(doc)
 *   canbox.db.get(docId)
 *   canbox.db.find(query)
 *   canbox.db.allDocs(options)
 *   canbox.db.bulkDocs(docs)
 *   canbox.db.remove(doc)
 *   canbox.db.createIndex(index)
 */

const path = require('path');
const fs = require('fs');

let _pouchInitialized = false;
let PouchDB = null;

function initPouch() {
    if (_pouchInitialized) return;
    PouchDB = require('pouchdb');
    PouchDB.plugin(require('pouchdb-find'));
    _pouchInitialized = true;
}

// APP 级 db 缓存：appId → PouchDB
const _appDbCache = {};

/**
 * 获取指定 APP 的文档数据库实例
 * @param {string} appId - APP id
 * @param {string} dataPath - Users/data 路径
 * @returns {import('pouchdb')}
 */
function getAppDb(appId, dataPath) {
    if (!appId) throw new Error('appId is not set, cannot access db');
    if (!_appDbCache[appId]) {
        initPouch();
        const dbDir = path.join(dataPath, appId, 'db');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        _appDbCache[appId] = new PouchDB(path.join(dbDir, 'db'), { auto_compaction: true });
    }
    return _appDbCache[appId];
}

// 平台级 db 缓存
let _platformDb = null;

/**
 * 获取平台级数据库实例（供 manager 等主进程代码直接调用）
 * @param {string} usersPath - Users 路径
 * @returns {{ history, fileTask }}
 */
function getPlatformDb(usersPath) {
    if (!_platformDb) {
        initPouch();
        const dbDir = path.join(usersPath, 'db');
        _platformDb = {
            history:  new PouchDB(path.join(dbDir, 'history'), { auto_compaction: true }),
            fileTask: new PouchDB(path.join(dbDir, 'fileTask'), { auto_compaction: true })
        };
    }
    return _platformDb;
}

/**
 * 注册 db 相关 IPC handlers（APP 级，黑盒式）
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} env - env 模块导出（含 appId、usersPath）
 */
function register(ipcMain, env) {
    const dataPath = path.join(env.usersPath, 'data');

    ipcMain.handle('canbox.db.put', async (_e, doc) => {
        return getAppDb(env.appId, dataPath).put(doc);
    });

    ipcMain.handle('canbox.db.get', async (_e, docId) => {
        return getAppDb(env.appId, dataPath).get(docId);
    });

    ipcMain.handle('canbox.db.allDocs', async (_e, options) => {
        return getAppDb(env.appId, dataPath).allDocs(options);
    });

    ipcMain.handle('canbox.db.bulkDocs', async (_e, docs) => {
        return getAppDb(env.appId, dataPath).bulkDocs(docs);
    });

    ipcMain.handle('canbox.db.remove', async (_e, doc) => {
        return getAppDb(env.appId, dataPath).remove(doc);
    });

    ipcMain.handle('canbox.db.find', async (_e, query) => {
        return getAppDb(env.appId, dataPath).find(query);
    });

    ipcMain.handle('canbox.db.createIndex', async (_e, index) => {
        return getAppDb(env.appId, dataPath).createIndex(index);
    });
}

module.exports = { register, getAppDb, getPlatformDb };
