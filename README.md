# DSH Codex 模式

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的一个自定义 agent 预设：**Codex 模式**。

质量优先且控制成本的通用工程模式。按任务复杂度分配步骤预算，批量获取证据、最小修改、验证闭环；使用结构化 `workdir` 和按上下文容量缩放的压缩策略，避免重复 `cd`、无效搜索和超长调用链。

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

安装完在 DSH 里新建一个会话，模式选择器里选「Codex 模式」，不用重启进程。已经打开的会话会继续使用创建时的预设代际和历史上下文，不会在中途换成新文件。

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
- **无状态 Bash / PowerShell + 后台任务** — 每次调用用结构化 `workdir` 指定目录；长任务可由 `job_output` / `job_list` / `job_kill` 管理
- **文件工具** — `read` / `write` / `edit` / `read_image`
- **skill 目录 + 加载器** — 本地 skill 发现
- **plan mode** — 只读调研，通过专用工具退出
- **结构化搜索** — `glob` / `grep` 使用 DSH 随包提供的 ripgrep，不依赖宿主机 PATH
- **上下文管理** — 所有 provider/model 共用 `thresholdRatio: 0.16`、`retainRatio: 0.04`，按模型实际上下文容量自动换算；另带 `/compact` 命令和工具结果裁剪
- **重复调用刹车** — 同一个工具和参数连续重复时在第 2、4、6 次提醒
- **todo / ask-user** — 任务计划、必要时提问
- **web 搜索** — 联网检索（不含 fetch）

工具集是刻意精简的：保留文件读写与结构化 `glob` / `grep`，不再重复挂载另一套编辑器，也没有长期目标工具。搜索工具使用 DSH 自带的 ripgrep 二进制；Bash/PowerShell 只负责构建、测试、Git、脚本和运行时检查。Shell 的目录由 `workdir` 参数承载，不依赖会话间残留状态。压缩阈值比默认更早触发，用来压住长会话的重复输入成本。

聊天中直接附加的图片由支持视觉的当前模型直接读取，不需要本地路径。`read_image` / `modlens_read_image` 只用于消息里明确给出的本地路径或 URL；预设禁止把聊天附件猜成工作区里的 `image.png`。对于纯文本模型，仍可使用 modlens 的粘贴转路径或 `(modlens vision)` 路由，规则不绑定某个模型名。

模型是会话自己的设置，预设不锁定模型。

## 兼容性

在 `@deepseek-ai/dsh` `0.1.0-rc.6` / Node v24 上验证过。预设格式（`agent.cordis.yml` + `preset.yml`，目录名作 id）是 DSH 的公开约定，插件行也都是公开包，所以后续版本应该继续可用。如果某个插件行改名了，DSH 会把这个预设标成 broken 并在界面上给出原因。

不需要额外安装 ripgrep。`@deepseek-ai/dsh-tool-fs-search` 自带支持 macOS、Linux 和 Windows 的 ripgrep 二进制，并通过结构化 `glob` / `grep` 工具调用它；即使终端里的 `rg` 不在 PATH，代码检索也能正常工作。

压缩策略不包含 provider 或 model 名称。DSH 会用路由返回的 `contextWindow` 计算阈值：26.2 万上下文约在 4.19 万 token 触发并保留约 1.05 万；100 万上下文约在 16 万触发并保留 4 万。该比例已在这两档真实路由上验证。对于低于 13 万上下文且工具目录很大的自定义模型，应先测量首个请求的固定开销，再按需要提高 `thresholdRatio`。

模型与推理档位仍由会话选择器控制，预设不会改写它们。普通编辑、打包和发布任务建议从 **High**（或模型的默认档）开始；只有复杂架构判断或困难调试再选 **Max**。步骤经济、工具选择和压缩策略对 provider/model 一视同仁。

## 已有会话和迁移会话

预设升级不会重写已有消息、工具调用或压缩摘要。迁移自 Codex 的旧会话如果已经包含大量 `cd /路径 && ...` 工具轨迹，模型可能继续模仿这些历史示例，即使新 persona 已经加载。日志测试中，同一模型在旧迁移会话里仍反复使用 Bash，而在全新会话里能在 3–4 步内只用 `glob` / `grep` / `read` 完成相同只读任务。

因此验证新版时应新建空白会话，不要只在旧会话里续跑；分支会话会继承历史，也不适合作为干净基线。需要延续旧任务时，把仍有效的目标、已改文件和待验证事项简要带入新会话即可。

## 改成你自己的

复制 `presets/codex-mode/` 到一个新目录名（这就是新的预设 id），改 `preset.yml` 里的 `name`/`description`/`order`，再按需调 `agent.cordis.yml` 里的 persona 文字和插件行。`order` 决定它在选择器里的位置。

---

**English:** A provider-neutral custom agent preset for DeepSeek Harness — a quality-first, cost-aware repository engineering mode with explicit authorization rules, batched evidence gathering, structured shell `workdir`, minimal diffs, and a verification loop. Structured `glob` / `grep` uses DSH's packaged ripgrep binary, and compaction scales from the routed model's context window without provider/model allowlists. Run `./install.sh` (or `install.ps1` on Windows) to copy it into `$DSH_HOME/.agent-presets/`, then start a new session and pick "Codex 模式". No extra dependencies, no credentials.

## License

MIT
