# 开发验证

首次执行浏览器回归或升级 Playwright 后，运行 `npm run browser:install`。仅运行无头回归可追加 `-- --only-shell`。npm 与 Playwright 缓存都在仓库的 `.cache/` 下。

| 场景 | 入口 |
| --- | --- |
| 逻辑回归 | `npm test` |
| 浏览器回归 | `npm run test:browser`，重建后测试。可追加 `-- --grep '<用例名称>'` |
| 完整回归与构建 | `npm run verify` |
| 生成质量或预算变化 | `npm run journey:benchmark` 与 `npm run journey:benchmark:browser`，分别覆盖 Node.js 求解与断网单文件中的 Chromium Worker |
| 确需替换备用盘 | `npm run journey:backups`。核对盘面差异后跑完整回归和生成基准 |

本地验证产物写入 `output/`。Playwright 报告与失败 trace 见 `output/playwright/`，基准见 `output/journey/`。排查时可用 `JOURNEY_BENCH_COUNT` 缩小样本量，正式验收见[生成预算](LEVEL-DESIGN.md#生成预算)。浏览器基准用报告中的 SHA-256 标识被测离线包。

- 布局改动按[可见性契约](DESIGN.md#手机对局信息可见性契约)或[试玩布局约束](LEVEL-DESIGN.md#布局与动效)验证。真机性能、系统文字放大、双指缩放、Android 微信本地文件入口（`content://`）、实际听感和真人难度使用对应设备或环境验证。
- 改生成或认证时，验证独立模型和真实 Worker 预算。复现随机盘时附主题与种子，标明生成请求种子或已接受盘面种子。
- 改资源引用、Worker 或打包时，验证断网 `file://` 冷启动。已加载页面断网和 HTTP 断网重载各自判断。

规则、生成、存档或离线交付改动须覆盖受影响的失败路径与模块协作。交付说明记录被测版本、环境、结论和影响验收的未验证项。
