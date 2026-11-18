# mym-player

Tauri 2 + React + TypeScript 本地音乐播放器（方案 A：桌面本地缓存播放）。

- **优先目标平台：** Windows（先打安装包）
- **UI：** 按跨端编写，后续可扩展 macOS / Linux
- **包管理：** **pnpm**（见 `packageManager` 字段）

> 私用 / 非商用：本客户端仅供个人本地缓存与播放；请遵守上游曲库与 API 服务条款，勿大规模分发或商用转售缓存内容。

## 已实现

- 搜索：`GET /api/v1/search`（平台可选，默认 `tencent`）
- 音质：`standard` / `high` / `lossless` / `hires`；切换会重建任务，缓存键按 `playback id`（含 quality）隔离
- 点播：`POST /api/v1/playbacks`（省略 `streaming_mode`）→ `streaming`/`completed` 即可用 `audio_url` 开播
- 边听边缓存：先在线 Range 播放，`completed` 后后台落盘；已缓存则直接本地播
- UI：结果可点播、任务状态、失败停轮询并显示 error
- 可配置 API Base URL（默认 `https://music.op.wiki`）
- Rust 命令：`get_app_data_dir`、`ensure_cache_dirs`、`open_cache_dir`、`lookup_cached_audio`、`download_audio`

## API 流程

匿名、无 API Key。勿伪造浏览器头，勿转发 Cookie。

1. `GET /api/v1/search`
2. `POST /api/v1/playbacks`（带 `quality`，**省略** `streaming_mode`）
3. 轮询 `status_url`：`streaming`/`completed` 可播；`failed` 停止；稳定落盘仍等 `completed`
4. `GET audio_url`（保留 `rev`，支持 Range）后台写入 cache（completed 媒体可能在 `music.zr.wiki`）

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

1. 确认 API Base URL（默认 `https://music.op.wiki`）与音质
2. 选择平台（默认 QQ 音乐 / tencent），搜索关键词
3. 点击结果：`streaming`/`completed` 后应较快开播，再后台写缓存
4. 切换音质会重建任务并使用不同缓存文件；同曲同音质再点应命中缓存
5. 失败任务会停止轮询并显示 error

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
- 开播走在线 `audio_url`；离线完整文件仍等 `completed` 后后台落盘
- 部分音质/平台可能不可用或回退；依赖 WebView 解码能力
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
