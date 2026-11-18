# mym-player

Tauri 2 + React + TypeScript 本地音乐播放器骨架（方案 A：桌面本地缓存播放）。

- **优先目标平台：** Windows（先打安装包）
- **UI：** 按跨端编写，后续可扩展 macOS / Linux
- **包管理：** **pnpm**（见 `packageManager` 字段）

> 私用 / 非商用：本客户端仅供个人本地缓存与播放；请遵守上游曲库与 API 服务条款，勿大规模分发或商用转售缓存内容。

## 功能范围（本骨架）

已有：

- 搜索输入框、结果列表占位、播放条占位
- 可配置 API Base URL（默认 `https://music.op.wiki`）
- API client 类型与 TODO 占位（搜索 / 建任务 / 轮询 / 下载）
- 本地缓存目录约定：`{appData}/cache/{audio,covers,lyrics}`
- Rust 命令：`get_app_data_dir`、`ensure_cache_dirs`、`open_cache_dir`

未实现（后续）：完整搜索、POST `/api/v1/playbacks`、状态轮询、音频落盘与解码播放。

## 标准 API 流程（待实现）

匿名、无 API Key。勿伪造浏览器头，勿转发 Cookie。

1. `GET /api/v1/search`
2. `POST /api/v1/playbacks`（**省略** `streaming_mode`）
3. 轮询 `status_url` 至 `completed`（失败则停止；勿把 `streaming` 当完成）
4. `GET audio_url` 落盘（completed 媒体可能在 `music.zr.wiki`）

## 环境要求（Windows 开发）

1. [Node.js](https://nodejs.org/) LTS + **pnpm**（`npm i -g pnpm`）
2. [Rust](https://rustup.rs/) stable（MSVC toolchain）
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)：Workload「使用 C++ 的桌面开发」
4. WebView2 Runtime（Win10/11 通常已预装）

官方前置说明：https://tauri.app/start/prerequisites/

## 本地运行

```bash
pnpm install
pnpm tauri dev
```

仅跑前端（无 Rust 命令 / 无原生壳）：

```bash
pnpm dev
```

## Windows 构建

```bash
pnpm install
pnpm tauri build
```

产物一般在 `src-tauri/target/release/bundle/`（如 `msi` / `nsis`）。

## 项目结构

```
src/                 # React UI + API client 占位
  api/               # types / config / client（TODO）
  cache/             # 缓存路径约定
  components/        # 搜索 / 结果 / 播放条 / API 配置
src-tauri/           # Tauri 2 + 最小 Rust 命令
```

## 合规提示

- 应用层无需 API Key；不要提交 secrets
- 不要伪造 `sec-ch-ua` / `Referer` 等浏览器头
- 同曲同音质复用任务，勿用重复 POST 代替轮询
