# Changelog

## v0.7.2 — 2026-08-25

- Codex PTC v15 改为能力优先路由，不再用云厂商、业务系统或内容类型名单决定 Agent 是否具有执行能力。
- 只有可证明为纯解释/文本生成、明确本地读取、仓库搜索或 Web 调研的任务进入原生快路径；所有未知、含糊或可能需要执行的任务默认保留任务级 `run_code` SDK。
- 实际查询、获取、调用、连接、同步、导出和数据处理等动作不依赖目标名称，能覆盖尚未出现的行业、系统、内容架构与任务形态。
- 独立的新知识问题可从 Code Mode 降回低成本原生回答；“继续”、错误回报和图片跟进仍保留正在进行的执行能力。
- 新增 30 项确定性回归和一条三回合 DSH 无副作用实测：未知领域为 `run_code`、明确只解释为 `read`、未知内容架构设计恢复为 `run_code`，工具调用均为 0。

## v0.7.1 — 2026-08-25

- Codex PTC v14 将 AWS、云资源、远程服务器、测试/生产环境、数据库和凭据驱动的实际查询路由到 Code Mode，不再先读取凭据再要求用户手动切换模式。
- 连续任务会结合上一回合的 presentation 和执行状态；“继续”“开始吧”、错误回报或图片跟进不会把正在修改、验证或部署的任务降成只读工具面。
- 扩充“调整、优化、新增、重新排版、重新设计、接入”等通用修改意图，并区分“测试环境”与“运行测试”。
- Code Mode 明确禁止通过 `read` 向模型暴露凭据文件内容，并禁止要求用户启用 `exec_command`；终端已通过生成 SDK 提供。
- 明确远程只读查询无需二次确认；用户已经点名部署或发布时，不再要求重复同一授权，同时继续拦住未授权外部写入、破坏性动作和范围扩张。
- 新增 29 项确定性回归与三条无副作用 DSH 新会话工具面验证；完整证据见 `docs/regression-v14-2026-08-25.md`。

## v0.7.0 — 2026-08-24

- 新增独立的 `codex-harness-mode`：在 DSH provider 上使用 Codex 兼容的 Agent 提示层与 `exec_command`、`write_stdin`、`apply_patch`、`update_plan` 工具契约。
- Harness 模式不启动 Codex CLI/app-server、不读取 Codex 登录，也不要求 OpenAI API key；模型、endpoint、推理档位和上下文容量继续由 DSH 管理。
- 固定关闭兼容层的 hosted Responses 搜索与远程压缩，防止模型请求绕过当前 DSH provider；搜索与压缩分别使用 DSH 本地服务。
- macOS/Linux、PowerShell 安装器和发布包支持第三个 preset，并在复制前检查固定版本的 Harness 适配依赖。
- 新增无凭据安装边界、provider 所有权和打包回归测试。
- Codex PTC v13 将小型有界 `glob` / `grep` / `read` 纳入原生快路径；多个或依赖调用不再自动触发程序生成。
- Code Mode 仅在修改/命令流水线或大扇出结果压缩有收益时启用，并通过 per-agent restriction 裁剪生成 SDK 的工具集合。

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
