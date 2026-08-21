# Changelog

## v0.6.0 — 2026-08-21

- 发布独立的自适应 `codex-ptc-mode` preset；简单有界只读任务走原生工具，其余任务走 Code Mode SDK。
- 使用 per-agent presentation 状态，避免不同会话之间的工具面泄漏。
- 为 Codex 与 Codex PTC 增加非阻断阶段/证据控制器，不把收敛建议变成工具错误。
- 安装器与发布包同时支持 `codex-mode` 和 `codex-ptc-mode`，覆盖前自动备份。
- 新增 21 项确定性测试、多模型 Max benchmark、原生快路径和 Code 路径真实回归。
- 完整测试数据与网络限制见 `docs/benchmark-max-2026-08-21.md`。

## v0.2.0 — 2026-08-18

- 重写 Codex persona 的授权、执行循环、步骤经济和工具纪律。
- 精简重复工具，提前压缩长上下文。

## v0.1.0 — 2026-08-18

- 首次发布 Codex 模式 preset。
