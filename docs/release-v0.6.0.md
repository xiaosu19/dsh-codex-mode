# Codex PTC 模式 v0.6.0

这是仓库首次正式发布自适应 **Codex PTC 模式**，同时带上更新后的 Codex 模式控制器。

## 背景

内置 PTC 会让模型通过 TypeScript `run_code` 组合工具。它对搜索、批量读取、过滤、修改与验证链很有价值，但简单的 1–2 文件只读任务也被强制生成程序时，会增加输出 token 和等待时间。Codex PTC v12 改为按任务形态选择：有明确文件边界的少量只读任务直接使用原生 `read`；其余工程任务继续使用 Code Mode SDK。

这个选择器没有测试题路径、字段名或预期答案特判。它只判断任务是否包含搜索、通配符、目录扇出、命令、修改或其他需要程序编排的结构。

## 实测摘要

在 5 个模型、4 种模式、统一 Max 的单次受控只读基准中：

- Codex PTC 输入 token 合计比 Codex 少 **34.2%**、比 Standard 少 **43.0%**、比 PTC 少 **51.9%**；
- Codex PTC 中位耗时 **13.45 秒**，Codex 为 **13.54 秒**；
- Flash 与 Sol 上，Codex PTC 同时取得最低耗时和最低输入 token；
- 严格输出成功率：Standard 5/5、Codex 5/5、PTC 4/5、Codex PTC 4/5；
- 本轮开启 VPN，Sonnet 5 两条路径出现 `TRANSPORT` 重试，因此耗时是保守网络实测值，token 数据更稳定。

完整逐模型表、失败原因、code-only 前后对比、方法和限制见 [benchmark 报告](https://github.com/xiaosu19/dsh-codex-mode/blob/main/docs/benchmark-max-2026-08-21.md)。

## 主要变化

- 新增独立 preset `codex-ptc-mode`，不会覆盖或伪装成 `codex-mode`；
- v12 运行时按每个 agent 独立选择原生只读快路径或 Code Mode，修复跨会话 presentation 泄漏；
- 原生路径不生成 TypeScript，只暴露一个 `read` schema；
- Code 路径保留完整 DSH SDK、结构化搜索、Shell、修改、验证和发布规则；
- Codex 与 Codex PTC 控制器均保持 advisory，不注册会制造红色工具错误的拒绝 guard；
- macOS/Linux 与 Windows 安装器都支持显式选择 preset，并在覆盖前保留时间戳备份；
- 新增 21 项确定性测试和双格式发布包验证。

## 安装

macOS / Linux：

```bash
curl -fsSL -o dsh-codex-mode.tar.gz https://github.com/xiaosu19/dsh-codex-mode/releases/download/v0.6.0/dsh-codex-mode.tar.gz
tar -xzf dsh-codex-mode.tar.gz
./dsh-codex-mode/install.sh --preset codex-ptc-mode --force
```

Windows：下载并解压 `dsh-codex-mode.zip`，然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\dsh-codex-mode\install.ps1 -Preset codex-ptc-mode -Force
```

安装完成后请新建空白会话，选择「Codex PTC 模式」。旧会话会继续使用创建时的 preset 和历史上下文。

## SHA-256

```text
f01e783ed305161ab3dc1e72c1a83cb4d61b1ec002212de7b50b5fba249b3112  dsh-codex-mode.zip
df5d172fc3bd110f8ab71a01e97cb62948cdbdac28aa2994e18bdf89eb271f19  dsh-codex-mode.tar.gz
```
