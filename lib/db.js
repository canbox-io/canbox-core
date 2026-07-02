/**
 * canbox-core/lib/db.js — 文档数据库模块
 *
 * 封装 PouchDB，存储到 {userData}/db/ 目录
 * 提供三个数据库：
 *   - core:    核心数据（设置、元数据等）
 *   - apps:    APP 相关数据
 *   - history: 操作历史记录
 */

const path = require('path');

let _db = null;

/**
 * 获取 db 单例
 * 首次调用时自动初始化
 *
 * @param {string} userData - userData 目录路径
 * @returns {{ core, apps, history }}
 */
function get(userData) {
    if (!_db) {
        const PouchDB = require('pouchdb');
        PouchDB.plugin(require('pouchdb-find'));

        const dbDir = path.join(userData, 'db');
        _db = {
            core:    new PouchDB(path.join(dbDir, 'core')),
            apps:    new PouchDB(path.join(dbDir, 'apps')),
            history: new PouchDB(path.join(dbDir, 'history'))
        };
    }
    return _db;
}

/**
 * 获取指定名称的数据库实例
 * @param {object} db - db 单例对象
 * @param {string} dbName - 数据库名称
 * @returns {import('pouchdb')}
 */
function getTarget(db, dbName) {
    return db[dbName] || db.core;
}

/**
 * 注册 db 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {string} userData
 */
function register(ipcMain, userData) {
    ipcMain.handle('canbox.db.put', async (_e, dbName, doc) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        const result = await target.put(doc);
        return result;
    });

    ipcMain.handle('canbox.db.get', async (_e, dbName, docId) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        return target.get(docId);
    });

    ipcMain.handle('canbox.db.allDocs', async (_e, dbName, options) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        return target.allDocs(options);
    });

    ipcMain.handle('canbox.db.bulkDocs', async (_e, dbName, docs) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        return target.bulkDocs(docs);
    });

    ipcMain.handle('canbox.db.remove', async (_e, dbName, doc) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        return target.remove(doc);
    });

    ipcMain.handle('canbox.db.find', async (_e, dbName, query) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        return target.find(query);
    });

    ipcMain.handle('canbox.db.createIndex', async (_e, dbName, index) => {
        const db = get(userData);
        const target = getTarget(db, dbName);
        return target.createIndex(index);
    });
}

module.exports = { get, register };
