/**
 * canbox-core/lib/electron-selector.js — Electron 版本选择器
 *
 * 根据 APP 的 .canbox-app 声明，从已安装的 electron 版本中选择合适的运行时。
 *
 * 已安装版本来源：
 *   - builtin：程序目录 {CANBOX_HOME}/electron-{ver}/ （安装包自带，唯一）
 *   - downloaded：用户目录 {userData}/runtime/electron-{ver}/ （在线下载，多个）
 *
 * 白名单（ALLOWED_ELECTRON）：canbox 官方纳入的版本，APP 声明的 range 必须命中白名单。
 * 安装包只内置 1 个版本，其他版本由 manager 在线下载到 {userData}/runtime/。
 *
 * CLI 用法（供 bin/canbox 调用）：
 *   node electron-selector.js --app-dir <dir> --canbox-home <path> --user-data <path>
 *
 * 退出码：
 *   0 — 成功，stdout 输出 electron 二进制绝对路径
 *   1 — 错误，stderr 输出错误信息
 *   2 — 需要下载，stdout 输出 JSON { needDownload, version, url }
 */

const fs = require('fs');
const path = require('path');
const { readCanboxMeta } = require('./canbox-meta');

/**
 * Electron 下载镜像源
 * 按优先级排序，下载时会测速选择最优源
 */
const DOWNLOAD_MIRRORS = [
    { name: 'npmmirror', url: 'https://npmmirror.com/mirrors/electron/' },
    { name: 'github', url: 'https://github.com/electron/electron/releases/download/' }
];

/**
 * canbox 官方纳入的 electron 版本白名单
 * APP 声明的 range 必须命中此白名单，否则拒绝启动
 * 新增版本时在此添加，含版本号（下载 URL 由镜像源 + 版本号动态拼接）
 */
const ALLOWED_ELECTRON = {
    '42.5.1': {}
};

// ====== semver 简易匹配（零依赖，支持 ^ 和精确匹配）======

/**
 * 解析版本号为 { major, minor, patch }
 */
function parseVersion(ver) {
    const parts = String(ver).split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

/**
 * 比较两个版本号：a > b → 1, a < b → -1, a == b → 0
 */
function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
    if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
    if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
    return 0;
}

/**
 * 检查版本是否满足 range
 * 支持：^x.y.z、x.y.z（精确）、*（任意）
 * @param {string} version - 候选版本号
 * @param {string} range - semver range
 * @returns {boolean}
 */
function satisfies(version, range) {
    range = String(range).trim();
    if (range === '' || range === '*') return true;

    if (range.startsWith('^')) {
        // ^x.y.z → 同 major 且 >= x.y.z
        const target = range.slice(1);
        const pt = parseVersion(target);
        const pv = parseVersion(version);
        if (pv.major !== pt.major) return false;
        return compareVersions(version, target) >= 0;
    }

    if (range.startsWith('>=')) {
        return compareVersions(version, range.slice(2).trim()) >= 0;
    }

    // 精确匹配
    return compareVersions(version, range) === 0;
}

// ====== 下载 URL 生成 ======

/**
 * 根据版本和平台生成下载 URL
 * @param {string} version - Electron 版本号
 * @param {string} platformKey - 平台 key，如 linux-x64
 * @param {string} mirrorUrl - 镜像基础 URL
 * @returns {string} 完整下载 URL
 */
function buildDownloadUrl(version, platformKey, mirrorUrl) {
    const filename = `electron-v${version}-${platformKey}.zip`;
    if (mirrorUrl.includes('npmmirror')) {
        return `${mirrorUrl}v${version}/${filename}`;
    }
    return `${mirrorUrl}v${version}/${filename}`;
}

/**
 * 根据版本和平台生成所有候选下载 URL（各镜像源）
 * @param {string} version - Electron 版本号
 * @param {string} platformKey - 平台 key
 * @returns {Array<{name: string, url: string}>} 候选下载地址列表
 */
function getDownloadUrls(version, platformKey) {
    return DOWNLOAD_MIRRORS.map(mirror => ({
        name: mirror.name,
        url: buildDownloadUrl(version, platformKey, mirror.url)
    }));
}

// ====== 镜像测速 ======

/**
 * 测试单个镜像的连通性与延迟
 * @param {{name:string, url:string}} mirror - 镜像配置
 * @param {string} testUrl - 测试 URL
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{name: string, available: boolean, latency: number}>}
 */
async function testMirrorLatency(mirror, testUrl, timeout = 3000) {
    const http = require('http');
    const https = require('https');
    const url = require('url');

    const start = Date.now();
    const parsed = new URL(testUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({ name: mirror.name, available: false, latency: timeout });
        }, timeout);

        const req = client.head(testUrl, {
            headers: { 'User-Agent': 'Canbox/ElectronSelector' },
            timeout: timeout
        }, (res) => {
            clearTimeout(timer);
            resolve({
                name: mirror.name,
                available: res.statusCode >= 200 && res.statusCode < 400,
                latency: Date.now() - start
            });
            res.resume();
        });

        req.on('error', () => {
            clearTimeout(timer);
            resolve({ name: mirror.name, available: false, latency: timeout });
        });
    });
}

/**
 * 并发测速所有镜像源，返回可用镜像列表（按延迟升序）
 * @param {string} version - Electron 版本号
 * @param {string} platformKey - 平台 key
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Array<{name: string, url: string}>>} 可用镜像列表
 */
async function probeDownloadMirrors(version, platformKey, timeout = 3000) {
    const candidates = getDownloadUrls(version, platformKey);

    const results = await Promise.all(
        candidates.map(c => testMirrorLatency({ name: c.name, url: c.url }, c.url, timeout))
    );

    return results
        .filter(r => r.available)
        .sort((a, b) => a.latency - b.latency)
        .map(r => ({ name: r.name, url: candidates.find(c => c.name === r.name).url }));
}

// ====== 版本扫描 ======

/**
 * 扫描程序目录中的 builtin electron 版本
 * builtin 版本不入 registry，通过扫描 electron-* 目录得知
 * @param {string} canboxHome - 程序目录（CANBOX_HOME）
 * @returns {Array<{version: string, path: string, source: string}>}
 */
function scanBuiltinVersions(canboxHome) {
    if (!fs.existsSync(canboxHome)) return [];
    const electronBinaryName = process.platform === 'win32' ? 'electron.exe' : 'electron';
    return fs.readdirSync(canboxHome)
        .filter(name => name.startsWith('electron-'))
        .filter(name => fs.statSync(path.join(canboxHome, name)).isDirectory())
        .filter(name => fs.existsSync(path.join(canboxHome, name, electronBinaryName)))
        .map(dir => ({
            version: dir.replace('electron-', ''),
            path: dir,
            source: 'builtin'
        }));
}

/**
 * 读取用户下载的 electron 版本注册表
 * @param {string} userData - 用户数据目录
 * @returns {Object} { installedVersions: { [ver]: { path, electron, source, installedAt } } }
 */
function readDownloadedRegistry(userData) {
    const registryPath = path.join(userData, 'runtime', 'electron-registry.json');
    if (!fs.existsSync(registryPath)) return { installedVersions: {} };
    try {
        return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch (e) {
        return { installedVersions: {} };
    }
}

/**
 * 获取下载注册表路径
 * @param {string} userData - 用户数据目录
 * @returns {string}
 */
function getRegistryPath(userData) {
    return path.join(userData, 'runtime', 'electron-registry.json');
}

// ====== 核心选择逻辑 ======

/**
 * 根据当前平台获取下载 URL key
 * @returns {string}
 */
function getPlatformKey() {
    const arch = process.arch;
    const platform = process.platform;
    if (platform === 'linux' && arch === 'x64') return 'linux-x64';
    if (platform === 'win32' && arch === 'x64') return 'win32-x64';
    if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
    if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
    return `${platform}-${arch}`;
}

/**
 * 解析 APP 的 electron 版本需求，选择合适的已安装版本
 *
 * @param {string} appDir - APP 根目录（读 .canbox-app）
 * @param {string} canboxHome - 程序目录（builtin electron 所在）
 * @param {string} userData - 用户数据目录（downloaded electron 所在）
 * @returns {{ error?: string, path?: string, needDownload?: boolean, version?: string, url?: string }}
 */
function resolveElectron(appDir, canboxHome, userData) {
    // 1. 读 .canbox-app
    const meta = readCanboxMeta(appDir);
    if (!meta || !meta.electron || !meta.electron.range) {
        return { error: 'APP 未声明 electron 版本（.canbox-app 中 electron.range 缺失）' };
    }
    const range = meta.electron.range;

    // 2. 校验 range 命中白名单
    const allowedVersions = Object.keys(ALLOWED_ELECTRON).filter(v => satisfies(v, range));
    if (allowedVersions.length === 0) {
        return { error: `canbox 未纳入满足 ${range} 的 electron 版本` };
    }

    // 3. 收集候选版本
    const builtin = scanBuiltinVersions(canboxHome);
    const downloaded = readDownloadedRegistry(userData);
    const downloadedVersions = Object.values(downloaded.installedVersions || {})
        .filter(v => v.path && v.electron)
        .map(v => ({ version: v.electron, path: v.path, source: 'downloaded' }));

    const candidates = builtin.concat(downloadedVersions)
        .filter(c => allowedVersions.includes(c.version))
        .sort((a, b) => compareVersions(b.version, a.version)); // desc

    // 4. 找到满足 range 的最高版本
    if (candidates.length > 0) {
        const selected = candidates[0];
        const electronBinaryName = process.platform === 'win32' ? 'electron.exe' : 'electron';
        const basePath = selected.source === 'builtin'
            ? path.join(canboxHome, selected.path)
            : path.join(userData, 'runtime', selected.path);
        const electronPath = path.join(basePath, electronBinaryName);
        return { path: electronPath };
    }

    // 5. 未找到已装版本，返回需要下载（包含所有镜像源的 URL）
    const versionToDownload = allowedVersions.sort((a, b) => compareVersions(b, a))[0];
    const platformKey = getPlatformKey();
    const urls = getDownloadUrls(versionToDownload, platformKey);
    if (urls.length === 0) {
        return { error: `electron ${versionToDownload} 不支持当前平台 ${platformKey}` };
    }
    return { needDownload: true, version: versionToDownload, urls };
}

// ====== CLI 入口 ======

if (require.main === module) {
    const args = process.argv.slice(2);
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--app-dir' && i + 1 < args.length) parsed.appDir = args[++i];
        else if (args[i] === '--canbox-home' && i + 1 < args.length) parsed.canboxHome = args[++i];
        else if (args[i] === '--user-data' && i + 1 < args.length) parsed.userData = args[++i];
    }

    if (!parsed.appDir || !parsed.canboxHome || !parsed.userData) {
        console.error('用法: node electron-selector.js --app-dir <dir> --canbox-home <path> --user-data <path>');
        process.exit(1);
    }

    const result = resolveElectron(parsed.appDir, parsed.canboxHome, parsed.userData);
    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }
    if (result.needDownload) {
        console.log(JSON.stringify({ needDownload: true, version: result.version, urls: result.urls }));
        process.exit(2);
    }
    console.log(result.path);
    process.exit(0);
}

module.exports = {
    ALLOWED_ELECTRON,
    resolveElectron,
    scanBuiltinVersions,
    readDownloadedRegistry,
    getRegistryPath,
    getPlatformKey,
    satisfies,
    compareVersions,
    getDownloadUrls,
    probeDownloadMirrors,
    DOWNLOAD_MIRRORS
};
