# 开发验证

运行 `npm ci` 安装依赖。首次使用 Playwright 时运行 `npx playwright install chromium`。如果运行环境的默认缓存不可写，先将 npm 和浏览器缓存指向可写目录。后续执行浏览器检查时沿用安装时的 `PLAYWRIGHT_BROWSERS_PATH`。下面是 Linux 示例。

```sh
export npm_config_cache=/tmp/jelly-grove-npm-cache
export PLAYWRIGHT_BROWSERS_PATH=/tmp/jelly-grove-playwright
```

| 场景 | 入口 |
| --- | --- |
| 规则、生成、计时与存档 | `npm test`，包括第 18 主题的独立可解性和历史种子回归 |
| 布局、交互、离线与构建 | `npm run test:browser`，先重新构建，再启动独立生产预览。可追加 `-- --grep '<用例名称>'` 定向验证 |
| 完整开发回归 | `npm run verify` |
| 生成质量或预算变化 | `npm run journey:benchmark` 与 `npm run journey:benchmark:browser`，分别覆盖 Node.js 求解与断网单文件中的 Chromium Worker |
| 确需替换备用盘 | `npm run journey:backups` 重建受版本控制的备用库，随后检查关卡内容差异并执行完整回归和生成基准 |

Playwright 使用 `127.0.0.1:4179`，端口须空闲。报告和失败 trace 位于 `output/playwright/`。浏览器基准自己构建并打开本地 HTML，报告的 SHA-256 对应该文件；两个生成基准默认每主题 100 次，可用 `JOURNEY_BENCH_COUNT` 缩小排查样本。基准结果写入 `output/journey/`。

紧凑布局按照[可见性契约](DESIGN.md#手机对局信息可见性契约)验证实际可视区域、无遮挡命中、触控尺寸和放大文字重排。试玩验证另外覆盖各主题的普通胜利与挑战、存档与撤销、过期 Worker 结果、导航、动效以及 `file://` 冷启动。生成准入和有解性依据[关卡设计](LEVEL-DESIGN.md)。

按改动影响重验。规则、生成、存档或离线交付改动需要覆盖失败路径与模块协作。记录被测版本、环境和结论；复现随机盘时附主题与种子，注明使用生成请求种子还是已接受盘面种子。独立盲玩若被明确要求，使用隔离的浏览器与上下文，只从可见界面解题，先验证采集方法再扩展。预算耗尽保留未完成结果。

桌面 Chromium 移动视口与根字号放大覆盖网页布局。物理手机性能、系统文字放大、Android 微信本地文件入口（`content://`）、外放听感和真人难度仍待对应环境验证。已加载页面断网、断网 `file://` 冷启动和 HTTP 断网重新获取页面是三个独立场景。

## 历史审核

- `c0c738f` 对应旧冻结版本的 `PASS_WITH_RESIDUAL_RISK`。audit8、audit9 完整，audit10 与三次定向补充仍为 `INCOMPLETE`。
- `bff9bb2` 记录第 18 主题初盘调查。七个历史盘面、32 个备用盘、1000 次 Node.js 生成和 100 次离线 Worker 生成均通过独立可解性抽样。三次补充中，两个停止局面已进入可撤销的死局，一个仍可通关但已失去最优挑战。初盘生成疑点由此关闭，原盲玩状态保留。
- `ef94d6a` 记录收获与动效改版。末轮独立功能复验当时待完成。

完整历史记录和对应工具可在这些提交中查阅。原始本地附件由各次审核保存，普通克隆提供受版本控制的摘要与回归用例。
