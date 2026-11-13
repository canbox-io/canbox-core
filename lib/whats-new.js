/**
 * canbox-core/lib/whats-new.js — 更新内容（What's New）公共服务
 *
 * 解决"APP 升级后用户不知道改了什么"的通用问题，一次实现供所有 APP 复用：
 *   - 按 APP 隔离记录 lastSeenVersion（{Users}/data/{appId}/store/whats-new.json）
 *   - 读取并解析 APP 自带的 CHANGELOG.md（Keep a Changelog 格式）
 *   - 判定是否需要展示，并聚合期间所有版本段落（跨多版本升级也完整）
 *   - 提供中英双语正文筛选工具，APP 不必各自实现解析逻辑
 *
 * IPC（黑盒式，不传 appId；appId 由 env 注入）：
 *   canbox.whatsNew.check({ version?, maxSections?, changelog?, changelogPath? })
 *   canbox.whatsNew.ack(version)
 *   canbox.whatsNew.getVersion()
 *
 * 约定：
 *   - CHANGELOG.md 放在 APP 根目录（app.asar 内亦可读取），默认路径 app.getAppPath()/CHANGELOG.md
 *   - 条目格式为 "## [x.y.z] - YYYY-MM-DD"，正文中文一行、英文一行成对出现
 *   - 首次运行（无记录）只写入当前版本，不返回待展示内容
 *
 * @module lib/whats-new
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getStore } = require('./store');

const STORE_NAME = 'whats-new';
const KEY_LAST_SEEN = 'lastSeenVersion';
const DEFAULT_MAX_SECTIONS = 3;
// 判断一行文案属于中文还是英文（CHANGELOG 内中英分行书写）
const CJK_RE = /[\u4e00-\u9fa5]/;
const HEADING_RE = /^(#{1,6}\s*)(.*?)\s*\/\s*(.+)$/;

/**
 * 比较两个 semver 版本（忽略前导 v，缺失位按 0 处理）
 * @param {string} a
 * @param {string} b
 * @returns {number} a>b 返回 1，a<b 返回 -1，相等返回 0
 */
function compareVersions(a, b) {
    const parse = (v) => String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const pa = parse(a);
    const pb = parse(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
}

/**
 * 解析 CHANGELOG markdown 为版本段落
 *
 * 只匹配二级标题 "## [x.y.z]"，因此不会误命中 "# Changelog" 与
 * "### feat | 新功能 / Features" 这类分类标题。
 *
 * @param {string} markdown
 * @returns {{version: string, date: string, body: string}[]} 顺序与文件一致（新版本在前）
 */
function parseChangelog(markdown) {
    if (!markdown) return [];
    const lines = String(markdown).split(/\r?\n/);
    const sections = [];
    let current = null;
    for (const line of lines) {
        const matched = line.match(/^##\s+\[?([0-9]+(?:\.[0-9]+)*)\]?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
        if (matched) {
            if (current) sections.push(current);
            current = { version: matched[1], date: matched[2] || '', body: '' };
            continue;
        }
        if (current) current.body += `${line}\n`;
    }
    if (current) sections.push(current);
    return sections.map(s => ({ ...s, body: s.body.trim() }));
}

/**
 * 读取 CHANGELOG 文件，失败返回空串（更新说明属于增强信息，不应影响 APP 启动）
 * @param {string} filePath
 * @returns {string}
 */
function readChangelogFile(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        return '';
    }
}

/**
 * 按语言筛选 CHANGELOG 正文（中文条目 / 英文条目）
 *
 * CHANGELOG 每个条目先中文后英文；分类标题中英并存（如 "### feat | 新功能 / Features"），
 * 非中文环境取 "/" 之后的英文部分。
 *
 * @param {string} body 段落正文 markdown
 * @param {string} locale 语言标识，如 zh-CN / en-US
 * @returns {string} 过滤后的 markdown
 */
function splitBilingualBody(body, locale) {
    const isZh = String(locale || '').toLowerCase().startsWith('zh');
    const out = [];
    for (const line of String(body || '').split('\n')) {
        if (!line.trim()) {
            out.push('');
            continue;
        }
        const hasCJK = CJK_RE.test(line);
        if (hasCJK === isZh) {
            out.push(line);
        } else if (/^#{1,6}\s/.test(line)) {
            out.push(isZh ? line : line.replace(HEADING_RE, '$1$3'));
        }
    }
    return out.join('\n');
}

/**
 * 获取当前 APP 的 whats-new store（与 store 模块共用物理隔离模型）
 * @returns {import('electron-store')}
 */
function getWhatsNewStore() {
    const env = global.__CANBOX_ENV__ || {};
    if (!env.appId || !env.usersPath) {
        throw new Error('canbox-core env is not initialized');
    }
    return getStore(env.appId, STORE_NAME, path.join(env.usersPath, 'data'));
}

/**
 * 判定是否需要展示"更新内容"
 *
 * @param {object} [options]
 * @param {string} [options.version] 当前 APP 版本，默认 app.getVersion()
 * @param {number} [options.maxSections] 最多展示的版本段落数，默认 3
 * @param {string} [options.changelog] 直接传入 changelog 文本（优先于 changelogPath）
 * @param {string} [options.changelogPath] changelog 路径，默认 {appPath}/CHANGELOG.md
 * @returns {{success: boolean, show: boolean, currentVersion: string, lastSeenVersion: string, sections: object[]}}
 */
function check(options = {}) {
    const currentVersion = options.version || app.getVersion();
    const maxSections = options.maxSections || DEFAULT_MAX_SECTIONS;
    const store = getWhatsNewStore();
    const lastSeenVersion = store.get(KEY_LAST_SEEN) || '';

    // 首次运行：只记录，不打扰用户
    if (!lastSeenVersion) {
        store.set(KEY_LAST_SEEN, currentVersion);
        return { success: true, show: false, currentVersion, lastSeenVersion: '' };
    }

    const compared = compareVersions(currentVersion, lastSeenVersion);
    if (compared === 0) {
        return { success: true, show: false, currentVersion, lastSeenVersion };
    }
    if (compared < 0) {
        // 降级：对齐到当前版本，避免长期残留旧记录
        store.set(KEY_LAST_SEEN, currentVersion);
        return { success: true, show: false, currentVersion, lastSeenVersion };
    }

    const changelog = options.changelog != null
        ? options.changelog
        : readChangelogFile(options.changelogPath || path.join(app.getAppPath(), 'CHANGELOG.md'));
    const sections = parseChangelog(changelog)
        .filter(s => compareVersions(s.version, lastSeenVersion) > 0)
        .slice(0, maxSections);

    if (sections.length === 0) {
        // changelog 未覆盖当前版本：对齐版本，避免每次启动都判定为待展示
        store.set(KEY_LAST_SEEN, currentVersion);
        return { success: true, show: false, currentVersion, lastSeenVersion };
    }

    return { success: true, show: true, currentVersion, lastSeenVersion, sections };
}

/**
 * 记录用户已读的版本
 * @param {string} [version] 默认 app.getVersion()
 * @returns {{success: boolean}}
 */
function ack(version) {
    getWhatsNewStore().set(KEY_LAST_SEEN, version || app.getVersion());
    return { success: true };
}

/**
 * 注册 whats-new IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 */
function register(ipcMain) {
    const wrap = (fn) => {
        try {
            return fn();
        } catch (e) {
            return { success: false, error: e.message };
        }
    };

    ipcMain.handle('canbox.whatsNew.check', (_e, options) => wrap(() => check(options || {})));
    ipcMain.handle('canbox.whatsNew.ack', (_e, version) => wrap(() => ack(version)));
    ipcMain.handle('canbox.whatsNew.getVersion', () => require('../package.json').version);
}

module.exports = {
    register,
    check,
    ack,
    parseChangelog,
    splitBilingualBody,
    compareVersions,
    readChangelogFile
};
