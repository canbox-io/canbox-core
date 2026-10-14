/**
 * canbox-core/lib/category.js — APP 分类枚举与归一化
 *
 * 分类来源唯一：APP 仓库根目录 .canbox-app 的顶层 category 字段。
 * 合法取值固定 9 项；缺失或非法统一归一为 'other'（仅作展示桶，开发者不可设置）。
 */

// 开发者可设置的 9 个合法分类值
const APP_CATEGORIES = [
    'development',
    'utility',
    'office',
    'network',
    'audio',
    'video',
    'game',
    'graphics',
    'education'
];

// 未分类展示桶：不在 APP_CATEGORIES 内，仅由归一化函数产出
const CATEGORY_OTHER = 'other';

const VALID_CATEGORY_SET = new Set(APP_CATEGORIES);

/**
 * 归一化分类值
 * @param {*} value - 原始 category 值（可能为 undefined / 非字符串 / 非法值）
 * @returns {string} 命中 9 项枚举返回原值，否则返回 'other'
 */
function normalizeCategory(value) {
    if (typeof value !== 'string') return CATEGORY_OTHER;
    const trimmed = value.trim();
    if (VALID_CATEGORY_SET.has(trimmed)) return trimmed;
    return CATEGORY_OTHER;
}

module.exports = {
    APP_CATEGORIES,
    CATEGORY_OTHER,
    normalizeCategory
};
