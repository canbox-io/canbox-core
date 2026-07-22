/**
 * canbox-core/lib/env.js — 环境初始化（隐性能力）
 *
 * 在 APP main.js 执行之前完成：
 *   - 统一 userData 路径设置（~/.config/canbox/）
 *   - 读取 config.json 中的 customDataRoot，计算业务数据根目录（UsersBase）
 *   - 从 process.argv 解析 --app-id，确定当前 APP 的 appId
 *   - module-alias 注册
 *
 * 路径体系（沿用旧架构）：
 *   userData      = ~/.config/canbox/            （固定，config.json 在此）
 *   UsersBase     = customDataRoot || userData   （业务数据根，可整体搬迁）
 *   Users         = {UsersBase}/Users/           （所有业务数据）
 *     ├── apps/{appId}/          已安装 APP
 *     ├── data/{appId}/store/    APP 键值存储（按 appId 物理隔离）
 *     ├── data/{appId}/db/       APP 文档数据库（按 appId 物理隔离）
 *     ├── db/{history,fileTask}/ 平台级数据库
 *     ├── repos/                 仓库克隆
 *     └── ...
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// userData 固定路径（config.json 存放处，不受 customDataRoot 影响）
const USER_DATA = process.env.CANBOX_USER_DATA
    || process.env.CANBOX_HOME
    || path.join(app.getPath('appData'), 'canbox');

// 确保 userData 目录存在
if (!fs.existsSync(USER_DATA)) {
    fs.mkdirSync(USER_DATA, { recursive: true });
}

/**
 * 读取 config.json 中的 customDataRoot
 * config.json 永远在 userData 目录下，不受 customDataRoot 影响
 * @returns {string|null}
 */
function getCustomDataRoot() {
    try {
        const Store = require('electron-store');
        const configStore = new Store({
            name: 'config',
            cwd: USER_DATA
        });
        return configStore.get('customDataRoot') || null;
    } catch (error) {
        console.error('[env] Failed to read customDataRoot: {}', error.message);
        return null;
    }
}

// 业务数据根目录（可被用户自定义搬迁）
const USERS_BASE = getCustomDataRoot() || USER_DATA;

// Users 目录（所有业务数据存放处）
const USERS_PATH = path.join(USERS_BASE, 'Users');

// 确保 Users 目录及子目录存在
const REQUIRED_DIRS = [
    USERS_PATH,
    path.join(USERS_PATH, 'apps'),
    path.join(USERS_PATH, 'data'),
    path.join(USERS_PATH, 'db'),
    path.join(USERS_PATH, 'db', 'history'),
    path.join(USERS_PATH, 'db', 'fileTask'),
    path.join(USERS_PATH, 'repos'),
    path.join(USERS_PATH, 'temp', 'apps'),
    path.join(USERS_PATH, 'temp', 'repos'),
    path.join(USERS_PATH, 'logs')
];
for (const dir of REQUIRED_DIRS) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * 从 process.argv 解析 --app-id 参数
 * 启动方式：electron -r injection.js {appPath} --app-id={appId}
 * 若未提供，尝试从 {appPath}/package.json 的 name 字段读取
 * @returns {string|null}
 */
function getAppId() {
    // 1. 从命令行参数读取
    for (const arg of process.argv) {
        if (arg.startsWith('--app-id=')) {
            return arg.split('=')[1] || null;
        }
    }
    // 2. fallback：从 APP 路径的 package.json 读 name
    // Electron 启动时 app.getAppPath() 在 -r 阶段可能未就绪，
    // 从 argv 找不以 - 开头的最后一个路径参数作为 appPath
    const appPath = process.argv.slice(2).find(a => !a.startsWith('-'));
    if (appPath) {
        try {
            const pkgPath = path.resolve(appPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                return pkg.name || null;
            }
        } catch (e) {
            // 忽略
        }
    }
    return null;
}

const APP_ID = getAppId();

// 必须在 app.whenReady() 之前设置 userData
// 为每个 APP 设置独立的 userData 路径，避免多 APP 同时启动时的锁等待
// 格式: {USER_DATA}/apps/{appId}/
const APP_USER_DATA = path.join(USER_DATA, 'apps', APP_ID || 'default');
if (!fs.existsSync(APP_USER_DATA)) {
    fs.mkdirSync(APP_USER_DATA, { recursive: true });
}
app.setPath('userData', APP_USER_DATA);

// 设置 module-alias
const moduleAlias = require('module-alias');
moduleAlias.addAliases({
    '@canbox-core': path.join(__dirname)
});
moduleAlias();

module.exports = {
    userData: USER_DATA,          // 固定路径（config.json 在此）
    usersBase: USERS_BASE,        // 业务数据根（可搬迁）
    usersPath: USERS_PATH,        // Users 目录
    appId: APP_ID                 // 当前 APP 的 id（黑盒路由用）
};
