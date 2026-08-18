# DSH Codex 模式

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的一个自定义 agent 预设：**Codex 模式**。

质量优先且控制成本的工程模式。按任务复杂度分配步骤预算，批量获取证据、最小修改、验证闭环；精简工具并提前压缩上下文，避免重复 `cd`、无效搜索和超长调用链。

## 这是什么

DSH 的一个 agent 预设就是一个目录，里面放两个文件：

| 文件 | 作用 |
| --- | --- |
| `agent.cordis.yml` | 组合定义：persona 提示词 + 挂载哪些工具行（必需） |
| `preset.yml` | 界面上显示的名字、描述、排序（可选） |

目录名就是预设 id。DSH 启动时扫描 `$DSH_HOME/.agent-presets/`（默认 `~/.dsh/.agent-presets/`），发现的预设会出现在会话的模式选择器里。

这个预设只用 DSH 自带的公开插件行，**没有额外依赖**，也不含任何密钥或个人配置。

## 安装

### macOS / Linux

```bash
git clone https://github.com/xiaosu19/dsh-codex-mode.git
cd dsh-codex-mode
./install.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/xiaosu19/dsh-codex-mode.git
cd dsh-codex-mode
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 手动安装

把 `presets/codex-mode/` 整个目录复制到预设根目录即可：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R presets/codex-mode ~/.dsh/.agent-presets/
```

如果设了 `$DSH_HOME`，就换成 `$DSH_HOME/.agent-presets/`。

安装完在 DSH 里新建一个会话，模式选择器里选「Codex 模式」。预设是每次调用时重新扫描的，所以不用重启进程。

### 覆盖已有安装

`install.sh` 默认拒绝覆盖。要更新已装的版本：

```bash
./install.sh --force
```

旧目录会先备份成 `codex-mode.bak.<时间戳>`，不会直接删掉。

## 卸载

```bash
rm -rf ~/.dsh/.agent-presets/codex-mode
```

## 这个预设装了什么

`agent.cordis.yml` 挂载的行，都是 DSH 公开的组合插件：

- **persona** — 授权判定、执行循环、步骤经济和工具纪律（这是这个预设的核心）
- **repository-instructions** — 读取仓库里的 agent 说明文件
- **持久 bash 终端** — shell 状态和当前目录跨调用保留，避免重复 `cd`
- **文件工具** — `read` / `write` / `edit` / `read_image`
- **skill 目录 + 加载器** — 本地 skill 发现
- **plan mode** — 只读调研，通过专用工具退出
- **结构化搜索** — `glob` / `grep` 使用 DSH 随包提供的 ripgrep，不依赖宿主机 PATH
- **上下文管理** — 通用阈值 0.45；`claude/claude-opus-5` 在约 10 万 token 时提前压缩并保留最近 32768 token；另带 `/compact` 命令和工具结果裁剪
- **重复调用刹车** — 同一个工具和参数连续重复时在第 2、4、6 次提醒
- **todo / ask-user** — 任务计划、必要时提问
- **web 搜索** — 联网检索（不含 fetch）

工具集是刻意精简的：保留文件读写与结构化 `glob` / `grep`，不再重复挂载另一套编辑器，也没有长期目标工具。搜索工具使用 DSH 自带的 ripgrep 二进制；Bash 只负责构建、测试、Git、脚本和运行时检查。压缩阈值比默认更早触发，用来压住长会话的重复输入成本。

模型是会话自己的设置，预设不锁定模型。

## 兼容性

在 `@deepseek-ai/dsh` `0.1.0-rc.6` / Node v24 上验证过。预设格式（`agent.cordis.yml` + `preset.yml`，目录名作 id）是 DSH 的公开约定，插件行也都是公开包，所以后续版本应该继续可用。如果某个插件行改名了，DSH 会把这个预设标成 broken 并在界面上给出原因。

不需要额外安装 ripgrep。`@deepseek-ai/dsh-tool-fs-search` 自带支持 macOS、Linux 和 Windows 的 ripgrep 二进制，并通过结构化 `glob` / `grep` 工具调用它；即使终端里的 `rg` 不在 PATH，代码检索也能正常工作。

当前安装为 provider id `claude`、model id `claude-opus-5` 配置了专用压缩策略。如果你的提供方或模型 id 不同，会使用通用策略；可以在 `modelPolicies` 中按实际的 provider/model 增加精确覆盖。

模型与推理档位仍由会话选择器控制。Claude 官方说明较高 effort 会产生更多思考、解释和工具调用，因此普通编辑、打包和发布任务建议从 **High** 开始；只有复杂架构判断或困难调试再选 **Max**，并在同一会话内保持档位稳定以利于缓存。

## 改成你自己的

复制 `presets/codex-mode/` 到一个新目录名（这就是新的预设 id），改 `preset.yml` 里的 `name`/`description`/`order`，再按需调 `agent.cordis.yml` 里的 persona 文字和插件行。`order` 决定它在选择器里的位置。

---

**English:** A custom agent preset for DeepSeek Harness — a quality-first, cost-aware repository engineering mode with explicit authorization rules, batched evidence gathering, minimal diffs, and a verification loop. Structured `glob` / `grep` uses DSH's packaged ripgrep binary, so no host `rg` install is required. The preset also applies an earlier exact-route compaction policy for `claude/claude-opus-5`. Run `./install.sh` (or `install.ps1` on Windows) to copy it into `$DSH_HOME/.agent-presets/`, then pick "Codex 模式" in the session mode picker. No extra dependencies, no credentials.

## License

MIT
