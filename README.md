# mym-player

Tauri 2 + React + TypeScript 本地音乐播放器（方案 A：桌面本地缓存播放）。

- **优先目标平台：** Windows（先打安装包）
- **UI：** 按跨端编写，后续可扩展 macOS / Linux
- **包管理：** **pnpm**（见 `packageManager` 字段）

> 私用 / 非商用：本客户端仅供个人本地缓存与播放；请遵守上游曲库与 API 服务条款，勿大规模分发或商用转售缓存内容。

## 已实现

- 搜索：`GET /api/v1/search`（平台可选，默认 `tencent`）
- 点播：`POST /api/v1/playbacks`（省略 `streaming_mode`）→ 轮询 `status_url` 至 `completed` / `failed`
- 下载：按 `audio_url`（保留 `rev`）写入 `{appData}/cache/audio/`，本地路径播放（标准音频，非 WASM ALAC）
- UI：结果可点播、任务状态展示、失败停轮询并显示 error
- 可配置 API Base URL（默认 `https://music.op.wiki`）
- Rust 命令：`get_app_data_dir`、`ensure_cache_dirs`、`open_cache_dir`、`download_audio`

## API 流程

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

## 本地运行 / 怎么测

```bash
pnpm install
pnpm tauri dev
```

1. 确认 API Base URL（默认 `https://music.op.wiki`）
2. 选择平台（默认 QQ 音乐 / tencent），搜索关键词
3. 点击结果：观察状态从 creating/polling → downloading → 播放条出声
4. 再次点同一曲应命中本地缓存；失败任务会停止轮询并显示 error

仅跑前端（下载落盘需 Tauri；浏览器模式用内存 blob 回退）：

```bash
pnpm dev
```

## Windows 构建

```bash
pnpm install
pnpm tauri build
```

产物一般在 `src-tauri/target/release/bundle/`（如 `msi` / `nsis`）。

## 已知限制

- 无歌单 / 队列 / 本地曲库浏览；无歌词与封面展示
- 任务重启后若上游返回 404，需重新创建
- 大文件整包下载（未做边下边播）；依赖系统 WebView 对缓存格式的解码支持
- Linux/macOS 需各自安装 Tauri 系统依赖

## 项目结构

```
src/                 # React UI + API client
  api/               # types / config / client / url
  cache/             # 缓存路径与下载
  components/        # 搜索 / 结果 / 播放条 / API 配置
src-tauri/           # Tauri 2 + 缓存 / 下载命令
```

## 合规提示

- 应用层无需 API Key；不要提交 secrets
- 不要伪造 `sec-ch-ua` / `Referer` 等浏览器头
- 同曲同音质复用任务，勿用重复 POST 代替轮询
