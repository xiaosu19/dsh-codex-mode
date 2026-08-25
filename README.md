# DSH Codex + Codex PTC + Codex Harness

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 在真实代码库任务中具备更稳定的工程闭环，并根据任务形态在质量、速度和 token 成本之间做选择。本项目提供三个可同时安装、彼此独立的用户级 agent preset：**Codex 模式**、**Codex PTC 模式**与使用 DSH 模型路由的 **Codex Harness 模式**。

## 项目优势

- **完整的工程闭环**：围绕理解目标、收集证据、最小修改和验证结果组织执行，不把“写完代码”误当成“任务完成”。
- **减少无效工具调用**：使用结构化 `workdir`、定向搜索、证据账本和一次性收敛建议，降低重复 `cd`、重复读取、根目录扫描和超长工具链。
- **按任务选择工具面**：既保留直接、稳定的原生工具模式，也提供能把批量过滤、命令、修改与验证编排进一次程序的 PTC 模式；小型搜索不会仅因存在多个或依赖调用就被迫生成程序，AWS/API/远程环境任务也不会误降成只读模式。
- **控制长任务 token 成本**：按模型真实上下文容量提前压缩、裁剪工具结果；Codex PTC 还会按任务限制原生 schema 或生成 SDK 的工具集合，只在程序编排或中间结果压缩有收益时使用 `run_code`。
- **非阻断式控制**：运行时控制器只依据真实工具结果给出一次性建议，不拒绝工具调用，也不会把正常收敛提醒制造成红色错误。
- **模型与 provider 中立**：模型、endpoint、推理档位和上下文容量始终由 DSH 会话与 provider 管理，可用于 GPT、Claude、DeepSeek 等不同路由；Codex Harness 模式也不要求 Codex 登录。
- **轻量、可审计**：两个原生模式的控制器仅依赖 Node.js 内置模块；可选 Harness 模式的适配包固定版本并在安装前检查。仓库不引入密钥或个人配置。

## 三个模式怎么选

| 模式 | preset id | 核心策略 | 更适合 |
| --- | --- | --- | --- |
| Codex 模式 | `codex-mode` | 模型直接调用原生文件、搜索与 Shell 工具，控制器维护阶段和证据 | 重视严格输出、稳定性和通用工程控制的任务 |
| Codex PTC 模式 | `codex-ptc-mode` | 有界读取/搜索走精简原生工具；修改、命令或大扇出聚合走任务级精简 `run_code` SDK | 希望降低输入 token，并用程序完成确定性多步编排的任务 |
| Codex Harness 模式 | `codex-harness-mode` | Codex 兼容的核心工具名、参数与提示层；执行和模型传输仍由 DSH 完成 | 希望在 DSH 插件生态里获得最接近 Codex 工具契约的体验 |

### Codex 模式

Codex 模式以质量和稳定性为优先。persona 定义授权边界与工程原则，模型直接使用 DSH 原生工具完成探索、修改和验证；本地控制器根据真实执行结果维护 `orient → decide → implement/recover → verify` 阶段与证据账本。

它适合需求复杂、需要频繁语义判断、修改范围尚不明确，或者对最终验证和严格输出要求较高的通用软件工程任务。原生工具轨迹更直观，也更容易逐步检查和恢复。

### Codex PTC 模式

Codex PTC 保留 Codex 模式的授权、最小相关面、最小修改和验证闭环，同时加入自适应工具面选择器。有界读取使用原生 `read`；小型仓库检索使用受限的原生 `glob` / `grep` / `read`；带引用的 Web 调研保持直接工具调用。修改、Shell/测试链，以及需要对大量中间结果进行统计、过滤、去重、排序或聚合的任务，才使用 Code Mode 和 `run_code`。

进入 Code Mode 后也不会默认生成全量 SDK：控制器通过 DSH 的 scope restriction 只保留当前任务需要的文件、搜索、Shell、Job、Skill，以及必要时的 Web 工具。选择依据是任务形态，而不是模型名称、仓库路径或测试答案，因此优化能够推广到真实工程任务。

路由器还会保留连续任务的必要能力。上一回合正在修改、验证、修复或部署时，下一句“继续”“开始吧”、错误日志或图片跟进会继续使用 Code Mode；只有明确提出独立的“只读取/只解释、不修改”请求才降回原生工具面。涉及 AWS、云资源、远程服务器、测试/生产环境、数据库、CLI/API 或凭据驱动的实际查询时会直接进入 Code Mode，模型不应要求用户另外切换模式或启用 `exec_command`。

### Codex Harness 模式

Codex Harness 模式面向“在 DSH 中使用 Codex Agent 工作方式，但继续调用 DSH 已配置模型”的场景。它通过 [`@shuind/dsh-codex-harness`](https://github.com/shuind/dsh-codex-harness) 把 `exec_command`、`write_stdin`、`apply_patch`、`update_plan` 与 Codex 风格提示层映射到 DSH 的 Shell、文件系统、沙箱、会话和 todo 服务。

该模式不运行 Codex CLI/app-server，不读取 `~/.codex`，不要求 Codex/ChatGPT 登录或额外的 OpenAI API key。为确保 provider 边界，preset 固定关闭兼容层的 hosted Responses 搜索与 `/responses/compact`；本地搜索和上下文压缩继续使用 DSH 服务。具体边界见 [Codex Harness 模式说明](docs/codex-harness-mode.md)。

三个模式拥有不同的目录 id 和显示名称，可以同时安装，不会互相覆盖。安装后新建空白会话，即可分别选择「Codex 模式」「Codex PTC 模式」或「Codex Harness 模式」。

### 在插件市场或 GitHub Topic 中搜索

仓库已经带有 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic。在 DSH 的插件市场页面可以搜索：

- `dsh-codex-mode`
- `xiaosu19`
- `Codex PTC`

市场可以发现这个仓库，但只接受 `dsh.bundle.patch` 的市场实现会把它标为“不可作为 profile 插件安装”。请按本 README 的 `install.sh` / `install.ps1` 安装 preset。若市场使用缓存索引，新发布或更新后的仓库可能要等下一次索引刷新才出现。

## v0.6.0 实测摘要

2026-08-21 在 DSH `0.1.0-rc.6` 上使用 5 个模型、4 种模式、统一 Max 跑了一轮受控只读基准。Codex PTC 的输入 token 合计比 Codex 少 **34.2%**、比 Standard 少 **43.0%**、比 PTC 少 **51.9%**；中位耗时为 **13.45 秒**，与 Codex 的 **13.54 秒**接近。严格输出成功率为 4/5，Standard 与 Codex 为 5/5，因此它是“更省输入的混合工程模式”，不是每个模型上都绝对最快或最稳。

测试期间开启了 VPN/代理。耗时会受首 token、provider 负载和传输重试影响，尤其 Sonnet 5 出现明显网络长尾；输入/输出 token、工具调用路径和严格成功率更适合作为稳定比较依据。完整逐模型数据、前后原因、code-only 对比和限制见 [Codex PTC v12 多模型 Max 基准报告](docs/benchmark-max-2026-08-21.md)，机器可读数据见 [`benchmarks/2026-08-21-max-vpn.json`](benchmarks/2026-08-21-max-vpn.json)。

## v13 路由优化实测

2026-08-24 使用 `gpt-5.6-sol Low` 对同一组跨文件只读题和最小修复题进行 v12/v13 前后对比。两题均正确，修复题独立重跑 4/4 通过；v13 输入 token 合计从 109,982 降到 57,056（**-48.1%**），总 token 从 114,439 降到 61,229（**-46.5%**），总回合耗时从 50.566 秒降到 48.480 秒（**-4.1%**）。只读题改走受限原生 `glob` / `grep` / `read`，修改题继续使用裁剪后的 Code SDK。

这也是 VPN/代理环境下的单次方向性样本，不能当作稳定 P50/P95。完整前后数据、固定上下文差异、原因和限制见 [Codex PTC v13 通用路由优化实测](docs/benchmark-v13-2026-08-24.md)，机器可读数据见 [`benchmarks/2026-08-24-v13-sol-low-vpn.json`](benchmarks/2026-08-24-v13-sol-low-vpn.json)。

## v14 连续任务与外部能力回归

2026-08-25 从两条真实 DSH 会话日志确认，v13 会把 AWS 账号查询、错误修复以及“继续部署”等跟进错误切成 `read` 或 `glob` / `grep` / `read`，导致模型反复要求用户切换 Code Mode。v14 增加外部执行意图与连续工作流状态，修复后 29/29 项确定性测试通过；使用 `gpt-5.6-sol Low` 的无副作用新会话检查中，虚构 AWS/AKSK 查询、随后“继续”和测试环境 SP 数据获取三种输入都保持 `run_code`，且没有发出工具调用或使用真实凭据。完整脱敏证据见 [Codex PTC v14 能力连续性回归报告](docs/regression-v14-2026-08-25.md)。

## 这是什么

DSH 的一个 agent preset 就是一个目录。本仓库的三个 preset 都包含组合与界面元数据；两个 DSH 原生模式另带独立控制器，Harness 模式把 Codex 工具运行层交给固定版本的兼容插件：

| 文件 | 作用 |
| --- | --- |
| `agent.cordis.yml` | 组合定义：persona 提示词 + 挂载哪些工具行（必需） |
| `preset.yml` | 界面上显示的名字、描述、排序（可选） |
| `presets/codex-mode/controller/runtime-v6.mjs` | Codex 模式的阶段/证据控制器 |
| `presets/codex-ptc-mode/controller/runtime-v14.mjs` | Codex PTC 的阶段/证据控制器、收益路由、连续任务能力保持和任务级工具面裁剪 |
| `presets/codex-harness-mode/agent.cordis.yml` | Codex 工具契约到 DSH provider、Shell、文件、压缩和 Skills 的组合边界 |

目录名就是预设 id。DSH 启动时扫描 `$DSH_HOME/.agent-presets/`（默认 `~/.dsh/.agent-presets/`），发现的预设会出现在会话的模式选择器里。

组合只使用 DSH 的公开插件行和公开事件钩子。Codex 与 Codex PTC 的本地控制器仅依赖 Node 内置模块；只有可选的 Codex Harness 模式需要固定版本的 DSH 兼容插件。仓库不含任何密钥或个人配置。

## 安装

### macOS / Linux：安装三个模式

```bash
git clone https://github.com/xiaosu19/dsh-codex-mode.git
cd dsh-codex-mode
./install.sh
./install.sh --preset codex-ptc-mode
./install.sh --preset codex-harness-mode
```

### Windows (PowerShell)：安装三个模式

```powershell
git clone https://github.com/xiaosu19/dsh-codex-mode.git
cd dsh-codex-mode
powershell -ExecutionPolicy Bypass -File .\install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Preset codex-ptc-mode
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Preset codex-harness-mode
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

它会安装到 `$DSH_HOME/.agent-presets/codex-ptc-mode/`（默认 `~/.dsh/.agent-presets/codex-ptc-mode/`），显示为「Codex PTC 模式」。该模式保留 Codex 模式的授权、最小相关面、最小修改、验证闭环、软步骤预算、证据账本、非阻断检查点和提前压缩。运行时会在每个用户回合开始前选择紧凑工具面：少量读取只暴露 `read`；小型仓库检索暴露 `glob` / `grep` / `read`；带引用的联网调研使用直接 Web 工具。修改、命令/测试链、大范围聚合，以及 AWS/API/远程环境等需要终端的实际操作会使用 `run_code`，SDK 限制到任务所需能力；连续实施中的简短跟进不会卸载该能力。它不使用固定 `both`，因此不会让每一步同时承担原生工具 schema 和 SDK 的双份上下文。首版不加入 goal、subagent、workflow 或 Ralph。覆盖更新使用 `--force` / `-Force`，安装器会先保留时间戳备份。

工具编排规则也按当前工具面动态注入：原生回合只携带简短的有界直接调用契约；Code Mode 回合携带 SDK、失败恢复和验证规则，但 SDK 本身仍按任务裁剪。多个调用或调用之间存在依赖，并不会单独触发 PTC；选择器寻找的是确定性修改/验证流水线，或中间结果相对最终答案明显更大的过滤与聚合工作。

### 只安装 Codex Harness 模式

Harness 模式需要把 DSH 适配层安装到 Web profile。选择该 preset 时，安装器会先检查并在 `dsh` 命令可用时自动安装固定版本：

```bash
dsh plugin --profile web add @shuind/dsh-codex-harness@0.1.13
./install.sh --preset codex-harness-mode
```

这只安装 DSH 插件和 preset，不安装或登录 Codex CLI。兼容插件是首次加入 Web profile 时需要重启一次 DSH Web；以后只覆盖 preset 不需要重启。

### 手动安装

把 preset 目录分别复制到预设根目录；复制 Harness 模式前仍需执行上面的 `dsh plugin` 命令：

```bash
mkdir -p ~/.dsh/.agent-presets
cp -R presets/codex-mode ~/.dsh/.agent-presets/
cp -R presets/codex-ptc-mode ~/.dsh/.agent-presets/
cp -R presets/codex-harness-mode ~/.dsh/.agent-presets/
```

如果设了 `$DSH_HOME`，就换成 `$DSH_HOME/.agent-presets/`。

安装完在 DSH 里新建一个空白会话，模式选择器中会出现三个独立模式。正式版本会在控制器行为变化时提升 `runtime-vN.mjs` 的文件名，绕过 Node 的 ESM URL 缓存，因此从正式版本升级后通常不用重启 DSH；如果直接原地修改同一个本地控制器文件名，则需要重启 DSH 或同时提升文件名。已经打开的会话会继续使用创建时的预设代际和历史上下文，不会在中途换成新文件。

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
rm -rf ~/.dsh/.agent-presets/codex-harness-mode
```

## 这些预设装了什么

以下是 Codex 与 Codex PTC 两个 DSH 原生模式的公共组合。Codex Harness 模式使用更窄的 Codex 工具契约，详见其[单独说明](docs/codex-harness-mode.md)。

`agent.cordis.yml` 挂载的行，都是 DSH 公开的组合插件：

- **persona** — 授权判定、执行循环、步骤经济和工具纪律（这是这个预设的核心）
- **runtime controller** — 按 turn 观察真实工具与结果，维护 `orient → decide → implement/recover → verify` 阶段、证据指纹和最近目标；正常执行时保持静默，同一阶段的漂移检查点只注入一次
- **repository-instructions** — 读取仓库里的 agent 说明文件
- **无状态 Bash / PowerShell + 后台任务** — 每次调用用结构化 `workdir` 指定目录；长任务可由 `job_output` / `job_list` / `job_kill` 管理
- **文件工具** — `read` / `write` / `edit` / `read_image`
- **skill 目录 + 加载器** — 本地 skill 发现
- **plan mode** — 只读调研，通过专用工具退出
- **结构化搜索** — `glob` / `grep` 使用 DSH 随包提供的 ripgrep，不依赖宿主机 PATH
- **上下文管理** — 小窗口和未知路由默认在真实容量的 `72%` 压缩并保留最近 `18%`；已验证的百万上下文路由约在 16 万 token 提前压缩并保留最近 4 万；另带 `/compact` 命令和工具结果裁剪
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

`codex-harness-mode` 固定使用 `@shuind/dsh-codex-harness@0.1.13` 作为 DSH 适配层。它不要求 Codex 登录；真正的模型可用性只取决于当前 DSH provider。适配层的远程 GPT 搜索和远程压缩在本 preset 中关闭，因此不会绕过 DSH 模型路由。

在 `@deepseek-ai/dsh` `0.1.0-rc.6` / Node v24 上验证过。预设目录、插件行以及 `agent/pre-step`、`tools/post-execute` 都使用 DSH 的公开约定。控制器刻意不注册 `tools/pre-execute`，因为 DSH 会把 guard denial 持久化为红色工具错误。如果后续 DSH 更改了插件名或事件协议，组合阶段会失败并暴露原因，不会静默退化成只有 persona 的模式。

不需要额外安装 ripgrep。`@deepseek-ai/dsh-tool-fs-search` 自带支持 macOS、Linux 和 Windows 的 ripgrep 二进制，并通过结构化 `glob` / `grep` 工具调用它；即使终端里的 `rg` 不在 PATH，代码检索也能正常工作。

DSH 会用路由返回的 `contextWindow` 计算压缩阈值。默认策略适合小窗口和未知路由：20 万上下文约在 14.4 万 token 触发并保留 3.6 万；13.1 万上下文约在 9.4 万触发并保留 2.36 万。预设为已验证的百万上下文目标提供精确策略：100 万上下文在 16 万触发，GPT 5.6 的 105 万上下文在 16.8 万触发，两者都保留最近 4 万。这样既避免小模型过早反复摘要，也能控制长 Agent 会话重复发送百万窗口历史的成本。

自定义 provider 的模型必须在 DSH `settings.yaml` 中显式声明真实容量；只写 `id` 和 `name` 会让适配器使用通用猜测值，从而令百分比计算失真。例如：

```yaml
models:
  - id: gpt-5.6-sol
    name: gpt-5.6-sol
    contextWindow: 1050000
```

`contextWindow` 应填写该具体上游路由实际允许的总上下文，而不是期望值；同名模型如果被网关裁成更小窗口，应填写裁剪后的有效容量。动态 `auto` 路由无法保证固定模型时不要硬编码容量。可以用 `/compact` 随时手动建立检查点；自动压缩会先裁剪大型旧工具结果，压力仍高时才调用当前路由生成摘要，并用摘要替换旧历史而不是再追加一份副本。

模型与推理档位仍由会话选择器控制，预设不会改写它们。普通编辑、打包和发布任务建议从 **High**（或模型的默认档）开始；只有复杂架构判断或困难调试再选 **Max**。步骤经济和工具选择不绑定 provider/model；压缩仅按已声明的容量档位区分，已列出的百万窗口目标使用同一套提前压缩策略。

## 验证

本仓库的确定性控制器测试：

```bash
npm test
```

测试覆盖任务收益路由、外部执行意图、连续任务能力保持、同 presentation 下的工具面切换、SDK allowlist、工具分类、阶段迁移、一次性检查点、根扫描建议、shell 搜索渐进纠偏、`cd`/`workdir` 分流，以及运行时不存在 `tools/pre-execute` 拒绝器。发布包还应执行 `scripts/pack.sh`，从 zip 与 tar.gz 各自解压安装，并由 DSH `agentPreset.list` 和新会话实际 mount 验证。

开发时用同一个失败测试 fixture 分别跑过 Claude、GPT 和 DeepSeek 路由：三者都完成了一行最小修改并通过 2/2 测试。真实长任务也暴露过旧硬保护的反例：“给共享记忆插件增加 GUI 面板”在 24 步内收到 7 次控制器上下文和 9 次控制器制造的工具错误，其中 decision 在第 8、12、16、20 步重复注入。v6 因此移除了 discovery lease 和所有 pre-execute denial；这个失败轨迹已固化为“一次注入、零拒绝”的运行时回归条件。

## 已有会话和迁移会话

预设升级不会重写已有消息、工具调用或压缩摘要。迁移自 Codex 的旧会话如果已经包含大量 `cd /路径 && ...` 工具轨迹，模型可能继续模仿这些历史示例，即使新 persona 已经加载。日志测试中，同一模型在旧迁移会话里仍反复使用 Bash，而在全新会话里能在 3–4 步内只用 `glob` / `grep` / `read` 完成相同只读任务。

因此验证新版时应新建空白会话，不要只在旧会话里续跑；分支会话会继承历史，也不适合作为干净基线。需要延续旧任务时，把仍有效的目标、已改文件和待验证事项简要带入新会话即可。

## 改成你自己的

复制 `presets/codex-mode/` 到一个新目录名（这就是新的预设 id），改 `preset.yml` 里的 `name`/`description`/`order`，再按需调 `agent.cordis.yml` 里的 persona 文字和插件行。`order` 决定它在选择器里的位置。

---

**English:** Three DSH agent presets: provider-neutral Codex, adaptive Codex PTC, and Codex Harness Mode. The first two use DSH-native tools and advisory controllers. Harness Mode maps the Codex-compatible `exec_command`, `write_stdin`, `apply_patch`, and `update_plan` contract onto DSH while leaving model access, reasoning effort, context capacity, plugins, filesystem, sandbox, and sessions under DSH ownership. It does not start Codex CLI/app-server or require a Codex login. Hosted Responses search and remote compaction are disabled so requests never bypass the selected DSH provider.

## License

MIT
