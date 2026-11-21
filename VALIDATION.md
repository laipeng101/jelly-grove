# 开发验证

## 按改动范围选择

| 改动 | 优先阅读与验证 |
| --- | --- |
| 文档 | 核对链接和命令，运行 `git diff --check` |
| 经典玩法、存档 | [经典模式设计](DESIGN.md) · `tests/logic/classic/` |
| 流转送达玩法、生成、存档 | [流转送达设计](LEVEL-DESIGN.md) · `tests/logic/journey/` |
| 共用配对规则、音效、模式切换 | 检查两种玩法受影响的行为。共用逻辑用例在 `tests/logic/shared/` |
| 界面与操作 | 在 `tests/browser/` 选对应模式的用例。布局约束见[经典模式](DESIGN.md#手机对局信息可见性契约)和[流转送达](LEVEL-DESIGN.md#布局与动效) |
| 存档格式与迁移 | 检查旧档读入、导入导出和失败后保留原进度 |
| 资源、Worker、打包 | 用断网的 Chromium 直接打开本地 HTML。已打开后断网和 HTTP 断网重载单独验证 |

只跑受影响的逻辑文件，例如 `node --import tsx --test tests/logic/journey/rules.test.ts`。浏览器测试可用路径和标题筛选，例如 `npm run test:browser -- tests/browser/journey/storage.spec.ts --grep 'invalid import'`。一次传入要测的文件，Playwright 会先构建，再启动预览。已有结果可以沿用，直到相关代码、输入或验收条件发生变化。

## 回归与专项命令

首次执行浏览器回归或升级 Playwright 后，运行 `npm run browser:install`。仅运行无头回归可追加 `-- --only-shell`。

| 场景 | 入口 |
| --- | --- |
| 逻辑回归 | `npm test` |
| 测试、夹具和开发脚本的 TypeScript 检查 | `npm run test:types` |
| 浏览器回归 | `npm run test:browser` |
| 类型检查、完整回归与构建 | `npm run verify` |
| 生成质量或预算变化 | `npm run journey:benchmark` 与 `npm run journey:benchmark:browser`，分别覆盖 Node.js 求解与断网单文件中的 Chromium Worker |
| 确需替换备用盘 | `npm run journey:backups`。核对盘面差异后跑完整回归和生成基准 |

Playwright 报告、失败截图和 trace 见 `output/playwright/`。浏览器生成基准会构建离线包，基准报告写入 `output/journey/`。排查时可用 `JOURNEY_BENCH_COUNT` 缩小样本量，正式验收见[生成预算](LEVEL-DESIGN.md#生成预算)。

- 复现随机盘时记录主题和种子，注明是生成请求还是已采用棋盘的种子。
- 涉及真机性能、系统文字放大、双指缩放、Android 微信本地入口（`content://`）或实际听感时，用对应设备验证。
