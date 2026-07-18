/**
 * canbox-core/lib/canbox-meta.js — .canbox-app 元数据读写
 *
 * .canbox-app 是 APP 接入 canbox 平台的配置文件（JSON），与 package.json 分离：
 *   - package.json：APP 作为独立 Electron 应用的标准元数据（npm 生态）
 *   - .canbox-app：canbox 平台配置（electron 版本声明、APP 类型等）
 *
 * 删除 .canbox-app，APP 即回归纯 Electron 应用，不影响其独立性。
 *
 * 文件格式：
 *   {
 *       "version": 1,
 *       "electron": { "range": "^42.5.1" },
 *       "type": "native",           // native | web
 *       "webApp": null               // type=web 时填 web 应用配置
 *   }
 */

const fs = require('fs');
const path = require('path');

const META_FILE = '.canbox-app';
const META_FORMAT_VERSION = 1;

/**
 * 读取 APP 的 canbox 元数据
 * @param {string} appDir - APP 根目录
 * @returns {Object|null} 元数据对象，文件不存在或解析失败返回 null
 */
function readCanboxMeta(appDir) {
    const metaPath = path.join(appDir, META_FILE);
    if (!fs.existsSync(metaPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch (e) {
        return null;
    }
}

/**
 * 写入 APP 的 canbox 元数据
 * @param {string} appDir - APP 根目录
 * @param {Object} meta - 元数据对象
 */
function writeCanboxMeta(appDir, meta) {
    const metaPath = path.join(appDir, META_FILE);
    const content = Object.assign({ version: META_FORMAT_VERSION }, meta);
    fs.writeFileSync(metaPath, JSON.stringify(content, null, 4), 'utf-8');
}

/**
 * 创建默认的 native APP 元数据
 * @param {string} electronRange - electron 版本范围，如 '^42.5.1'
 * @returns {Object}
 */
function createNativeMeta(electronRange) {
    return {
        version: META_FORMAT_VERSION,
        electron: { range: electronRange },
        type: 'native',
        webApp: null
    };
}

/**
 * 创建默认的 web APP 元数据
 * @param {string} electronRange - electron 版本范围
 * @param {Object} webAppConfig - web 应用配置（url、isPwa、menuBar 等）
 * @returns {Object}
 */
function createWebMeta(electronRange, webAppConfig) {
    return {
        version: META_FORMAT_VERSION,
        electron: { range: electronRange },
        type: 'web',
        webApp: webAppConfig
    };
}

module.exports = {
    readCanboxMeta,
    writeCanboxMeta,
    createNativeMeta,
    createWebMeta,
    META_FILE,
    META_FORMAT_VERSION
};
