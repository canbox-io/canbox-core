/**
 * canbox-core/lib/env.js — 环境初始化（隐性能力）
 *
 * 在 APP main.js 执行之前完成：
 *   - 统一 userData 路径设置
 *   - module-alias 注册
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CANBOX_USER_DATA = process.env.CANBOX_USER_DATA
    || process.env.CANBOX_HOME
    || path.join(app.getPath('appData'), 'canbox');

// 确保 userData 目录存在
if (!fs.existsSync(CANBOX_USER_DATA)) {
    fs.mkdirSync(CANBOX_USER_DATA, { recursive: true });
}

// 必须在 app.whenReady() 之前设置 userData
app.setPath('userData', CANBOX_USER_DATA);

// 设置 module-alias
const moduleAlias = require('module-alias');
moduleAlias.addAliases({
    '@canbox-core': path.join(__dirname)
});
moduleAlias();

module.exports = {
    userData: CANBOX_USER_DATA
};
