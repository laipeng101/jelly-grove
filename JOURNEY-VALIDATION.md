# 新关卡试玩：验证与隔离审核

2026-10-04体验改版已按用户确认实施，当前行为、验证和边界见 [TRIAL-EXPERIENCE.md](TRIAL-EXPERIENCE.md)。旧冻结与门禁备份于 `output/journey/trial-experience-baseline/`；本文下方的旧审核结论只对应旧版，不迁移为新版独立审核通过。当前生成规则与备用盘未变，真人与物理设备验证继续暂缓。

此前调查（2026-10-03）：按用户要求暂缓真人与物理设备验证，取消固定机型要求，优先核验第18主题初盘可解性并关闭此前盲玩失败的技术疑点。独立穷举与真实界面技术重放均通过，见 [THEME18-SOLVABILITY.md](THEME18-SOLVABILITY.md)。三次补充与audit10保持原`INCOMPLETE`，不继续重复盲玩，不扩展其他关卡。

2026-10-02历史收口采用[风险驱动验收契约v2](JOURNEY-ACCEPTANCE.md)，门禁为**PASS_WITH_RESIDUAL_RISK**：主产品门槛通过，三次定向补充未完成并接受残余风险。[收口摘要](JOURNEY-CLOSEOUT.md)保留历史结果与本次更新。旧契约仍为2/3，不改写或拼接补算；新技术调查不迁移为旧盲玩通过。

范围是新蓝图第 13–18 关的六个随机主题，其余十八关见 [设计蓝图](LEVEL-DESIGN.md)。原主线、自由与限时模式继续可用。所有试玩由代理执行；生成耗时、搜索量、代理操作时间均不证明真人 5–10 分钟体验。

## 审核规则

以下轮次、修复和续接章节是原契约执行历史，不作为继续整轮重跑的要求。v2历史结果由 `node tools/journey-review/closeout.mjs` 生成；[新覆盖表](output/journey/risk-closeout/coverage.md)、[机器门禁](output/journey/risk-closeout/gate.json)、[附件哈希清单](output/journey/risk-closeout/artifacts.json)与定向补充分别保存，不覆盖旧记录。

每轮由三名全新、空白上下文代理独立审核规则与状态、生成与质量、盲玩与交付。审核者不读取其他代理的结论；盲玩者不读取源码、隐藏状态、求解器或答案文件。技术审核自行构造反例及独立模型，盲玩审核通过可见界面实际操作。

每项证据关联冻结源码与独立 HTML 的 SHA-256、种子、操作及测试记录。以下轮次表保留旧契约历史；当前门槛由v2定义，同版本有效完整证据可复用，产品变更须新身份及受影响验证，不能迁移旧PASS或伪装为证据修复。

## 问题闭环

| 编号 | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| R1 | 提示记录达到 10,000 条后，新提示写入成功但下次读取失败 | [规则复现](output/journey/audit1/rules/report.md)、[修复复验](output/journey/repair/rules/regression.log) | 已修复，待新轮核验 |
| Q1 | 部分 14 关仅避开指定水果即可任意顺序三星，缺少真正的后续资源判断 | [独立策略图](output/journey/audit1/quality/report.md) | 已修复，待新轮核验 |
| Q2 | 14/18 关的部分提示错误归因于首次到站窗口 | [因果反例](output/journey/audit1/quality/causality.json) | 已修复，待新轮核验 |
| B1 | 360×640 放大文字后棋盘区域不足一颗水果；修复中又发现放大装饰可能拦截邻格点击 | [原边界](output/journey/audit1/root-200-rem.json)、[修复及专项验证](output/journey/large-text-repair.md) | 已修复，待新轮核验 |
| B2 | 第二层提示未明确两种备选的指代，容易与连续步骤混淆；经复核不是求解事实错误 | [盲玩原文与重放](output/journey/audit2/blind/report.md)、[固定种子关系](output/journey/repair-hint-display/seed-repro.json) | 已明确 A/B 及同一出发局面，待新轮核验 |
| R2 | 读写按字符限制、导入按字节限制，加上漂亮缩进，使应用自己的有效导出无法重新导入 | [纯 UI 往返复现](output/journey/audit3/rules/ui-capacity-import-roundtrip.log) | 已统一紧凑序列化及字符/字节限制，待新轮核验 |
| B3 | 200% 大字使轨道标记覆盖水果，且隐藏三星条件、图例及底部信息 | [盲玩大字截图](output/journey/audit4/blind/font200-bottom.png) | 已改为图形角标并恢复滚动信息，专项回归通过，待新轮核验 |
| Q3 | 第18主题仅沿选中挑战见证验证搭档/推进资源判断，其他最优三星路线可完整绕过这些教学关系 | [固定种子真实三星](output/journey/audit5/quality/bypass-ui-three-stars.png)、[完整旁路及合法动作](output/journey/audit5/quality/bypass-witnesses.json) | 已增加全部最优路线逐边必要性认证，[开发修复](output/journey/repair-teaching/REPORT.md)及[独立复验](output/journey/repair-teaching-root/independent-regression.json)通过，待新轮核验 |
| R3 | 浏览器拒绝读取存储时仍提供“导出原存档”，点击抛出异常且没有下载或反馈 | [独立审计](output/journey/audit6/rules/report.md)、[主代理复现](output/journey/repair-storage-read/root-before.log) | [已修复及回归](output/journey/repair-storage-read/report.md)，待新轮核验 |

## 审核记录

| 批次 | 规则与状态 | 生成与质量 | 盲玩与交付 | 连续通过数 |
| --- | --- | --- | --- | --- |
| audit1 | [FAIL：R1](output/journey/audit1/rules/report.md) | [FAIL：Q1、Q2](output/journey/audit1/quality/report.md) | [FAIL：B1](output/journey/audit1/blind/report.md) | 0 |
| audit2 | [PASS](output/journey/audit2/rules/report.md) | [PASS](output/journey/audit2/quality/REPORT.md) | [修复前收束，部分专项未核验](output/journey/audit2/blind/report.md) | 0：提示展示变更后重新计数 |
| audit3 | [FAIL：R2](output/journey/audit3/rules/report.md) | [PASS](output/journey/audit3/quality/report.md) | 未启动：本版已发现待修复问题 | 0 |
| audit4 | [PASS](output/journey/audit4/rules/report.md) | [PASS](output/journey/audit4/quality/report.md) | [FAIL：B3](output/journey/audit4/blind/report.md) | 0 |
| audit5 | [PASS](output/journey/audit5/rules/report.md) | [FAIL：Q3](output/journey/audit5/quality/report.md) | [INCOMPLETE：撤回候选](output/journey/audit5/blind/report.md) | 0 |
| audit6 | [FAIL：R3](output/journey/audit6/rules/report.md) | [INCOMPLETE：撤回候选](output/journey/audit6/quality/report.md) | [INCOMPLETE：撤回候选](output/journey/audit6/blind/report.md) | 0 |
| audit7 | [PASS](output/journey/audit7/rules/report.md) | [PASS](output/journey/audit7/quality/report.md) | [INCOMPLETE：服务错误](output/journey/audit7/blind/parent-interruption-note.md) | 0 |
| audit8 | [PASS](output/journey/audit8/rules/report.md) | [PASS](output/journey/audit8/quality/report.md) | [PASS，工具边界详见报告](output/journey/audit8/blind/report.md) | 1 |
| audit9 | [PASS](output/journey/audit9/rules/report.md) | [PASS](output/journey/audit9/quality/report.md) | [PASS，工具边界详见报告](output/journey/audit9/blind/report.md) | 2 |
| audit10 | [PASS](output/journey/audit10/rules/report.md) | [PASS](output/journey/audit10/quality/report.md) | [INCOMPLETE：停止重复采集，方法已修正](output/journey/audit10/blind-final/checkpoint.md) | 2 |

首次未通过构建的源码哈希为 `e6376a4592e4ba985b3834ee84fdba9dd296031944e113e823e4203c1a97494b`，独立 HTML 哈希为 `9ce5d311cd8f445f98816e7260358e39bec21d25dae5a59b4a0db216f42177cb`。该构建的局部通过结果不计入最终连续审核。

## 旧冻结版本的独立质量验证

下表是三个独立质量审核的核心样本，各包含600个新实时盘和192个备用盘。每轮由独立实现穷举核验普通通关、挑战通关、普通但未达挑战的通关，以及关键分支和教学必要性。备用盘在不同轮重复验证，因此不把三轮样本相加称为不同棋局数量。

| 质量审核 | 核心棋局 | 完整状态 | 状态边 | 关键分支 | 真实Worker预算内实时成功 |
| --- | --- | --- | --- | --- | --- |
| [audit8](output/journey/audit8/quality/summary.json) | 792 | 332,417 | 944,604 | 9,615 | 600 / 600 |
| [audit9](output/journey/audit9/quality/summary.json) | 792 | 340,314 | 976,197 | 9,579 | 600 / 600 |
| [audit10](output/journey/audit10/quality/summary.json) | 792 | 353,430 | 1,026,952 | 9,502 | 600 / 600 |

audit10优先使用Codex内置浏览器：质量审核全部浏览器操作使用独立IAB标签，600次真实Worker请求全部在3秒内成功；另完成168次故障/备用测试和12盘独立HTML断网三星。每主题100次请求的P95 / 最大值（毫秒）分别为13：13.3 / 19.4；14：34.0 / 58.3；15：183.9 / 231.4；16：299.8 / 460.6；17：313.2 / 448.4；18：160.2 / 211.4。详见[逐主题指标](output/journey/audit10/quality/metrics.json)和[完整方法、操作与工具边界](output/journey/audit10/quality/report.md)。

规则审核另核验24步撤销/刷新、8,951,606字节存档实际导入导出往返、存储读写拒绝、损坏原文备份、预算及阶段切换，并完成六主题新盘和离线通关；见[audit10规则报告](output/journey/audit10/rules/report.md)。技术角色通过不替代整轮盲测，完整轮次状态以上表审核记录为准。

## 中断会话的内置浏览器盲玩证据

audit10原盲玩者仅通过可见UI独立推理，六主题均实际完成无提示三星，并在同盘另走普通但未达挑战的两星通关。主代理已核对12个原始终局状态及截图。该会话因工具故障未完成全部专项，随后三次恢复均返回HTTP 400，连纯文字回复也失败。以下证据保留为中断记录，不计入替代审核者的覆盖；替代者使用新浏览器环境，独立完整执行全部盲审要求。

| 主题 | 本轮盲玩种子 | 无提示三星操作数 | 普通两星操作数 |
| --- | --- | --- | --- |
| 13 | 2747019448 | 3 | 7 |
| 14 | 2810571728 | 3 | 7 |
| 15 | 2153574106 | 5 | 11 |
| 16 | 2931264313 | 6 | 6 |
| 17 | 2637340019 | 6 | 11 |
| 18 | 2487090118 | 7 | 7 |

第18主题两条路线分别消耗4对和5对普通水果。未完成的尝试与换盘过程保留在[原始操作记录](output/journey/audit10/blind/actions.json)中，不把代理未解出的盘称为无解。

[六主题实际三星截图](output/journey/final-artifacts/six-themes-iab-three-stars.png)。六主题×三种字号×四种交互状态的72组截图与几何记录齐全，测试视口360×640，水果触控区最小45.65625px；放大时额外核验顶部目标、挑战条件及底部图例、种子和保存状态可滚动到达。原始[字号与几何记录](output/journey/audit10/blind/layout-metrics.json)保留重测条目，按同一状态最后一次完成记录核对。主代理抽查图见[13–14大字](output/journey/final-artifacts/parent-review-13-14-text200.jpg)、[15–16布局](output/journey/final-artifacts/parent-review-15-16-layout.jpg)、[17大字](output/journey/audit10/blind/17-text200-contact.jpg)、[18大字](output/journey/audit10/blind/18-text200-contact.jpg)。

## 证据保存

完整本地证据位于 `output/journey/`；其被 Git 忽略，交付审核索引仍在本文保留。开发期测试和基准与最终隔离审核分开记录。

### 当前阶段归档范围

本阶段提交包含六主题实现、192盘备用库、24关蓝图、逻辑与浏览器回归测试、生成基准和冻结工具，以及审核采集助手、证据门禁及其测试。仅在用户明确要求“当前阶段的提交和推送”后进行阶段性归档；该授权不将第三轮未完成结果改为PASS，也不允许扩展其余十八关。

源码与独立HTML仍保持当前冻结标识，提交前复验不重建。`dist/`、`output/`、依赖和浏览器临时文件按既有规则不进Git；本文指向这些目录的链接是本机证据索引，不是远端仓库内的可用文件。离线HTML保留在本机，克隆仓库后可用 `npm ci && npm run build` 重新生成，但重新构建不自动继承本机冻结哈希与审核结论。

归档时旧契约剩余验收：18主题真实无提示三星、六主题完整有效的视觉矩阵与部分交互/恢复专项，以及盲审完整报告和最终三轮门禁。2026-10-02随后采用v2，改为核实并复用audit8/9有效完整覆盖，仅执行定向补充和新门禁；无效采集与工具错误仍不得补算通过，不再重启整轮。

本次阶段归档提交前复验：55项逻辑测试、110项浏览器测试、11项证据门禁测试、1项采集助手浏览器集成测试与TypeScript检查均通过，源码与HTML冻结身份未变；44个冻结文件的暂存区内容逐一匹配，90个本地文档链接与源码/HTML归档校验通过。日志保留在 `output/journey/stage-closeout/`。没有重建交付物，也没有将第三轮最终门禁改为通过。

## 2026-10-02 续接回归

保持源码和构建冻结，没有运行会改变交付物的重建。`npm test` 的55项逻辑测试、`npm run test:browser` 的110项生产构建浏览器测试和 `npx tsc --noEmit` 全部通过。日志分别见[逻辑测试](output/journey/continuation-unit-tests.log)、[浏览器测试](output/journey/continuation-browser-tests.log)及[类型检查](output/journey/continuation-typecheck.log)。

重新使用独立HTML执行六主题各100次真实Chromium Worker请求，600次均在3秒内实时成功，无备用回退，每主题100个不同ID。13–18主题的P95 / 最大耗时（毫秒）依次为23.3 / 26.4、45.9 / 65.9、215.9 / 356.3、285.5 / 402.2、434.9 / 719.9、177.0 / 226.7，见[逐次数据](output/journey/continuation-browser-generation-benchmark.json)和[执行日志](output/journey/continuation-browser-benchmark.log)。这些补跑不替代独立盲审，也不证明物理手机性能或真人体验。

续接交付预检核对44个源码快照文件、归档及实际服务HTML哈希、82个本地文档链接和Git空白检查全部通过，见[预检日志](output/journey/continuation-delivery-preflight.log)。当时未达到旧三轮门槛；当前最终交付按v2新门禁执行，不改写该历史结论。

### 停止反复重试后的流程修正

反复重试的主要原因是审核执行和证据采集不可靠，而不是全量回归失败：旧页面引用、混用会话、固定延时、错误滚动容器，以及把文件名视为终局或成功消除。父代理未先验收小样本采集就持续整轮续跑，也放大了问题。完整根因、停止条件与新工具使用见 [tools/journey-review/README.md](tools/journey-review/README.md)。

新工具实施可见状态断言、字号幂等重施、真实卡片滚动、终局/同盘/成功消除后/必需专项/文件哈希验真。11项语义门禁测试通过；真实浏览器单主题集成验证成功动作、错误动作立即拒绝记为after、重绘后字号、重复放大不累乘和底部可达。大字诊断在桌面/移动360×640与两种字体模式的4个样本中均能滚动到图例和种子，见[复现结果](output/journey/diagnosis/layout-probe.json)。这些技术复验不计独立盲审，也不能补算第三轮。

游戏源码、测试、关卡和构建没有修改，冻结标识不变；审核工具位于不参与原冻结产物的 `tools/`。以后若发现真实产品缺陷而修改受冻结内容，仍需重冻并重新累计。三次定向补充未独立完成18无提示三星，因此补充侧未生成成功后的大字专项；该体验路径残余风险已保留原始报告、执行绑定和附件哈希，并由audit9同冻结身份的18无提示三星与72组视觉矩阵证据形成风险接受收口。不得将其描述为本次补充PASS、真人验收或无风险。

## 当前冻结交付物

- 规则版本：1；生成器版本：1。
- 源码 SHA-256：`a0d7d6ab22b022a14f566e39ffb24d4f517fbd982cac085edd731c6ce219a90b`。
- 独立 HTML SHA-256：`638e7ee634b76a38b24f39ee1b5f9eee0215929c9be010e2048e47858802a5ab`。
- [逐文件冻结清单](output/journey/frozen-build.json)、[完整源码快照](output/journey/final-artifacts/source-a0d7d6ab22b0.tar.gz)、[交付物及归档哈希](output/journey/final-artifacts/delivery.json)。快照44个文件逐一校验。
- [独立离线 HTML](dist/果冻果园.html)，预览入口为 `?play=lab`；另保存[同哈希归档](output/journey/final-artifacts/jelly-grove-638e7ee634b7.html)。

## 冻结前完整验证

R3区分不可读取与可读取但损坏的存档，缓存原文供备份，下载异常可反馈和重试；正常/200%字号恢复弹窗可达。[修复记录](output/journey/repair-storage-read/report.md)与新增回归均通过。

`npm run verify`：55 项逻辑测试、110 项浏览器测试及生产/独立 HTML 构建全部通过，见[完整日志](output/journey/storage-read-full-verify.log)。六主题正常字号、root 200%、可见文字200%、短屏、滚动、命中及图形可见性均覆盖。视觉专项72组主题/字体/状态、384个轨道水果无标记覆盖，见[修复记录](output/journey/repair-overlay/completion.md)、[指标](output/journey/repair-overlay/summary.json)和[对比](output/journey/repair-overlay/comparison-17.png)。

Q3修复复用完整求解图，逐条最优成功边核实真实搭档与等成本资源取舍，所有最优通路必须经历两类判断；允许不同路径和无关动作换序。缺失状态、unknown或预算耗尽不放行。三类固定旁路均拒收，多解正例保留。独立复验新32个第18主题备用盘和100个新盘，共16,011状态、2,241条挑战胜利边全部通过；旧反例仍被检出。见[开发修复](output/journey/repair-teaching/REPORT.md)、[独立复验](output/journey/repair-teaching-root/independent-regression.json)。这些均为开发回归，不计入最终隔离审核。

192个备用盘每主题32个，第18主题替换17盘；13–17的ID集合不变。Node每主题100次初测全部实时合格且各100个语义指纹不同，见[Node记录](output/journey/repair-teaching/node-generation.json)。存档修复的旧格式大文件导入、紧凑导出、重新上传与刷新证据见[存档修复指标](output/journey/repair-save-transfer/metrics.json)。

当前独立HTML真实Chromium内联Worker完成600次生成，全数在3秒内实时成功，无备用回退，各主题100个不同ID。

| 主题 | 实时成功 / 请求 | Worker P95（毫秒） | Worker最大（毫秒） |
| --- | --- | --- | --- |
| 13 | 100 / 100 | 24.0 | 26.7 |
| 14 | 100 / 100 | 38.8 | 56.5 |
| 15 | 100 / 100 | 212.7 | 290.7 |
| 16 | 100 / 100 | 336.4 | 548.3 |
| 17 | 100 / 100 | 386.9 | 573.3 |
| 18 | 100 / 100 | 192.2 | 457.8 |

以上为桌面Chromium移动端视口模拟，计入Worker启动墙钟时间，不代表物理手机性能或真人思考时长。[逐次浏览器记录](output/journey/storage-read-browser-generation-benchmark.json)、[基准日志](output/journey/storage-read-browser-benchmark.log)、[备用盘记录](output/journey/backups-report.json)。

## 验证边界

隔离审核中的离线验证采用先经本地HTTP加载独立HTML、再将浏览器上下文设为断网的方法，实际操作生成、配对与撤销；刷新恢复另以可用入口核验。部分Playwright CLI入口禁止直接打开`file://`，遇到限制的审核者未绕过。audit9规则会话首次通过常规run-code调用实际打开了本地文件并配对，见[该会话原始日志](output/journey/audit9/rules/ui-offline-file.log)；这是文件入口实测，不冒称其打开时浏览器已设为断网。开发浏览器回归另包含`offline file starts a new worker puzzle with no network`文件URL测试，并在[完整日志](output/journey/storage-read-full-verify.log)中通过；这不等同于审核者手动双击冷启动。手机布局使用桌面Chromium的移动视口模拟，未做物理手机或真人试玩。

离线导航方法补充：[原需求与环境边界核对](output/journey/audit8/offline-navigation-scope.md)。HTTP入口断网时重新导航根文档失败不等于已加载独立HTML不能离线运行；相应失败与file工具限制保留，不标记为成功。
