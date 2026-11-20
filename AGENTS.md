# Jelly Grove 项目约定

- 开发、构建和测试入口见 [README.md](README.md)。Node.js 24 与 GitHub Pages 工作流一致。全量回归用 `npm run verify`，专项验证见 [VALIDATION.md](VALIDATION.md)。
- `src/engine.ts`、`src/game.ts` 和 `src/storage.ts` 对应经典三模式。流转送达由 `src/journey/` 维护，试玩存档的键和格式独立。改动配对、存档或模式切换时核对两边的受影响行为，保留旧档读入与导入导出往返。
- [DESIGN.md](DESIGN.md) 维护经典玩法、紧凑对局和音效契约，[LEVEL-DESIGN.md](LEVEL-DESIGN.md) 维护流转送达的规则和生成质量。试玩实现限于主题 13–18。改生成或认证时验证独立模型与真实 Worker 预算，只有备用盘内容需要更新时才运行 `npm run journey:backups`。
- `dist/果冻果园.html` 是单文件离线包，也是 Pages 的发布输入。改动资源引用、Worker 或打包时验证断网 `file://` 冷启动。截图、报告和基准输出写入项目根的 `output/`。
