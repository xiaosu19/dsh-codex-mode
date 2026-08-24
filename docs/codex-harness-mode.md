# Codex Harness 模式

`codex-harness-mode` 把 Codex 的模型可见工具契约和工程工作方式映射到 DSH，模型调用仍由用户在 DSH 中选择的 provider、endpoint 和模型完成。

它不启动 `codex` CLI，不连接 Codex app-server，不读取 `~/.codex`，也不要求 Codex/ChatGPT 登录。运行时边界如下：

```text
模型、推理档位、上下文容量 ── DSH provider
会话、工具调度、插件、Skills ── DSH
Codex 工具名、参数和提示层 ─── Codex Harness 兼容层
Shell、文件、沙箱、审批 ────── DSH 本地服务
```

## 与官方开源 Codex 的关系

OpenAI 公开的 [`openai/codex`](https://github.com/openai/codex) 包含完整的 Rust Agent 运行时。该运行时自己拥有模型传输、线程和 Agent loop；直接嵌入它会同时引入另一套模型认证与会话宿主，不符合本模式“使用 DSH 已配置模型”的目标。

本模式因此采用 DSH 原生适配：使用 `@shuind/dsh-codex-harness` 提供 Codex 兼容的 `exec_command`、`write_stdin`、`apply_patch`、`update_plan` 与提示层，实际执行仍委托给 DSH。适配包使用 MIT 许可证；官方 `openai/codex` 使用 Apache-2.0。

这不是对官方 Rust runtime 的逐行移植，也不声称与 Codex App 的未公开托管层完全一致。它保留的是能在 DSH provider 边界内可靠实现的 Harness 行为。

## Provider 边界

- 当前会话选择什么模型，就继续调用什么 DSH 模型。
- 推理档位继续由 DSH 模型配置和会话选择器控制。
- 上下文容量继续读取 DSH 模型的 `contextWindow`；上游同步插件新增模型后无需修改本 preset。
- `hostedWebSearch` 与 `remoteCompact` 固定关闭，避免兼容层直接请求 GPT Responses endpoint。
- 搜索使用 DSH 本地网页搜索工具，压缩使用 DSH compaction 服务。

## 安装

先把 Harness 兼容层加入 DSH Web profile，再安装 preset：

```bash
dsh plugin --profile web add @shuind/dsh-codex-harness@0.1.13
./install.sh --preset codex-harness-mode
```

`install.sh` 会检查依赖；如果本机 `dsh` 命令可用，它会在缺失时自动执行第一条命令。兼容层是本次新装时需要重启一次 DSH Web；之后只更新 preset 不需要重启。新建空白会话并选择「Codex Harness 模式」。

Windows PowerShell：

```powershell
dsh plugin --profile web add @shuind/dsh-codex-harness@0.1.13
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Preset codex-harness-mode
```

## 当前范围

第一版覆盖核心 Codex 工具契约、DSH provider 路由、上下文压缩、终端、Skills、本地网页搜索和用户提问。Codex app-server 的 thread/turn JSON-RPC、Codex 登录、托管搜索和远程压缩不进入本模式。
