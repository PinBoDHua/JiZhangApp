/**
 * 数值工具（最底层，不依赖任何业务模块）。
 *
 * 金额、倍数、平均时薪都以「分」为精度展示，之前每个模块各写一份
 * `Math.round(value * 100) / 100`，改动精度时要满仓库找。统一到这里之后：
 * - 非有限数（NaN / Infinity）一律按 0 处理，避免脏数据把金额传染成 NaN；
 * - 负数按四舍五入（与 Math.round 一致），不做额外的银行家舍入。
 */

/** 保留两位小数；非有限数返回 0 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** 整数化但保留符号，用于班次数等计数类差值 */
export function roundInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}
