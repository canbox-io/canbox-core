/**
 * canbox-core/lib/misc.js — 杂项功能模块
 *
 * 仅提供与 canbox 平台相关的环境/诊断信息：
 *   - hello:           测试 core 是否加载
 *   - getUserData:     获取 Users 业务数据目录路径
 *   - getCoreVersion:  获取 canbox-core 版本
 *   - getCorePath:     获取 canbox-core 根目录路径（injection.js 所在目录）
 *   - getPlatformInfo: 获取平台信息
 *
 * 说明：openUrl / showItemInFolder / openPath 等 shell 能力已移除，
 * APP 可直接在自身主进程注册 IPC（一行 shell.openExternal 即可），
 * canbox-core 不再越界提供 APP 一行代码就能完成的能力。
 */

const path = require('path');

// canbox-core 根目录（lib/ 的上一层）
const CORE_ROOT = path.resolve(__dirname, '..');

/**
 * 注册 misc 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} env - env 模块导出（含 userData、usersPath、appId）
 * @param {string} coreVersion - canbox-core 版本号
 */
function register(ipcMain, env, coreVersion) {
    ipcMain.handle('canbox.misc.hello', () => {
        return 'Hello from canbox-core!';
    });

    // 返回 Users 业务数据目录路径（{UsersBase}/Users/）
    ipcMain.handle('canbox.misc.getUserData', () => {
        return env.usersPath;
    });

    ipcMain.handle('canbox.misc.getCoreVersion', () => {
        return coreVersion;
    });

    // 返回 canbox-core 根目录路径（供 canbox-developer 等获取 injection.js 路径）
    ipcMain.handle('canbox.misc.getCorePath', () => {
        return CORE_ROOT;
    });

    ipcMain.handle('canbox.misc.getPlatformInfo', () => {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.versions.node,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome
        };
    });
}

module.exports = { register };
