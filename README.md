# DSH Codex + Codex PTC

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 在真实代码库任务中具备更稳定的工程闭环，并根据任务形态在质量、速度和 token 成本之间做选择。本项目提供两个可同时安装、彼此独立的用户级 agent preset：**Codex 模式**与 **Codex PTC 模式**。

## 项目优势

- **完整的工程闭环**：围绕理解目标、收集证据、最小修改和验证结果组织执行，不把“写完代码”误当成“任务完成”。
- **减少无效工具调用**：使用结构化 `workdir`、定向搜索、证据账本和一次性收敛建议，降低重复 `cd`、重复读取、根目录扫描和超长工具链。
- **按任务选择工具面**：既保留直接、稳定的原生工具模式，也提供能把搜索、命令、修改与验证编排进一次程序的 PTC 模式，不强迫所有任务使用同一种执行方式。
- **控制长任务 token 成本**：按模型真实上下文容量提前压缩、裁剪工具结果；Codex PTC 还会让简单读取避开 TypeScript 生成，只在程序编排有收益时使用 `run_code`。
- **非阻断式控制**：运行时控制器只依据真实工具结果给出一次性建议，不拒绝工具调用，也不会把正常收敛提醒制造成红色错误。
- **模型与 provider 中立**：工具策略和压缩比例不绑定模型名称，可用于 GPT、Claude、DeepSeek 等不同路由；模型和推理档位仍由会话自行选择。
- **轻量、可审计**：使用 DSH 的公开插件行和事件钩子，控制器仅依赖 Node.js 内置模块，不引入密钥、个人配置或第三方运行时依赖。

## 两个模式怎么选

| 模式 | preset id | 核心策略 | 更适合 |
| --- | --- | --- | --- |
| Codex 模式 | `codex-mode` | 模型直接调用原生文件、搜索与 Shell 工具，控制器维护阶段和证据 | 重视严格输出、稳定性和通用工程控制的任务 |
| Codex PTC 模式 | `codex-ptc-mode` | 简单有界读取走原生快路径；搜索、扇出、命令、修改和验证链走 `run_code` + SDK | 希望降低输入 token，并用程序完成确定性多步编排的任务 |

### Codex 模式

Codex 模式以质量和稳定性为优先。persona 定义授权边界与工程原则，模型直接使用 DSH 原生工具完成探索、修改和验证；本地控制器根据真实执行结果维护 `orient → decide → implement/recover → verify` 阶段与证据账本。

它适合需求复杂、需要频繁语义判断、修改范围尚不明确，或者对最终验证和严格输出要求较高的通用软件工程任务。原生工具轨迹更直观，也更容易逐步检查和恢复。

### Codex PTC 模式

Codex PTC 保留 Codex 模式的授权、最小相关面、最小修改和验证闭环，同时加入自适应工具面选择器：少量、路径明确的纯读取直接使用原生 `read`，不生成 TypeScript；需要搜索、目录扇出、Shell、写入或验证依赖链时，使用 Code Mode SDK 和 `run_code` 把确定性步骤集中编排。

它不是让所有任务强制走 PTC，也不是固定同时暴露两套工具。选择依据是任务形态，而不是模型名称、仓库路径或测试答案，因此优化能够推广到真实工程任务。它更适合工具调用较多、可程序化串联，并且希望控制输入 token 的工作。

两个模式拥有不同的目录 id 和显示名称，可以同时安装，不会互相覆盖。安装后新建空白会话，即可在模式选择器中分别选择「Codex 模式」或「Codex PTC 模式」。

## v0.6.0 实测摘要

2026-08-21 在 DSH `0.1.0-rc.6` 上使用 5 个模型、4 种模式、统一 Max 跑了一轮受控只读基准。Codex PTC 的输入 token 合计比 Codex 少 **34.2%**、比 Standard 少 **43.0%**、比 PTC 少 **51.9%**；中位耗时为 **13.45 秒**，与 Codex 的 **13.54 秒**接近。严格输出成功率为 4/5，Standard 与 Codex 为 5/5，因此它是“更省输入的混合工程模式”，不是每个模型上都绝对最快或最稳。

测试期间开启了 VPN/代理。耗时会受首 token、provider 负载和传输重试影响，尤其 Sonnet 5 出现明显网络长尾；输入/输出 token、工具调用路径和严格成功率更适合作为稳定比较依据。完整逐模型数据、前后原因、code-only 对比和限制见 [Codex PTC v12 多模型 Max 基准报告](docs/benchmark-max-2026-08-21.md)，机器可读数据见 [`benchmarks/2026-08-21-max-vpn.json`](benchmarks/2026-08-21-max-vpn.json)。

## 这是什么

DSH 的一个 agent preset 就是一个目录。本仓库的两个 preset 各自包含组合、界面元数据和独立控制器：

| 文件 | 作用 |
| --- | --- |
| `agent.cordis.yml` | 组合定义：persona 提示词 + 挂载哪些工具行（必需） |
| `preset.yml` | 界面上显示的名字、描述、排序（可选） |
| `presets/codex-mode/controller/runtime-v6.mjs` | Codex 模式的阶段/证据控制器 |
| `presets/codex-ptc-mode/controller/runtime-v12.mjs` | Codex PTC 的阶段/证据控制器和自适应工具面选择器 |

目录名就是预设 id。DSH 启动时扫描 `$DSH_HOME/.agent-presets/`（默认 `~/.dsh/.agent-presets/`），发现的预设会出现在会话的模式选择器里。

组合只使用 DSH 的公开插件行和公开事件钩子。本地控制器仅依赖 Node 内置模块，不需要安装第三方运行时依赖，也不含任何密钥或个人配置。

## 安装

### macOS / Linux：安装两个模式

```bash
git clone https://github.com/xiaosu19/dsh-codex-mode.git
cd dsh-codex-mode
./install.sh
./install.sh --preset codex-ptc-mode
```

### Windows (PowerShell)：安装两个模式

```powershell
git clone https://github.com/xiaosu19/dsh-codex-mode.git
cd dsh-codex-mode
powershell -ExecutionPolicy Bypass -File .\install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Preset codex-ptc-mode
```

### 只安装 Codex PTC 混合模式

仓库同时包含独立的 `codex-ptc-mode` preset。默认安装行为仍是上面的 `codex-mode`；只有显式传参才安装混合模式：

```bash
./install.sh --preset codex-ptc-mode
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Preset codex-ptc-mode
```

它会安装到 `$DSH_HOME/.agent-presets/codex-ptc-mode/`（默认 `~/.dsh/.agent-presets/codex-ptc-mode/`），显示为「Codex PTC 模式」。该模式保留 Codex 模式的授权、最小相关面、最小修改、验证闭环、软步骤预算、证据账本、非阻断检查点和提前压缩。运行时会在每个用户回合开始前选择紧凑工具面：有明确文件边界、无需搜索或目录扇出、无需命令和修改的少量纯读取使用原生工具快路径，不生成 TypeScript；其余任务保持 DSH Code Mode 的 `run_code` + 生成 SDK。确定性的搜索或操作依赖链默认在一次程序内完成，例如 `read → derive → glob/grep → read → extract`；只有出现语义选择、授权边界或需要用户输入时才返回模型开启下一步。它不使用固定 `both`，因此不会让每一步同时承担原生工具 schema 和 SDK 的双份上下文。首版不加入 goal、subagent、workflow 或 Ralph。覆盖更新使用 `--force` / `-Force`，安装器会先保留时间戳备份。

工具编排规则也按当前工具面动态注入：原生只读回合只携带简短的有界读取契约并只暴露 `read` schema；只有 Code Mode 回合才恢复完整能力并携带 SDK、搜索、Shell、写入、失败恢复、发布和验证规则。选择依据是任务形态，而不是仓库路径、测试字段或预期答案。

### 手动安装

把两个 preset 目录分别复制到预设根目录：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R presets/codex-mode ~/.dsh/.agent-presets/
cp -R presets/codex-ptc-mode ~/.dsh/.agent-presets/
```

如果设了 `$DSH_HOME`，就换成 `$DSH_HOME/.agent-presets/`。

安装完在 DSH 里新建一个空白会话，模式选择器中会分别出现「Codex 模式」和「Codex PTC 模式」。正式版本会在控制器行为变化时提升 `runtime-vN.mjs` 的文件名，绕过 Node 的 ESM URL 缓存，因此从正式版本升级后通常不用重启 DSH；如果直接原地修改同一个本地控制器文件名，则需要重启 DSH 或同时提升文件名。已经打开的会话会继续使用创建时的预设代际和历史上下文，不会在中途换成新文件。

### 覆盖已有安装

`install.sh` 默认拒绝覆盖。要更新已装的版本：

```bash
./install.sh --force
```

旧目录会先备份成 `codex-mode.bak.<时间戳>`，不会直接删掉。

## 卸载

```bash
rm -rf ~/.dsh/.agent-presets/codex-mode
rm -rf ~/.dsh/.agent-presets/codex-ptc-mode
```

## 这些预设装了什么

`agent.cordis.yml` 挂载的行，都是 DSH 公开的组合插件：

- **persona** — 授权判定、执行循环、步骤经济和工具纪律（这是这个预设的核心）
- **runtime controller** — 按 turn 观察真实工具与结果，维护 `orient → decide → implement/recover → verify` 阶段、证据指纹和最近目标；正常执行时保持静默，同一阶段的漂移检查点只注入一次
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

### 控制器怎样工作

控制器不是第二套大提示词，也不读取或要求模型暴露隐藏思维过程。它只使用 DSH 已经产生的可审计事实：当前模型步骤、工具名、参数、成功/失败、结果指纹和目标路径。

- 第 4 个 discovery 模型步骤仍未形成交付方向时，注入一次 orientation 检查点；第 7 个注入一次 decision 检查点。相同 decision 不会在第 12、16、20 步反复进入历史。
- 检查点只要求模型利用现有证据选取最短下一步；正确性确实需要时，定向 `read` / `grep` / `glob` 仍可继续执行。第 24 步的 convergence 也只是一次建议，不是强制停止。
- 第 3 次可由 `glob` / `grep` / `read` 覆盖的 shell 文件搜索会收到一次路由建议。后续同类调用仍可执行；构建、测试、Git、CLI/运行时检查不受影响。
- 第二次内嵌 `cd` 时给一次 `workdir` 建议；第二次文件系统根扫描时给一次范围建议。它们都不会安装 `tools/pre-execute` 拒绝器。

这些阈值位于 `agent.cordis.yml` 的 `codex-controller` 配置中。默认且唯一的运行姿态是非阻断建议：控制器观察和记录，模型决定下一步，真实工具失败才显示为错误。

工具集是刻意精简的：保留文件读写与结构化 `glob` / `grep`，不再重复挂载另一套编辑器，也没有长期目标工具。搜索工具使用 DSH 自带的 ripgrep 二进制；Bash/PowerShell 主要负责构建、测试、Git、脚本和运行时检查。Shell 的目录由 `workdir` 参数承载，不依赖会话间残留状态。压缩阈值比默认更早触发，用来压住长会话的重复输入成本；provider 本身不支持 prompt cache 时，DSH 仍会正常执行，只是统计里的输入会保持未缓存。

步骤控制优先依靠 persona 的可执行规则，而不是工具拦截：用户明确给出的步骤上限必须为最终答复预留一步；只读审计通常一批发现加一次定向补充后就交付；现有定向测试已经覆盖某项不变量时，不再同时用源码正则、内联测试程序和第二条分发链重复证明。复合命令只有一部分失败时，只修正并重跑失败部分。

聊天中直接附加的图片由支持视觉的当前模型直接读取，不需要本地路径。`read_image` / `modlens_read_image` 只用于消息里明确给出的本地路径或 URL；预设禁止把聊天附件猜成工作区里的 `image.png`。对于纯文本模型，仍可使用 modlens 的粘贴转路径或 `(modlens vision)` 路由，规则不绑定某个模型名。

模型是会话自己的设置，预设不锁定模型。

## 兼容性

在 `@deepseek-ai/dsh` `0.1.0-rc.6` / Node v24 上验证过。预设目录、插件行以及 `agent/pre-step`、`tools/post-execute` 都使用 DSH 的公开约定。控制器刻意不注册 `tools/pre-execute`，因为 DSH 会把 guard denial 持久化为红色工具错误。如果后续 DSH 更改了插件名或事件协议，组合阶段会失败并暴露原因，不会静默退化成只有 persona 的模式。

不需要额外安装 ripgrep。`@deepseek-ai/dsh-tool-fs-search` 自带支持 macOS、Linux 和 Windows 的 ripgrep 二进制，并通过结构化 `glob` / `grep` 工具调用它；即使终端里的 `rg` 不在 PATH，代码检索也能正常工作。

压缩策略不包含 provider 或 model 名称。DSH 会用路由返回的 `contextWindow` 计算阈值：26.2 万上下文约在 4.19 万 token 触发并保留约 1.05 万；100 万上下文约在 16 万触发并保留 4 万。该比例已在这两档真实路由上验证。对于低于 13 万上下文且工具目录很大的自定义模型，应先测量首个请求的固定开销，再按需要提高 `thresholdRatio`。

模型与推理档位仍由会话选择器控制，预设不会改写它们。普通编辑、打包和发布任务建议从 **High**（或模型的默认档）开始；只有复杂架构判断或困难调试再选 **Max**。步骤经济、工具选择和压缩策略对 provider/model 一视同仁。

## 验证

本仓库的确定性控制器测试：

```bash
npm test
```

测试覆盖工具分类、阶段迁移、一次性检查点、根扫描建议、shell 搜索渐进纠偏、`cd`/`workdir` 分流，以及运行时不存在 `tools/pre-execute` 拒绝器。发布包还应执行 `scripts/pack.sh`，从 zip 与 tar.gz 各自解压安装，并由 DSH `agentPreset.list` 和新会话实际 mount 验证。

开发时用同一个失败测试 fixture 分别跑过 Claude、GPT 和 DeepSeek 路由：三者都完成了一行最小修改并通过 2/2 测试。真实长任务也暴露过旧硬保护的反例：“给共享记忆插件增加 GUI 面板”在 24 步内收到 7 次控制器上下文和 9 次控制器制造的工具错误，其中 decision 在第 8、12、16、20 步重复注入。v6 因此移除了 discovery lease 和所有 pre-execute denial；这个失败轨迹已固化为“一次注入、零拒绝”的运行时回归条件。

## 已有会话和迁移会话

预设升级不会重写已有消息、工具调用或压缩摘要。迁移自 Codex 的旧会话如果已经包含大量 `cd /路径 && ...` 工具轨迹，模型可能继续模仿这些历史示例，即使新 persona 已经加载。日志测试中，同一模型在旧迁移会话里仍反复使用 Bash，而在全新会话里能在 3–4 步内只用 `glob` / `grep` / `read` 完成相同只读任务。

因此验证新版时应新建空白会话，不要只在旧会话里续跑；分支会话会继承历史，也不适合作为干净基线。需要延续旧任务时，把仍有效的目标、已改文件和待验证事项简要带入新会话即可。

## 改成你自己的

复制 `presets/codex-mode/` 到一个新目录名（这就是新的预设 id），改 `preset.yml` 里的 `name`/`description`/`order`，再按需调 `agent.cordis.yml` 里的 persona 文字和插件行。`order` 决定它在选择器里的位置。

---

**English:** Provider-neutral Codex and adaptive Codex PTC agent presets for DeepSeek Harness. Codex Mode is a quality-first repository engineering mode with explicit authorization, a non-blocking phase/evidence controller, structured `workdir`, minimal diffs, and verification loops. Codex PTC adds a task-shape selector: bounded reads stay on the native fast path without generated TypeScript, while search, fan-out, commands, mutation, and verification pipelines use the Code Mode SDK through `run_code`. In the 2026-08-21 single-run Max benchmark, Codex PTC used 34.2% fewer aggregate input tokens than Codex, with important VPN, endpoint, and sample-size caveats documented in the full report. Install it with `./install.sh --preset codex-ptc-mode` (or `install.ps1 -Preset codex-ptc-mode` on Windows), then start a fresh session and select "Codex PTC 模式". No third-party controller dependencies and no credentials.

## License

MIT
