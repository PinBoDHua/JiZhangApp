/**
 * 通用工具的统一入口。
 *
 * 按职责分成四层，依赖方向单向向下，没有循环：
 *
 *   date    ← 纯日期时间（ISO ↔ Date ↔ 分钟）
 *   format  ← 纯展示格式（金额、时长、计数），只依赖 num
 *   pay     ← 计薪桥接，依赖 pay / date
 *   records ← 记录与排班聚合，依赖 pay / date
 *   export  ← CSV、工资条、下载，依赖 format / date / pay / records
 *
 * 业务代码统一 `import { ... } from '../utils'`，不需要知道具体在哪个文件；
 * 要单独测某一层时直接 import 对应文件，避免把整棵树拖进测试。
 */

export * from './date';
export * from './format';
export * from './pay';
export * from './records';
export * from './export';
