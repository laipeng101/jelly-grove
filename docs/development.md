# 开发与验证

## 按改动验证

| 改动 | 检查 |
| --- | --- |
| 文档 | 核对链接和命令，运行 `git diff --check` |
| 玩法或关卡 | 选对应逻辑测试文件。共用规则变更时覆盖两种模式的受影响行为 |
| 布局或交互 | 选对应浏览器用例，按需要覆盖可视边界、触控尺寸、键盘焦点或动效中断 |
| 存档格式、迁移或设置同步 | 核对旧档读入、导入导出和失败恢复。能读到内容的损坏原档可导出，用户确认替换或成功导入后才可覆盖。共用设置用实际浏览器回退和前进验证 |
| 发布输入或离线行为 | 运行构建和受影响的离线用例，见[发布与离线验证](#发布与离线验证) |

逻辑测试可直接传入文件，例如 `node --import tsx --test tests/logic/journey/rules.test.ts`。浏览器用例按文件和标题筛选，例如 `npm run test:browser -- tests/browser/journey/storage.spec.ts --grep 'invalid import'`。一次传入相关文件可共用生产打包和预览服务器。安装 Chromium 用 `npm run browser:install`，实际页面往返用例需要完整 Chromium。

聚焦用例直接执行逻辑或打包后的应用。改动类型契约、测试夹具或 TypeScript 开发脚本时，加跑 `npm run test:types`。相关代码、输入、验收条件和验证环境相同时可沿用通过结果。用 `npm test` 或 `npm run test:browser` 扩大到相应层的回归。影响横跨多个模块且无法可靠缩小范围，或任务要求完整回归时，运行 `npm run verify`。

真机性能、系统文字放大、双指缩放、Android 微信本地入口（`content://`）和听感需要对应设备。真人难度用独立盲玩验证。

## 生成专项

- 生成质量或预算变化时，用 `npm run journey:benchmark` 和 `npm run journey:benchmark:browser` 检查 Node.js 求解和断网单文件中的 Chromium Worker。正式验收使用基准默认样本，定位故障时可用 `JOURNEY_BENCH_COUNT` 缩小样本。[基准门槛与默认样本](../scripts/journey-generation.ts)
- 确需替换备用盘时运行 `npm run journey:backups`，核对盘面差异，再跑生成逻辑测试、单文件换主题用例和基准。[备用盘脚本](../scripts/build-journey-backups.ts)
- 复现当前盘面时，在流转送达中打开“音效与设置”，选择“导出进度”。`session.puzzle` 含主题编号、种子、版本和完整初盘，`session.actions` 是配对记录。排查实时生成失败时，在 Worker 请求处记录该次种子。[生成请求](../src/journey/client.ts)

## 发布与离线验证

`npm run build` 检查源码类型并生成 `dist/`，`npm run preview` 预览已有构建。直接在浏览器打开 `dist/果冻果园.html` 可离线游玩。

在仓库 Settings → Pages 选择 GitHub Actions 作为发布源。`main` 的发布输入有变动时自动运行，也可手动调度。发布前构建并运行 `npm run test:smoke`，检查核心规则和随包发布的备用盘。通过后把同一单文件包发布为站点入口 `index.html` 和下载入口 `果冻果园.html`。[发布工作流](../.github/workflows/pages.yml)

打包或离线行为改动时，选择 `tests/browser/classic/layout.spec.ts` 的下载冷启动用例和 `tests/browser/journey/gameplay.spec.ts` 的单文件换主题用例。发布路径改动时，在子路径托管这两个发布文件，验证从设置下载后用断网浏览器打开并开盘。
