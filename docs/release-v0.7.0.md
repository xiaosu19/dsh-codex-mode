# v0.7.0：Codex PTC v13 与可选 Codex Harness 模式

本版本把 Codex PTC 的工具选择从“只要需要搜索就生成程序”调整为按实际收益路由，并新增一个彼此独立、可选安装的 Codex Harness preset。三个模式继续使用 DSH 会话选择的模型、endpoint、推理档位和上下文容量。

## Codex PTC v13

- 少量读取直接使用原生 `read`。
- 小型仓库检索直接使用受限的 `glob` / `grep` / `read`，不再生成无收益的 TypeScript 程序。
- 修改、Shell/测试链和大扇出聚合继续使用 `run_code`。
- Code Mode 只生成当前任务需要的 SDK 工具面，减少固定上下文。
- 路由依据任务形态，不包含测试文件名、路径、字段或答案，因此不是针对 benchmark 调参。

2026-08-24 使用 `gpt-5.6-sol Low`，在相同 DSH、相同题目下比较 v12/v13：

| 两题合计 | v12 | v13 | 变化 |
| --- | ---: | ---: | ---: |
| 回合耗时 | 50.566s | 48.480s | -4.1% |
| 输入 token | 109,982 | 57,056 | -48.1% |
| 输出 token | 4,457 | 4,173 | -6.4% |
| 总 token | 114,439 | 61,229 | -46.5% |
| 步骤 | 8 | 7 | -1 |

两题均正确，修改题独立重跑为 4/4 通过。测试期间开启了 VPN/代理，而且每个组合只有一次新会话样本；速度只能作为方向性结果，不能视为稳定 P50/P95。token、工具面和正确性是本轮更可靠的比较证据。完整报告见 [`benchmark-v13-2026-08-24.md`](https://github.com/xiaosu19/dsh-codex-mode/blob/main/docs/benchmark-v13-2026-08-24.md)，原始数据见 [`2026-08-24-v13-sol-low-vpn.json`](https://github.com/xiaosu19/dsh-codex-mode/blob/main/benchmarks/2026-08-24-v13-sol-low-vpn.json)。

## Codex Harness 模式

新增 `codex-harness-mode`，通过固定版本的 `@shuind/dsh-codex-harness` 提供 Codex 兼容的核心工具契约和提示层，但模型传输、终端、文件、沙箱、Skills、搜索与压缩仍由 DSH 管理。它不启动 Codex CLI/app-server，不读取 `~/.codex`，也不要求 Codex/ChatGPT 登录或额外的 OpenAI API key。

Harness 模式是可选方案，不替代 Codex PTC：前者更接近 Codex 工具契约，后者针对 DSH 内的 token 效率和混合工具编排优化。详细边界见 [`codex-harness-mode.md`](https://github.com/xiaosu19/dsh-codex-mode/blob/main/docs/codex-harness-mode.md)。

## 安装

```bash
./install.sh
./install.sh --preset codex-ptc-mode
./install.sh --preset codex-harness-mode
```

已有安装更新时加 `--force`；安装器会先保留带时间戳的备份。Harness 首次加入 Web profile 后需要重启一次 DSH Web，另外两个模式更新后新建空白会话即可。
