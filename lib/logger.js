/**
 * canbox-core/lib/logger.js — 统一日志模块
 *
 * 使用 log4js，输出到 {userData}/logs/canbox.log
 * 开发环境下同时输出到 console，日志级别 debug
 */

const path = require('path');
const fs = require('fs');

/** @type {import('log4js').Logger|null} */
let _logger = null;

/**
 * 初始化日志系统
 * 必须在 app.whenReady() 之后调用
 *
 * @param {string} userData - userData 目录路径
 * @returns {import('log4js').Logger}
 */
function init(userData) {
    const logDir = path.join(userData, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const log4js = require('log4js');
    log4js.configure({
        appenders: {
            file: {
                type: 'file',
                filename: path.join(logDir, 'canbox.log'),
                maxLogSize: 10485760,  // 10MB
                backups: 5,
                keepFileExt: true
            },
            console: { type: 'console' }
        },
        categories: {
            default: {
                appenders: ['file', 'console'],
                level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
            }
        }
    });

    _logger = log4js.getLogger('canbox-core');
    _logger.info('[canbox-core] Logger initialized, userData: %s', userData);
    _logger.info('[canbox-core] Node %s, Electron %s, Platform %s',
        process.versions.node,
        process.versions.electron,
        process.platform
    );

    return _logger;
}

/**
 * 获取 logger 实例
 * @returns {import('log4js').Logger|null}
 */
function get() {
    return _logger;
}

module.exports = { init, get };
