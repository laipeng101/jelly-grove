# 试玩体验改版与中断续接

日期：2026-10-04。范围：新玩法13–18主题，沿用已经确认的设计，保留正式关卡的果园视觉。第18主题可解性调查已经在本地提交 `bff9bb2` 收尾，本次不重新开启盲玩或扩展其他主题。

## 已完成行为

- 棋盘上方逐项展示完成送达、不用解题提示、专属挑战。正常字号16px，取消“第一星／第二星”前缀；条件旁与右上角复用正式关卡星形SVG、颜色和尺寸。
- 后台自动检查挑战机会，不计提示。只有直接不可逆违反或完整搜索证明无挑战路线才显示划去的星形、“第三星已失去”、具体原因与撤销入口；预算耗尽、Worker不可用或超时保持未确定。撤销、重试、换盘、导入重新判定，旧结果由请求版本隔离。
- 本次操作完成后，最后一拍反馈结束才显示收获与原因清单。13–17主动进入下一主题或留在本盘；18显示“六主题体验完成”，提供主题选择或再玩一盘。关闭后保留查看收获入口；刷新恢复不再次自动弹出，撤销后重过可再次出现。
- 动效顺序为连线消除130ms、双轨同步滑动280ms、轻弹90ms，总计500ms。采收口固定，思考1.5秒后每3秒轻微方向预示，不改变盘面。关闭或系统减少动效直接呈现结果；缩放、隐藏页面和换盘取消图层并保留已经保存的状态。
- 后台检查仅替换条件卡，不重建棋盘或弹窗；清理旧ResizeObserver节点并保持卡内撤销焦点。缓存页面恢复重新启动被取消的挑战检查。

## 本次验证

| 验证 | 结果 |
| --- | --- |
| `npm test` | 61/61通过 |
| TypeScript、生产与单文件离线构建 | 通过 |
| 全量浏览器回归 | 133/133通过 |
| 第18主题独立工具回归 | 7/7通过 |
| 新增修复定向回归 | 4/4通过，已包含在133项中 |
| 冻结身份复验、diff空白检查 | 通过 |

浏览器验证使用桌面Chromium移动视口，覆盖360×640、短屏、横屏、大字200%、普通与挑战终局、撤销重试、下一主题、内联Worker不可用、过期结果、正常／关闭／减少动效，以及加载前断网的file入口。缓存恢复用persisted的pagehide/pageshow事件注入检验生命周期，不称为所有浏览器实际缓存机制验证。

完整主回归日志：`output/journey/trial-experience/verify.log`。可解性工具日志：`output/journey/trial-experience/theme18-tests.log`。手机截图：`output/playwright/trial-resume-mobile.png`；布局读数三项条件均16px，360×640下棋盘底部约504px、页面无溢出。完整自动报告与失败截图在 `output/playwright/`。

## 独立审查与修复

| 分工 | 实际证据 | 处理 |
| --- | --- | --- |
| 挑战规则与状态 | 读取challenge-status/client/worker、solver/session/view；独立61逻辑及129浏览器通过；报告 `output/journey/resumed-full-regression/challenge-review.md` | 未发现P1/P2判定问题；补旧观察节点清理、焦点和滚动保持回归 |
| 手机视觉 | 实测 `output/trial-visual-failed-audit.json`；主题16普通解首步、17前两步失败态中视口264px、棋盘268px | 压缩条件卡6px留白，保持16px条件和44px控件；两主题失败态回归通过 |
| 动效与离线 | 实际读取源码，2项动效单元与5项浏览器专项通过；缓存恢复发现Worker检查未重启 | 增加pageshow.persisted恢复检查并补回归；动画期间设置关闭无残留图层 |

新版产物另由独立代理逐项重算附件哈希、复验冻结、检查离线内联包装与核心文件未变，结果PASS，证据 `output/journey/resumed-full-regression/artifact-review.md`。此产物检查不代替4项功能修复独立复验。

旧代理已不在当前协作树。新代理确实读文件和执行检查，但长上下文角色偏离、send_message结果未稳定送达；主代理用read_thread及本地报告核验，不把代理completed本身视作PASS。最终独立复验待交接报告，空回复不计完成。复验任务已经明确写入 `output/journey/resumed-full-regression/RECHECK-TASK.md`。任何当前审查子代理只执行该文件中的4项只读复验，并将结果保存为同目录 `final-recheck.md`；不再重复主代理的历史恢复、创建代理、构建、修改产品或冻结工作。

## 新版身份与旧证据边界

- 源码与测试SHA-256：`c8a3b2170ee61d55b183c7ad4854cd054ac7399bb9db6981beab80aea159b33c`。
- 单文件HTML SHA-256：`0dc06f960b0484c87ae28b71cb1f4c48d86c203aa066bbb7fd9eda9c74024d8e`。
- 当前清单：`output/journey/frozen-build.json`；旧清单与历史门禁保留在 `output/journey/trial-experience-baseline/`。新版验证机器摘要另存 `output/journey/trial-experience/report.json`。

核心规则、生成器、备用盘和存档协议未变。旧2026-10-02门禁与盲玩报告仅属于旧身份，仍保留PASS_WITH_RESIDUAL_RISK和INCOMPLETE，不迁移为新版审核通过；旧closeout脚本不作为新版体验改版门禁。第18主题调查的抽样结论仍见 [THEME18-SOLVABILITY.md](THEME18-SOLVABILITY.md)，本次没有重做全种子调查。

真人、物理设备、趣味、难度及听感验证继续暂缓。无固定机型限制。本地产物 `dist/果冻果园.html` 可交付。2026-10-04用户明确授权提交、推送并上线GitHub Pages；通过现有 `pages.yml` 在推送main后构建部署。最终功能修复的独立复验仍未完成，此次上线不将该项改写为通过。
