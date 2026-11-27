# Jelly Grove 项目约定

从改动处和直接调用方读起。改动共用行为时，追踪受影响的各个入口。按任务选读对应章节，先跑覆盖受影响行为的用例。

- 经典模式查 `src/main.ts`（界面）、`src/game.ts`（玩法）、`src/classic-levels.ts`（关卡）或 `src/storage.ts`（存档）。规则与布局见[经典模式](docs/classic.md)，逻辑用例在 `tests/logic/classic/`。
- 流转送达从 `src/journey/` 中的 `view.ts`、`rules.ts`、`generator.ts` 或 `storage.ts` 起查。参照[流转送达](docs/journey.md)及 `tests/logic/journey/`。随包分发的备用盘在 `src/journey/generated/`，定位盘面时按主题和种子提取。
- 共用配对和音效查 `src/engine.ts`、`src/audio.ts` 与 `tests/logic/shared/`。布局与交互在 `tests/browser/{classic,journey}/` 中选用例。页面往返与共用设置查 `tests/browser/navigation.spec.ts`。
- 验证、生成专项和发布按需查[开发指南](docs/development.md)。

文档维护现行契约、设计理由和操作指引。实现参数查代码和配置，变更历史查 Git 或 PR，单次验证随当次交付记录。
