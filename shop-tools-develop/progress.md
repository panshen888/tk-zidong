# TikTok AI Flow 进展日志

## 2026-06-03

### 已完成：规划文件优化

- 读取 `初步任务规划.md`。
- 生成新版规划文件 `优化后任务规划文件.md`。
- 源文件未修改。

### 已完成：阶段 1 应用骨架

- 创建 `package.json`、`tsconfig.json`、`vite.config.ts`、`eslint.config.js`。
- 创建 Electron 主进程、preload、renderer 入口。
- 实现三页面：
  - 首页
  - 任务列表页
  - 全局配置页
- 实现基础 UI 设计和全局样式。
- 完成校验：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`

### 已完成：阶段 2 任务与配置雏形

- 使用 `electron-store` 保存配置、任务列表和日志。
- 实现 IPC：
  - 获取/保存配置
  - 创建任务
  - 获取任务列表
  - 获取任务日志
  - 选择 Excel 文件
  - 选择目录
  - 打开路径
- 创建任务时会生成任务目录结构并复制输入 Excel。

### 已完成：阶段 3 Excel 读取与图片缓存

- 安装 `exceljs`。
- 新增 `src/main/services/excelService.ts`：
  - 读取 Sheet `选品表`
  - 校验字段
  - 提取内嵌图片
  - 支持 `原商品主图URL`
  - 支持 `data:` URL 图片缓存
  - 追加输出字段
  - 生成 `1688候选供应商` Sheet 雏形
- 新增 `src/main/services/taskRunner.ts`：
  - 开始任务
  - 调用 Excel 管线
  - 更新任务状态、统计数与日志
- 新增 mock 与验证脚本：
  - `scripts/create-mock-excel.cjs`
  - `scripts/verify-excel-pipeline.mjs`
- 已运行：
  - `npm run mock:excel`
  - `npm run verify:excel`
- 最终校验过程中发现 `scripts` 文件缺少 Node 全局声明，已更新 ESLint 配置。
- 当前验证产物：
  - `mock-data/mock-selection.xlsx`
  - `mock-data/task-assets/images/2-MOCK-URL-001.jpg`
  - `mock-data/task-assets/images/3-MOCK-EMBED-002.png`
  - `mock-data/task-assets/output/result.xlsx`
- 最终校验已通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
  - `npm run verify:excel`

### 下一步

### 进行中：阶段 4 搜图适配器

- 新增 `src/main/services/searchAdapter.ts`。
- 新增 `SupplierCandidate` 类型。
- 新增 `ImageSearchAdapter` 接口。
- 新增 mock 搜图适配器 `createMockImageSearchAdapter()`。
- `taskRunner` 已接入 mock 搜图适配器。
- `excelService` 已支持将候选数据回填到：
  - `选品表`
  - `1688候选供应商`
- 新增输出检查脚本：
  - `scripts/inspect-output-excel.cjs`
- 已运行并通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `npm run inspect:excel` 输出确认：
  - row2Status: `成功`
  - row2CandidateCount: `3`
  - row3Status: `成功`
  - row3CandidateCount: `3`
  - row4Status: `缺少主图`
  - candidateRows: `6`

### 已完成：真实 1688 适配器骨架

- 安装 `playwright-core`。
- 新增配置项：
  - `searchAdapterMode`
  - `chromeCdpUrl`
- 首页展示当前搜图适配器模式。
- 全局配置页可切换 mock / real1688。
- `taskRunner` 会根据任务配置选择：
  - mock 搜图适配器
  - 真实 Chrome/1688 搜图适配器
- `searchAdapter.ts` 已实现真实适配器骨架：
  - 连接已有 Chrome CDP
  - 启动指定 Chrome
  - 打开 1688 搜图入口
  - 上传本地图片
  - 等待结果
  - 解析 offer 链接与基础字段
- 新增真实探测脚本：
  - `scripts/probe-1688-adapter.mjs`
  - `npm run probe:1688 -- <imagePath> [imageSearchUrl]`
- 已再次运行并通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- 未运行真实 1688 探测，原因：需要已开启远程调试端口的登录 Chrome，以及可能需要用户确认真实 DOM 结构。

### 下一步

### 已更新：真实采购业务规则

- 用户确认：列表页不能直接拿价格、克重作为采购数据。
- 前 N 个候选列表页商品只用于封面相似度初筛。
- 通过初筛后必须进入商品详情页。
- 在详情页需要逐个切换 SKU，并用 SKU 图片与 Excel 原图相似度确认同款。
- 确认同款 SKU 后，选中该 SKU，数量设置为 1，通过加购/运费计算获取商品价 + 运费。
- 商品价 + 运费才是单件采购成本价。
- 尺寸与克重也必须从详情页/SKU/规格/物流相关区域采集。
- 当前 mock 价格、MOQ、克重仅为占位数据，不能作为真实采购逻辑。

### 下一步

- 调整数据模型：区分列表候选、SKU 匹配结果、采购成本、运费、尺寸、克重。
- 设计 `DetailPageAdapter` 或扩展 `ImageSearchAdapter`：负责详情页 SKU 枚举、SKU 图片匹配、加购成本采集。
- 调研 1688 详情页 DOM：SKU 控件、SKU 图片、数量输入、加购按钮、运费/合计价格、规格参数、克重字段。

### 已完成：候选与 SKU 结果模型拆分

- `SupplierCandidate` 改为列表候选模型，不再承载真实采购价格/克重。
- 新增 `SkuMatchResult`，用于记录详情页 SKU 匹配与采购成本。
- 新增 `src/main/services/detailAdapter.ts`。
- 新增 `DetailPageAdapter` 接口。
- 新增 `createMockDetailPageAdapter()`。
- `excelService` 已接入详情页适配器：
  - 搜图后进入每个候选的详情页验证步骤。
  - 记录 SKU 图片相似度。
  - 选取同款 SKU 的采购成本、商品价、运费、尺寸、克重回填 `选品表`。
  - 新增 `SKU匹配结果` Sheet。
- `1688候选供应商` Sheet 已改为只保存列表候选信息。
- `scripts/inspect-output-excel.cjs` 已更新为检查 SKU 匹配与采购成本。
- 已运行并通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `npm run inspect:excel` 输出确认：
  - row2MatchedSku 已回填。
  - row2PurchaseCost: `29.27`
  - row2ShippingFee: `6.34`
  - candidateRows: `6`
  - skuMatchRows: `6`

### 下一步

- 实现真实 `DetailPageAdapter` 骨架。
- 需要调研/确认 1688 详情页 DOM：
  - SKU 列表控件
  - SKU 图片区域
  - 数量输入
  - 加购按钮
  - 运费/合计价格区域
  - 规格参数/尺寸/克重区域

### 已完成：AI 中转站配置与相似度服务骨架

- 新增全局配置项：
  - `aiBaseUrl`
  - `aiApiKey`
  - `aiModel`
  - `aiSimilarityThreshold`
- 全局配置页新增 “AI 相似度识别” 表单。
- `ipc` 保存配置时会归一化 AI 配置。
- 新增 `src/main/services/imageSimilarityService.ts`。
- `ImageSimilarityService` 支持：
  - OpenAI 兼容中转站 `/chat/completions`
  - 两张图片输入
  - JSON 输出解析
  - 未配置密钥时 mock fallback
- `DetailPageAdapter` 已接入相似度服务。
- `taskRunner` 已根据全局配置创建相似度服务并传入 Excel 管线。
- 已运行并通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`

### 下一步

- 等用户提供中转站 URL、Key、模型名后，增加真实相似度调用验证脚本。
- 等用户提供 1688 DOM 后，把真实 SKU 图提取接入 `ImageSimilarityService`。

### 进行中：任务页后台化简化

- 用户反馈当前任务页 UI 太乱，要求改成普通管理后台列表。
- `src/renderer/pages/TasksPage.tsx` 已重构：
  - 顶部保留“新建任务 / 刷新 / 清除日志”操作。
  - 原左侧创建卡片已移除。
  - 新建任务改为弹窗录入 Excel 文件、候选链接数、详情页解析开关。
  - 任务主体改为表格，列包含任务名称、状态、输入文件、候选数、成功/失败/总数、创建时间、操作。
  - 每行支持开始、查看日志、打开资产目录、打开输出 Excel、删除任务。
- `src/renderer/styles/global.css` 已新增后台表格、状态标签、空状态、弹窗样式。
- 删除单条任务与清除全部任务仍沿用现有后端 API，保持删除输入、输出、日志、资产目录的语义。

### 下一步

- 运行 `npm run lint`、`npm run typecheck`、`npm run build:app` 验证本轮 UI 修改。

### 已完成：任务页后台化简化验证

- 已运行并通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
- `task_plan.md` 已将“阶段 8：任务页后台化简化”标记为 complete。

### 进行中：日志列表与 Excel 读取规则修正

- 用户确认：界面不做“任务列表”，而是做“日志列表”。
- 已调整 `src/renderer/pages/TasksPage.tsx`：
  - 页面标题改为“执行日志”。
  - 表格改为“日志列表 / 日志名称 / 日志详情”。
  - 新建后生成一条待执行日志。
  - 点击“执行”才开始后台采集。
  - 执行中会轮询刷新日志状态和日志详情。
- 已调整 `src/main/services/ipc.ts`：
  - `tasks:start` 改为触发后台执行，不再阻塞 UI 等完整采集结束。
  - 新建日志提示改为“执行日志已创建，等待点击执行。”
- 已修复 `src/main/services/excelService.ts`：
  - `原商品主图URL` 列支持 URL 字符串、超链接对象、富文本对象、公式结果。
  - `原商品主图URL` 列也支持内嵌图片；会优先找这一列所在行的图片。
  - 不再把对象单元格转成 `[object Object]`。
  - 从第 2 行开始读取，遇到首个完全空行即停止后续读取。
  - 有内容但缺少 `原商品ID` 的行会记录为失败，而不是静默跳过。
- 已扩展 `scripts/create-mock-excel.cjs`：
  - URL 主图
  - 内嵌图片
  - 缺少主图
  - 超链接对象主图
  - 主图列图片
  - 空行后脏数据不应读取
- 初步验证已通过：
  - `npm run typecheck`
  - `npm run mock:excel`
  - `npm run verify:excel`

### 下一步

- 跑完整 `lint / typecheck / build:app / verify:excel / inspect:excel` 收口。

### 已完成：日志列表与 Excel 读取规则验证

- 已运行并通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `npm run verify:excel` 结果确认：
  - 连续读取 5 行有效/有内容数据。
  - 4 行图片缓存成功。
  - 1 行缺少主图失败。
  - 第 7 行为空后停止读取。
  - 空行后的第 8 行未被处理。
- `npm run inspect:excel` 结果确认：
  - 第 5 行超链接对象主图处理成功。
  - 第 6 行主图列图片处理成功。
  - 候选 Sheet 行数为 12。
  - SKU 匹配 Sheet 行数为 12。
- 首次 `inspect:excel` 断言把空白单元格限定为 `undefined` 导致失败；ExcelJS 实际返回 `null`，已改为接受空值。
- `task_plan.md` 已将“阶段 9：日志列表与 Excel 读取规则修正”标记为 complete。

### 已完成：50 候选相似度筛选与结果 Sheet 排序

- 用户确认：
  - 默认候选数改成 50。
  - 每条 Excel 数据都要对列表页候选做相似度筛选。
  - 相似度达标的候选都要下钻详情页拿价格。
  - 不新增更多 Sheet，只复用原有两个结果 Sheet。
- 已调整默认配置：
  - `src/shared/defaults.ts` 默认 `candidateLimit = 50`。
  - `src/renderer/pages/TasksPage.tsx` 新建弹窗默认候选数改为 50。
  - `src/renderer/pages/SettingsPage.tsx` 候选数上限放宽到 200。
  - `scripts/probe-1688-adapter.mjs` 探测默认候选数改为 50。
- 已调整 `src/main/services/excelService.ts`：
  - 搜图后先对候选列表逐条做相似度判断。
  - 只有相似度达标候选进入详情页。
  - 详情页返回采购成本后，按采购成本价升序排序。
  - `1688候选供应商` Sheet 复用为每个原商品价格最低 Top3。
  - `SKU匹配结果` Sheet 复用为每个原商品最优 1 条。
  - 原选品表推荐链接 1/2/3 也改为 Top3 低价结果。
- 已调整 mock：
  - mock 搜图默认生成 50 个候选。
  - mock 前 3 个候选列表相似度达标，用于覆盖 Top3 输出逻辑。
- 已调整验证脚本：
  - `scripts/verify-excel-pipeline.mjs` 使用 `candidateLimit = 50`。
  - `scripts/inspect-output-excel.cjs` 校验 50 候选、Top3 Sheet 行数与最优 Sheet 行数。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run verify:excel`

### 2026-06-08：补充 `11` 起批歧义处理策略

- 用户指出扁平文本里可能出现 `11套起批` 这类歧义：第一个 `1` 可能来自价格，第二个 `1` 才是起批数量，也可能确实是 `11` 起批。
- 当前处理策略以 DOM 边界为准：
  - 优先读取 `#mainPrice/.od-price-container` 中最小的、包含 `起批` 的 DOM 文本节点，例如 `<p>1个起批</p>`，直接判断为 1 起批。
  - 如果只有 `11套起批` 这类无价格符号、无 DOM 分隔的纯文本，不盲猜为 1 起批，会按 11 起批处理并拒绝。
  - 如果是价格和起批拼接且带 `¥/￥`，例如 `¥11套起批`、`¥12.611套起批`，会先剥离价格片段，再判断后面的 `1套起批`。
- 这样既兼容 1688 `textContent` 把价格与起批拼在一起的情况，也避免把真正的 `11件起批` 误判成可采购 1 件。
  - `npm run inspect:excel`

### 下一步

- 运行 `npm run lint` 与 `npm run build:app` 完成本轮收口。

### 已完成：50 候选筛选输出收口验证

- 已补充运行并通过：
  - `npm run lint`
  - `npm run build:app`
- 本轮最终已通过：
  - `npm run typecheck`
  - `npm run verify:excel`
  - `npm run inspect:excel`
  - `npm run lint`
  - `npm run build:app`

### 已完成：Chrome 接管方式纠偏

- 用户希望直接使用当前正在打开的 Chrome，不希望关闭 Chrome，也不希望用用户目录再启动一个 Chrome。
- 已确认并记录限制：
  - Playwright 不能直接接管普通启动的 Chrome。
  - 要在当前 Chrome 中新开页签执行，当前 Chrome 必须以远程调试端口启动。
  - 启动/复用同一个 Chrome 用户数据目录会遇到 profile 锁，不适合用户当前诉求。
- 已撤回上一轮“默认复用 Chrome 用户数据目录启动”的改动：
  - 默认 `chromeMode` 恢复为 `connect`。
  - 不再默认填充用户 Chrome 数据目录。
  - `launch` 模式保留为高级独立 Chrome 模式。
- 已优化错误提示：
  - `connectOverCDP` 失败时会说明普通 Chrome 不能直接接管，并给出 macOS 调试端口启动示例。
- 已更新设置页说明：
  - 主推“连接已有 Chrome 调试端口”。
  - 明确普通已打开 Chrome 不能直接被 Playwright 接管。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`

### 已完成：独立 Chrome 登录态复用

- 用户最终确认：不再恢复“配置调试链接/CDP”的方式，宁愿在应用独立 Chrome 中重新登录。
- 已新增主进程单例会话 `src/main/services/chromeSession.ts`：
  - 使用应用内部 `chrome-profile` 作为持久 profile。
  - `openLoginBrowser` 打开 1688 搜图入口，供用户手动登录。
  - 真实任务执行时复用同一个 `BrowserContext`，不再每个商品关闭浏览器上下文。
- 已补齐 IPC / preload / mock API：
  - `selectChromeExecutable`
  - `openLoginBrowser`
- 已调整配置归一化：
  - 固定 `chromeMode = launch`。
  - 隐藏 CDP URL / 用户数据目录 / Chrome 调用方式配置。
  - 如果已保存 `chromeExecutablePath`，不再重新自动查找覆盖。
  - 若未保存，则启动时按 macOS / Windows / Linux 常见路径自动查找 Chrome。
- 已调整 UI：
  - 设置页 “Chrome 与 1688” 增加“打开登录浏览器”按钮。
  - 执行日志页顶部也增加“打开登录浏览器”按钮，便于开始任务前登录。
  - 首页只展示“应用独立 Chrome”，不再展示连接已有/调试端口语义。
- 已运行并通过：
  - `npm run typecheck`
- 已补充保护：如果独立 Chrome 首次启动失败，会清理单例 Promise，用户修正 Chrome 路径后可再次点击打开。
- 最终已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`

### 下一步

- 等用户提供列表页与详情页 DOM 后，替换真实 1688 搜图和详情页 SKU/价格/运费/克重采集选择器。

## 2026-06-04

### 已完成：真实上传与搜索触发

- 用户提供 `dom/1.md`，包含：
  - 触发文件上传的 input：`input.image-file-reader-wrapper[type="file"]`
  - 上传后预览弹窗：`.copy-image-container`
  - 弹窗内触发搜索按钮：`.copy-image-container .search-btn`，文本为“搜索图片”
- 已调整 `src/main/services/searchAdapter.ts`：
  - 上传选择器优先使用 `input.image-file-reader-wrapper[type="file"][accept*=".jpg"]`。
  - `setInputFiles()` 后等待上传预览弹窗出现。
  - 找到并点击“搜索图片”按钮。
  - 同时监听 `popup`、新 `page`、当前页 URL 跳转三种结果页打开方式。
  - 搜索后用结果页对象执行后续候选卡片等待与解析。
  - 只关闭本次创建的入口页/结果页，不关闭独立 Chrome 里的其他登录页。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`

### 下一步

- 等用户提供结果页 DOM 后，完善真实候选卡片解析：候选项容器、详情链接、封面图、标题、供应商字段。

### 已完成：上传后搜索按钮触发提速

- 用户反馈：图片已经正常上传并显示预览弹窗，但过了很久才触发“搜索图片”。
- 已定位原因：
  - 上传后先做了最多 5 秒的预览探测，可能导致已出现弹窗后仍等待。
  - `waitForAnySelector()` 原本按选择器顺序串行等待，前面的候选不命中时会拖慢后续真实按钮命中。
- 已调整 `src/main/services/searchAdapter.ts`：
  - 上传后直接等待预览弹窗，预览出现即进入搜索按钮触发流程。
  - “搜索图片”按钮选择器把 `.copy-image-container div.search-btn` 和 `.copy-image-container .search-btn` 提前。
  - 选择器等待改为并发竞速，谁先可见就立即使用，不再串行消耗超时时间。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`

### 已完成：结果页候选解析与批量 AI 初筛

- 用户提供 `dom/2.md`，包含搜索结果页商品列表 DOM。
- 已确认方案：
  - 原商品图使用本地文件转 Base64 data URL。
  - 前 50 个结果候选封面优先使用页面上的图片 URL。
  - 一次调用 OpenAI 兼容视觉模型，要求按传入顺序返回等长数组。
  - 用户明确要求只做 50 张一起，不做逐张/分批降级；如果批量调用失败，就记录错误并让该行失败。
- 已调整 `src/main/services/searchAdapter.ts`：
  - 结果卡片优先匹配 `#offer-list-content [data-tracker="offer"][data-index]`。
  - 从卡片中解析 `offerId`、详情链接、主图 URL、标题、供应商。
  - 主图优先取 `img[class*="mainImg"]` / `.offerImgWrapper img` / `alicdn.com/img/ibank` 图片。
  - 兼容从 `data-aplus-report` / `data-splus-exp-url` / 旺旺链接中提取 `offerId`。
- 已调整 `src/main/services/imageSimilarityService.ts`：
  - 新增 `compareBatch`。
  - 真实 AI 请求提示词约束输出：`{"scores":[{"index":1,"score":0到1数字,"isSameProduct":布尔值,"reason":"不超过20字中文原因"}]}`。
  - 要求 `scores` 长度等于候选图数量，`index` 从 1 到 N 且顺序一致。
  - 批量失败时不自动逐张降级，直接抛出明确错误。
- 已调整 `src/main/services/excelService.ts`：
  - 列表页 50 个候选封面相似度初筛优先走 `compareBatch`。
  - 批量返回的分数按候选顺序写回 `candidate.listImageSimilarity`。
  - 相似度达标候选继续下钻详情页。
- 用户反馈“到第 2 行搜图完成：50 个候选后停住”，已判断是批量 AI 相似度阶段缺少进度日志。
- 已新增日志：
  - `开始批量 AI 列表相似度识别：N 张候选封面`
  - `批量 AI 列表相似度识别完成：N/N`
- 已给 AI 请求增加超时保护：
  - 单图请求 25 秒。
  - 批量请求 60 秒。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- 用户随后强调“不要改，我们就 50 张一起”，已撤销任何逐张/分批降级思路；当前已通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`

### 下一步

- 等用户提供详情页 DOM 后，接入真实 SKU 枚举、SKU 图片切换、加购计价、尺寸和克重读取。

### 已确认：克重与尺寸提取策略

- 用户询问仅靠程序能否稳定拿到商品克重和尺寸。
- 结论：
  - 如果详情页有结构化属性/物流字段，程序可以直接提取。
  - 如果信息混在自然语言、规格说明、详情描述或多个 SKU 差异里，仅靠选择器不稳定。
- 后续实现采用混合方案：
  - 程序优先提取结构化字段。
  - 对无法确定或低置信度的信息，整理当前选中 SKU、标题、SKU 属性、规格参数、物流/运费文本给 AI。
  - AI 只做页面文本抽取与结构化，不允许凭空猜测。

### 进行中：真实详情页 SKU 验证与属性采集增强

- 已继续完善 `src/main/services/detailAdapter.ts`：
  - 真实详情页适配器会打开候选详情页。
  - 通用枚举 SKU 选项并逐个点击，采集点击后的当前主图。
  - SKU 图相似度使用一次批量 AI 调用，不做逐张降级。
  - 选中最高相似度 SKU 后设置数量为 1。
  - 采购成本继续按商品价 + 运费计算，不扣减首单优惠；首单优惠只写入风险备注。
  - 尺寸/克重先从页面文本正则抽取，识别“包装尺寸/产品尺寸/长宽高/重量/毛重/净重/克重/物流重量”等字段。
  - 程序无法确定时，把当前 SKU、标题、规格/属性/详情文本、物流/运费文本发送给 AI 做结构化抽取；AI 提示词明确不允许猜测。
  - 属性 AI 抽取增加 30 秒超时，避免任务长时间无声卡住。
- 已给详情页阶段补充日志：
  - SKU 枚举完成数量。
  - 开始/完成批量 SKU 图片 AI 相似度。
  - 选中的最高相似 SKU。
  - 商品价与运费提取结果。
  - 尺寸/克重提取结果与来源。
- 已调整 `src/main/services/excelService.ts`：
  - 调用详情页适配器时传入 `appendLog`，让真实采集过程可在执行日志里观察。
- 已运行并通过：
  - `npm run typecheck`

### 下一步

- 运行完整 `lint / build:app / verify:excel / inspect:excel` 收口。
- 等用户提供详情页 DOM 后，替换当前通用详情选择器，重点确认 SKU 选项、选中态、SKU 主图、价格、运费、属性/物流文本区域。

### 已完成：真实详情页增强验证

- 本轮验证已通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 确认：
  - 默认候选数仍为 50。
  - Top3 Sheet 行数为 15。
  - 最优 Sheet 行数为 5。
  - 输出仍复用 `1688候选供应商` 和 `SKU匹配结果` 两个结果 Sheet。
- 当前真实详情页选择器仍待用户提供 DOM 后精修；通用骨架已可暴露 SKU 枚举、SKU 批量 AI、计价、属性抽取日志。

## 2026-06-05

### 已完成：运行中任务中断操作

- 用户要求增加“中断任务”操作。
- 已新增 API：
  - `AppApi.cancelTask(taskId)`
  - preload `tasks:cancel`
  - 主进程 IPC `tasks:cancel`
- 主进程新增运行任务 `AbortController` 管理：
  - 启动任务时为当前任务创建 controller。
  - 点击中断时触发 `abort()`。
  - 任务状态立即更新为 `cancelled`，并追加“已收到中断请求”日志。
  - 后台任务在关键步骤检查 `AbortSignal` 后结束，最终保持 `cancelled`。
- 已在流程关键点加入取消检查：
  - Excel 处理主循环每行开始。
  - 搜图前后。
  - 列表页批量 AI 前后。
  - 每个详情候选前后。
  - 详情页 SKU 枚举循环。
  - 详情页 SKU 批量 AI 前后。
  - 写输出 Excel 前。
- 已调整 UI：
  - 日志列表运行中行显示“中断”按钮。
  - 日志详情运行中显示“中断”按钮。
  - dev mock 支持模拟取消。

### 已完成：Chrome 自动化降打扰

- 用户反馈自动打开浏览器/新页签会强制置顶。
- 已移除主动置顶调用：
  - 登录浏览器不再调用 `page.bringToFront()`。
  - 搜图结果页打开后不再调用 `resultPage.bringToFront()`。
- 已在应用独立 Chrome 启动参数中加入：
  - `--start-minimized`
- 注意：当前仍使用非 headless 独立 Chrome，以保留登录态和真实页面行为；不同系统/Chrome 版本仍可能在首次启动或新窗口创建时短暂抢焦点，后续如仍明显打扰，可继续尝试独立隐藏窗口/后台 worker 化方案。

### 待验证

- 运行完整 `lint / build:app / verify:excel / inspect:excel`。

### 已完成：任务中断与 Chrome 降打扰验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 继续确认：
  - 默认候选数为 50。
  - Top3 Sheet 行数为 15。
  - 最优 Sheet 行数为 5。
  - 结果 Sheet 语义未被本轮中断/Chrome 改动破坏。

### 已完成：AI 相似度本地超时调长

- 用户询问相似度查询超时来源。
- 已确认图片相似度服务里存在本地 `AbortController` 超时：
  - 批量 50 图相似度原为 60 秒。
  - 单图相似度原为 25 秒。
- 已调整：
  - 批量图片相似度超时改为 180 秒。
  - 单图图片相似度超时改为 60 秒。
  - 详情页属性 AI 文本抽取超时改为 60 秒。
- 说明：如果 AI 中转站返回 4xx/5xx 或连接错误，仍会按接口错误处理；本轮只延长我们本地等待时间。

### 已完成：详情页简化采集策略

- 用户确认先简化真实详情页逻辑：
  - 不再逐个切 SKU 看左侧轮播主图。
  - 直接读取 SKU 列表中的商品图片、SKU 名称、价格、数量输入框。
  - 如果 SKU 列表中没有商品图片，则跳过该候选并记录失败原因。
  - 原图 + SKU 列表图片一次性调用 AI，取相似度最高 SKU。
  - 选中最高相似 SKU 后，将该 SKU 数量设为 1。
  - 从 `.order-select-models` 汇总条读取商品金额和预估运费。
  - 不再加购后比价，不再考虑新客/首单优惠。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 支持 `.expand-view-item` 形式 SKU：图片 `.item-image-icon img`，名称 `.item-label`，数量输入框在当前行内。
  - 支持 `.sku-filter-button` 形式 SKU：图片 `.label-image-wrap img`，名称 `.label-name`；选中后使用下方第一个数量行设置数量。
  - 采集前会清空 SKU 数量，再只把匹配 SKU 设为 1。
  - 计价优先读取 `.order-select-models .total-price` 和 `.total-freight-fee`。
  - 从 `.offer-pack-info-list table` 解析“商品件重尺”，按 SKU 名称匹配重量与长宽高。
- 已调整 `src/main/services/excelService.ts`：
  - 单个候选详情页验证失败时不让整行立即失败，会记录到候选风险标记。
  - 如果相似度达标候选最终都没有可用 SKU/价格/运费，则该 Excel 行标记失败，并写入失败原因。
- 已运行并通过：
  - `npm run typecheck`

### 下一步

- 运行完整 `lint / build:app / verify:excel / inspect:excel`。

### 已完成：详情页 1 个起批校验

- 根据 `dom/3.md` 的价格阶梯区域补充起批校验：
  - 优先读取 `.od-price-container .price-component p`。
  - 识别 `1个起批`、`50-399个`、`≥400个` 等起批文本。
  - 如果首档不是 1 个起批，则当前详情候选直接失败，不再继续 SKU 相似度、计价和属性采集。
  - 失败原因会通过候选风险标记写入日志和输出 Excel 的风险备注。
- 已调整 `src/main/services/detailAdapter.ts`：在打开详情页后、枚举 SKU 前执行起批校验。

### 已完成：详情页简化策略验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 结果确认：
  - 每行默认候选数仍为 50。
  - `1688候选供应商` 输出 Top3，共 15 行。
  - `SKU匹配结果` 输出每个商品最优 1 条，共 5 行。
  - 输出仍复用原两个结果 Sheet，没有新增 Sheet。
- 本轮真实详情页逻辑新增了“非 1 个起批候选失败”的校验；mock 管线不触发该 DOM，但类型、构建和 Excel 输出链路均已验证通过。

### 已完成：详情页价格链路收紧

- 用户反馈价格读取逻辑需要严格按页面操作顺序执行。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 进入详情页后必须确认价格阶梯区域出现 `1个起批`，否则候选详情验证失败。
  - SKU 图片批量相似度完成后，先触发 click 选中相似度最高 SKU。
  - 对行式 SKU，会点击当前 SKU 行的图片/名称区域，再操作该行数量输入框。
  - 对按钮式 SKU，会点击 `.sku-filter-button`，再操作下方数量行。
  - 数量设置优先填入 `1`；如果输入后不是 `1`，再尝试点击数量加号。
  - 价格读取前必须等待 `.order-select-models` 显示 `已选1个`、商品金额和运费；等不到则该候选失败，避免读取旧价格。
  - 采购成本仍为商品金额 + 运费，不扣减首单/新客优惠。

### 已完成：详情页价格链路验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 确认输出结构未回归：默认 50 候选、Top3 共 15 行、最优 Sheet 共 5 行。
- 注意：mock 详情页不包含真实 `.od-price-container` / `.order-select-models` DOM，本轮真实点击与计价等待逻辑需要在真实 1688 页面上最终验证。

### 已完成：起批文案正则放宽

- 用户反馈 1688 详情页起批文案不一定是 `1个起批`，也可能是 `1件起批`。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 起批识别改为正则匹配 `数字 + 单位 + 起批`。
  - 当前兼容单位包含：个、件、只、条、套、盒、包、组、对、张、块、支、瓶、台、把、双、副、本、辆。
  - `1个起批`、`1件起批` 都视为支持单件采购。
  - `50-399件`、`≥400个` 等阶梯文本仍可识别起始数量，用于判定不是 1 起批。

### 已完成：起批正则放宽验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 确认默认 50 候选、Top3 与最优 Sheet 输出未回归。

### 已完成：起批判断改用 `#mainPrice` 整体文本

- 用户提供了更父级的价格 DOM，新增片段位于 `dom/3.md` 的“用于判断dom中有无1件起批、1个起批等关联字样”后。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 起批判断优先读取 `#mainPrice`，兜底 `.od-price-container`。
  - 不再只读取 `.price-component p` 或第一个价格组件，避免 `首件预估到手价` 这类文案干扰。
  - 在 `#mainPrice` 整体文本中匹配 `1 + 单位 + 起批` 即认为支持单件采购。
  - 没有匹配到 `1件起批` / `1个起批` 等关联字样时，候选详情验证失败并记录原因。

### 已完成：`#mainPrice` 起批判断验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 确认默认 50 候选、Top3 与最优 Sheet 输出未回归。

### 已完成：AI 批量相似度重试与起批紧邻文本修复

- 用户日志显示列表页 50 图批量相似度请求出现 `fetch failed`，导致第 2 行直接失败。
- 已调整 `src/main/services/imageSimilarityService.ts`：
  - OpenAI 兼容批量相似度调用失败后最多重试 2 次。
  - 重试仍保持原图 + 50 张候选图一次性请求，不拆分、不逐张降级。
  - 重试间隔按 1.5s、3s 递增。
- 用户提供新 `#mainPrice` DOM，其中文本可能被拼接为类似 `¥4.901个起批`。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 单件起批判断从 `(?:^|非数字)1个/件起批` 放宽为直接匹配 `1 + 单位 + 起批`。
  - 可识别价格数字后紧邻的 `1个起批` / `1件起批`。

### 已完成：AI 重试与起批拼接文本验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 确认默认 50 候选、Top3 与最优 Sheet 输出未回归。

### 已完成：价格栏等待条件放宽

- 用户人工验证：数量设置为 1 后，input 失焦会立即出现 `.order-select-models`。
- 本次超时原因更可能是等待条件过窄，而不是 DOM 没出现：
  - 旧逻辑只识别 `已选...1个`，未兼容 `1件` 等单位。
  - 旧逻辑用固定正则判断价格/运费，可能与实际提取逻辑不一致。
- 已调整 `src/main/services/detailAdapter.ts`：
  - `.order-select-models` 出现后，最多轮询 30 秒。
  - 数量判断兼容 `个/件/只/条/套/盒/包/组/对/张/块/支/瓶/台/把/双/副/本/辆`。
  - 等待条件改为：已选数量为 1，且实际价格解析函数能读到商品金额和运费。
  - 如果仍失败，错误信息会带上 `.order-select-models` 的文本，方便定位不同页面 DOM 差异。

### 已完成：价格栏等待条件验证

- 已运行并通过：
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build:app`
  - `npm run verify:excel`
  - `npm run inspect:excel`
- `inspect:excel` 确认默认 50 候选、Top3 与最优 Sheet 输出未回归。

### 已完成：价格栏等待超时恢复为 10 秒

- 用户提供 `.order-select-models` 示例，当前逻辑已确认可解析 `已选1款1件`、商品金额和运费。
- 已将价格栏轮询等待从 30 秒恢复为 10 秒。
- 失败错误文案同步改为“10 秒内”。

### 已修正：结果 Excel 原商品主图列保真策略

- 根据用户最新要求，结果 Excel 的 `原商品主图URL` 不再写本地缓存路径，而是必须保持与原 Excel 同样的内容类型。
- 当前策略改为：
  - `原商品主图URL` 保持原单元格内容不变。
  - 本地缓存图片路径写入新增辅助列 `原商品主图本地路径`。
- 更新 `scripts/inspect-output-excel.cjs`：
  - 不再检查 `原商品主图URL` 是否为本地路径。
  - 改为直接对比输入/输出 Excel 第 2-6 行该列单元格值，确保字符串、超链接对象等内容一致。
- 已本地确认：
  - 第 2 行 URL 字符串保持不变。
  - 第 5 行超链接对象保持不变。
  - 第 3/4/6 行依赖图片的单元格值仍与输入一致。

### 已完成：任务列表 + 一对多执行日志重构

- 将默认 AI 模型从 `gpt-4o-mini` 调整为 `gpt-5.5`。
- 菜单项从“任务列表”改为“AI智能选品”，后续按业务语义统一调整为“AI智能比价”。
- 新增 `TaskRun` 执行日志模型：任务只保存配置；每次点击执行都会生成一条独立 run，并拥有自己的输入、输出、日志和资产目录。
- 新增相似度达标采纳条数字段，默认 10；创建任务弹窗和全局配置页均可配置。
- Excel 流程新增 `acceptedCandidateLimit`，列表页相似度达标候选按相似度倒序只采纳前 N 条下钻详情页。
- UI 改为任务列表 + 当前/最新执行日志展示区；任务支持执行、中断、详情、资产、删除、日志操作。
- 日志弹窗支持查看任务下的执行日志列表、查看日志详情、打开该条日志资产/输出、删除单条执行日志。
- 删除任务会同步删除该任务全部 run 的输入、输出、日志和资产；删除单条 run 只删除该 run 的相关资产与日志。
- 日志与执行记录按时间倒序展示，为后续并行执行保留 `currentRunId/latestRunId` 语义。

### 已完成：重构验证

- 已运行并通过：`npm run typecheck`、`npm run lint`、`npm run build:app`。
- 已运行并通过：`npm run verify:excel`、`npm run inspect:excel`。
- `inspect:excel` 确认：默认 50 候选、Top3 行数 15、最优行数 5、原商品主图 URL 已写入本地缓存图片路径。

### 已完成：旧日志型任务轻量迁移兼容

- 为历史已创建的“日志型任务”增加轻量迁移：首次读取配置时，如果旧任务还带 `outputExcelPath` 且没有 run，会自动生成一条历史执行日志。
- 迁移会把旧任务目录下的 `input/images/output/logs` 移入该历史 run 目录，并把旧的按 taskId 存储的日志明细改挂到 runId 下。
- 如果旧任务处于 running，迁移后标记为 cancelled，避免应用重启后出现不可中断的悬挂运行态。

### 已完成：任务执行浏览器模式配置

- 新增全局配置 `taskBrowserMode`，支持 `headless` 无头后台模式和 `headed` 有头低打扰模式，默认 `headless`。
- “打开登录浏览器”仍固定可见，用于登录、验证码和风控处理。
- 任务执行时按配置启动浏览器：
  - 无头后台模式会先关闭应用自己管理的可见登录浏览器，再用同一个独立用户目录无头启动，复用登录态。
  - 有头低打扰模式会切换到任务专用有头 session，并尝试 `--start-minimized`、屏幕外窗口位置等参数降低新窗口打扰。
- 关闭/切换只作用于应用独立 Chrome，不会关闭用户日常使用的 Chrome。
- 已运行并通过：`npm run typecheck`、`npm run lint`、`npm run build:app`、`npm run verify:excel`、`npm run inspect:excel`。

### 已完成：单任务内并发与限流配置

- 新增四类并发配置：任务级并发数量、Excel 行并发数、详情页并发数、AI 请求并发数。
- 默认值按用户建议设置为：任务级 1、Excel 行 3、详情页 3、AI 请求 8。
- 新增通用限流工具 `src/main/services/concurrency.ts`，支持队列限流、并发 map 和轻微错峰。
- 任务级并发现在真正生效：超过任务级并发的 run 会保持 pending 排队，当前 run 结束后自动拉起下一条。
- Excel 内部处理改为按有效数据行并发执行，输出仍按原行号写回，结果 Sheet 仍按原商品行号稳定排序。
- 每条 Excel 行下钻详情页时按详情页并发数处理达标候选，并对详情页打开动作做轻微随机错峰。
- AI 相似度服务新增全局请求限流器：列表 50 图批量对比、SKU 批量对比和单图对比都共享 AI 请求并发上限。
- 已运行并通过：`npm run typecheck`、`npm run lint`、`npm run build:app`、`npm run verify:excel`、`npm run inspect:excel`。

### 已完成：桌面端页面密度与滚动收紧

- 按用户要求对任务页与配置页做了更紧凑的后台式布局优化。
- 全局样式调整：
  - 收窄侧边栏、标题区、面板内边距、按钮和表单控件高度。
  - 降低表格、状态标签、日志项的行高和间距。
  - 将主内容区改为应用级纵向滚动，避免页面外再叠加多层滚动。
- 任务页调整：
  - 任务表格区限制最大高度，超出后在区域内纵向滚动。
  - 日志区限制最大高度，超出后在日志区内部滚动。
  - 保留表格横向滚动兜底，但通过收紧列宽和操作区尽量减少触发频率。
- 配置页调整：
  - 将配置卡片改为更紧凑的双列后台式布局。
  - 当单张配置卡内容过多时，改为卡片内纵向滚动，减少整页长滚动。
- 弹窗调整：
  - 收窄内边距和标题区高度。
  - 新建任务弹窗与日志弹窗都限制最大高度，超出后在弹窗内部滚动。

### 已完成：首页模块化与任务日志区优先级调整

- 首页从流程说明型页面调整为系统模块入口页。
- 首页现在主要展示：
  - 任务概览指标。
  - 系统概览。
  - 任务管理、执行日志、登录浏览器、全局配置四个模块说明。
  - 新建任务、查看日志、配置浏览器、配置 AI 等快捷入口。
- 任务页当前日志卡片调整：
  - 原先大面积展示输入路径、输出路径、资产路径，执行时会挤占日志视野。
  - 现在改为紧凑的一行执行摘要，只保留当前执行名、执行次数和打开资产/输出的操作按钮。
  - 日志列表区域高度提升，执行时优先关注实时日志。

### 已完成：首页主入口精简与弹窗加宽

- 首页进一步精简为两个主菜单入口：
  - `AI智能比价`：说明读取 Excel 商品图片、AI 相似度对比、1688 比价、输出 Excel 和资产定位。
  - `全局配置`：说明 Chrome、AI 中转站、相似度阈值、并发和输出目录配置。
- 移除了首页过多的细分入口、指标卡和默认配置摘要，避免首页变成说明页。
- 弹窗统一加宽：
  - 基础弹窗宽度改为 `80vw`，最大 `1080px`。
  - 最小宽度为 `500px`。
  - 新建任务弹窗会更舒展，不再显得挤。

### 已完成：AI智能比价命名与业务描述统一

- 侧边栏菜单从 `AI智能选品` 改为 `AI智能比价`。
- 首页主入口、首页标题、任务页标题同步改为 `AI智能比价`。
- 业务描述调整为：读取用户 Excel 中已选好的商品图片，到 1688 搜索相似货源；用 AI 对比原图和候选图相似度，优先对高相似候选进一步比价，最终筛出低价且与原商品一致的商品，供用户直接使用或继续筛选。

### 已完成：部分失败结果也完整落盘

- 用户确认：任务部分成功时，所有已处理行都要落盘结果。
- 已调整 Excel 选品表写回逻辑：
  - 成功、失败、缺少主图、未找到等状态统一走同一套字段写回。
  - 失败行也会保留已经拿到的信息，例如本地图片路径、候选数量、推荐 1688 链接、供应商评分、风险备注。
  - 只有确实未拿到的数据才保持空值。
- 已专项验证：模拟“候选已搜索到，但详情页全部失败”的场景，第 2 行状态为 `失败`，但仍保留 `原商品主图本地路径`、`1688候选数=50` 和推荐 1688 链接。

### 已完成：搜图结果超时错误阶段说明

- 用户询问“等待 1688 搜图结果超时”属于哪个阶段。
- 已确认该错误发生在上传图片并点击“搜索图片”之后，等待搜图结果页候选卡片出现/解析的阶段，还没有进入商品详情页。
- 已优化错误与日志：
  - 结果页等待超时文案改为 `1688 搜图结果页候选解析阶段超时`。
  - 行处理失败日志会输出阶段：
    - 尚未拿到候选时为 `搜图结果页候选解析阶段`。
    - 已拿到候选链接后失败时为 `详情页验证或结果筛选阶段`。
  - 如果已经获取候选详情页链接，失败日志会打印前 3 个详情页链接；如果没有，会明确提示尚未获取候选详情页链接。

### 已完成：搜图结果页超时诊断增强

- 在 `src/main/services/searchAdapter.ts` 中补强候选解析阶段超时错误。
- 当等待结果卡片选择器超时时，会额外输出当前结果页 URL。
- 如果页面 DOM 中已经存在商品详情页链接，即使候选卡片选择器没有命中，也会尝试从 `a[href]`、`data-offer-id`、`data-aplus-report`、`data-splus-exp-url` 等位置提取前 3 个详情页链接并写入错误信息。
- 如果页面里也没有详情链接，会明确提示 `页面中暂未发现候选详情页链接`。
- 已运行并通过：`npm run typecheck`、`npm run verify:excel`。

### 已完成：AI 502 错误诊断增强

- 用户反馈 AI 批量相似度查询频繁出现 `502 Bad Gateway`，需要确认并发控制与具体错误信息。
- 已复核当前 AI 并发控制：
  - 单个任务执行 run 内，列表批量相似度、SKU 批量相似度、单图相似度共享同一个 `createAsyncLimiter(aiRequestConcurrency)`。
  - 当前任务启动入口仍限制同一时间只能运行一个任务，因此当前实际是单 run 维度整体限流。
  - 如果后续开放多任务并行，需要把 AI 限流器提升为主进程全局共享，避免每个 run 各自 8 并发后总并发叠加。
- 已调整 `src/main/services/imageSimilarityService.ts`：
  - AI 单图和批量接口非 2xx 时，不再只输出 `502 Bad Gateway`。
  - 错误会附带响应体前 2000 字符。
  - 同时记录 `request-id`、`x-request-id`、`x-openai-request-id`、`cf-ray`、`retry-after` 等诊断响应头。
- 已运行并通过：`npm run typecheck`、`npm run verify:excel`。

### 已完成：真实搜图并发新页串页修复

- 用户反馈某行报错停留在 `https://www.1688.com/`，未进入搜索结果页，怀疑行并发捕捉到了错误的新开页。
- 已确认原逻辑存在风险：
  - `clickAndWaitForResultPage()` 同时监听当前页 `popup` 和共享 `BrowserContext` 的任意新 `page`。
  - Excel 行并发时，多个上传页共用同一个 Chrome context，`context.waitForEvent('page')` 可能抢到其他行打开的新页。
- 已调整 `src/main/services/searchAdapter.ts`：
  - 去掉共享 `context.waitForEvent('page')` 监听。
  - 只认当前上传页自己的 `page.waitForEvent('popup')`。
  - 保留当前页 URL 变化和当前页出现结果卡片作为兜底。
- 预期效果：并发搜图时，每一行只接收自己点击“搜索图片”产生的 popup/跳转，避免误把其他行的新页或 1688 首页当作结果页。

### 已完成：结果页候选解析超时诊断增强

- 用户反馈结果页 URL `https://s.1688.com/youyuan/index.htm?...imageSearch...` 可以手动打开，但程序仍提示候选解析超时。
- 已确认当前候选解析等待时间来自全局配置 `pageTimeoutMs`，默认值为 `30000ms`。
- 该报错表示：已经进入搜图结果页 URL，但在 `pageTimeoutMs` 内没有命中商品卡片选择器，也没有从页面中提取到详情页链接。
- 已调整 `src/main/services/searchAdapter.ts`：
  - 超时错误会明确输出实际等待时间，例如 `等待 30000ms`。
  - 错误诊断会额外输出页面标题。
  - 错误诊断会输出页面正文摘要前 500 字符。
  - 根据页面文本粗略提示是否疑似验证码、安全验证、登录页或无结果页。
- 下一次真实运行可根据页面文本摘要判断是需要补 DOM 选择器、延长超时、降低并发，还是需要人工处理登录/验证码。

### 已完成：1688 搜图结果 air 链接兼容

- 用户在页面控制台验证两个调试脚本都有数据：
  - 商品卡片选择器能命中 60 个结果。
  - `#offer-list-content` 存在，页面文本包含“为您找到以下货源”。
  - 页面链接为 `air.1688.com/...index.html?...offerId=xxx`，不是 `detail.1688.com/offer/xxx.html`。
- 已确认这说明页面本身有渲染；之前“页面中暂未发现候选详情页链接”的诊断不完整，因为没有识别 `offerId` 参数链接。
- 已调整 `src/main/services/searchAdapter.ts`：
  - 结果等待选择器新增 `a[href*="offerId="]` 和 `a[href*="offerId%3D"]`。
  - 超时诊断提取详情链接时也识别 `offerId` 参数。
  - 候选解析时将 `air.1688.com?...offerId=xxx` 还原为 `https://detail.1688.com/offer/xxx.html`。
  - fallback 扫描链接时也纳入 `offerId` 参数链接。

### 已完成：详情页并发目标归属校验

- 用户提醒：从商品列表页打开商品详情页这一步，也要像搜图结果页一样避免并发串页/误页。
- 已复核当前详情页打开逻辑：
  - 当前真实详情页适配器使用 `context.newPage()` 后直接 `page.goto(candidate.offerUrl)`。
  - 没有使用共享 `BrowserContext.waitForEvent('page')` 捕捉任意新页，因此不像搜图结果页那样直接抢其他行 popup。
  - 但仍可能遇到跳转到登录页、风控页、错误商品页或未加载完成就继续解析的问题。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 打开详情页后增加 `assertExpectedDetailPage()`。
  - 优先校验当前 URL 或页面正文是否包含目标 `offerId`。
  - 兜底校验详情页关键 DOM：`#mainPrice`、`.od-price-container`、`.module-od-sku-selection`。
  - 如果无法确认进入目标商品，会输出当前 URL、页面标题、页面文本摘要，并中止该候选详情验证。
- 已调整 `src/main/services/excelService.ts`：
  - 进入详情页验证日志增加 `offerId=xxx`，方便并发时核对具体候选归属。
### 2026-06-07 13:05：修复搜图结果页“有卡片但解析失败”

- 用户确认当前失败仍处于 1688 搜图结果页阶段：已经上传并触发搜索，但未拿到搜索结果候选，不是详情页问题。
- 复核用户控制台数据：结果页实际有 60 个 `#offer-list-content` 商品卡片，详情入口为 `air.1688.com/...index.html?...offerId=xxx`，不是传统 `detail.1688.com/offer/*.html` 链接。
- 已调整 `src/main/services/searchAdapter.ts`：
  - 结果页不再只等待“卡片 DOM 出现”，而是等待 `parseCandidates()` 至少解析出 1 个候选，避免卡片壳子出现但链接/图片尚未挂载时误判。
  - 支持从 `data-renderkey` / `outerHTML` 中的尾部长数字 offerId 提取候选，例如 `..._885655981064`。
  - 当卡片根节点本身是 `a[href]` 时也能直接读取 href，避免 fallback 根节点就是 anchor 时查不到子 anchor。
  - 结果页 `networkidle` 改为最多等待 5 秒，避免 1688 长轮询导致每行额外白等 30 秒。
  - 搜图完成日志会输出候选数和前 3 个候选详情链接，便于判断是否拿到了搜索结果。
- 已将 `appendLog` 传入真实搜图适配器，便于搜图阶段直接输出解析统计。
- 已运行并通过：`npm run typecheck`。
### 2026-06-07：设置页去除模块内滚动条

- 用户反馈 AI 接口并发配置“被拿掉”是因为配置项藏在模块内滚动条里，不容易看到。
- 已调整 `src/renderer/pages/SettingsPage.tsx`：
  - 设置页每个配置模块不再依赖内部滚动。
  - “采集参数”改为左右两列表单，保留 Excel 行并发和详情页并发。
  - “AI 接口并发数”移动到“AI 相似度识别”模块内，与模型、阈值放在一起。
  - “Chrome 与 1688”和“AI 相似度识别”作为两张普通卡片左右并排。
- 已调整 `src/renderer/styles/global.css`：
  - 去掉设置卡片 `max-height` 和 `overflow: auto`。
  - 设置页改为两列瀑布流排列，卡片高度自然撑开。
  - 新增 `settings-form-grid`，让单个模块内部字段左右两列展示，减少纵向空间。
- 已运行并通过：`npm run typecheck`。
### 2026-06-07：结果 Excel 原主图单元格图片保真

- 用户确认原图是“图片嵌入单元格”的方式放入 Excel，不是普通 URL，也不是浮动图片。
- 已确认根因：
  - ExcelJS 读写后会丢失 WPS/Excel 单元格图片相关的 `xl/cellimages.xml`、`xl/_rels/cellimages.xml.rels` 和内容类型声明。
  - 单元格里原本的 `DISPIMG(...)` 关系丢失后，结果 Excel 会显示 `#REF!`。
- 已调整 `src/main/services/excelService.ts`：
  - 处理前记录 `原商品主图URL` 列的原始单元格值。
  - 文字 URL / 超链接对象继续原样写回，不改成本地路径。
  - 单元格图片保留原 `DISPIMG(...)` 值，并在写出结果 xlsx 后，从源 Excel 复制 `cellimages.xml`、`cellimages.xml.rels`、关联 `xl/media/*` 和 `[Content_Types].xml` 声明到结果 Excel。
  - 搜图用图仍保留原来的兜底读取：如果主图列为空但行内只有一个图片，也可用于搜索；但结果主图列只按原主图列表头保真复制，不再误把其他列图片写进主图列。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run verify:excel`
  - 专项检查结果 xlsx 已包含 `xl/cellimages.xml` / `xl/_rels/cellimages.xml.rels`，`原商品主图URL` 列未出现 `#REF!`。
### 2026-06-08：起批数量与已选数量单位放宽

- 用户反馈 1688 起批文案不只 `1件/1个`，还可能是 `1套/1束/1只` 等，希望只看数字 `1` 和 `起批`，不再限制中间量词。
- 已调整 `src/main/services/detailAdapter.ts`：
  - 起批校验从单位白名单改为 `1 + 非数字短量词 + 起批`，支持 `1套起批`、`1束起批`、`1只起批`、`1瓶起批` 等。
  - 保留防误判：`11件起批` 不会被识别为 `1起批`。
  - 兼容价格和起批拼接文本：例如 `¥4.901个起批`、`¥12.611套起批` 会先剥离紧贴起批前的价格片段，再判断起批数量。
  - `.order-select-models` 中“已选 1 款 1 件/套/束...”的价格栏等待也同步去掉单位白名单，只判断已选数量是否为 `1`。
  - 错误提示从 `1 件/个` 改成更通用的 `1 起批` / `已选数量 1`。
- 已用临时规则样例验证：
  - 通过：`1件起批`、`1个起批`、`1套起批`、`1束起批`、`1只起批`、`1瓶起批`、`¥4.901个起批`、`¥12.611套起批`。
  - 拒绝：`11件起批`、`2套起批`。
- 已运行并通过：
  - `npm run typecheck`
  - `npm run verify:excel`

### 2026-06-09 17:46:00：飞书输入状态实时逐行执行
- 新增飞书任务持续执行：按全局间隔每次领取 1 行状态为 待核实 且已填写原商品链接/原商品主图URL 的记录。
- 领取后将输入表状态改为 核实中，跑完后成功写 已完成，未找到/异常写 失败，并在输出货源表同步 状态。
- 全局配置新增实时抓取间隔；任务列表新增持续执行/停止持续按钮，原执行按钮保留为手动整表执行。
- 已通过 pnpm exec tsc --noEmit 与 pnpm run build:app，并重新启动 dev 项目。

### 2026-06-09 18:34:35：飞书真实链接运行验证
- 已清理输出货源表旧测试记录；输入表恢复/保留 1 条真实商品链接记录。
- 真实 1688 模式有头低打扰执行成功：run_codex_test_mq6h6is8_0c2ogz，1/1 成功，解析到 50 个候选并写回输出表 3 条记录。
- 输出表状态为 已完成；输入表状态同步补为 已完成。
- 当前全局 AI Base URL/API Key 仍为空，因此相似度服务实际走 mock；风险备注中也显示 mock 相似度结果。

### 2026-06-11：AI上架妙手官方 skill 链路固化

- 已将妙手官方上架链路固化到软件按钮，不再只依赖 Codex skill 手动执行：
  - 查询妙手 TikTok 授权店铺。
  - 从待上架商品表导入 1688 货源链接到妙手公共采集箱。
  - 保留直接创建公共采集箱商品作为备选路径。
  - 从公共采集箱认领到 TikTok 采集箱。
  - 做发布前检查：目标站点、店铺ID、TikTok采集箱待发布商品、仓库；类目由妙手编辑页自动匹配或人工处理。
  - 仍不自动发布。
- 已从 AI上架 页面移除采购确认入口；采购后续独立做 AI采购 模块。
- 全局配置已重排为：通用路径、AI比价配置、Chrome与1688、AI相似度识别、飞书多维表格、AI上架/妙手。
- AI上架/妙手新增配置：目标店铺ID、妙手账号ID（用于 x-account-id）；目标类目ID不再作为上架配置项。
- 妙手 API 客户端已兼容成功码 success / 0 / 200，并支持可选 x-account-id。
- 已通过验证：npm run typecheck、npm run lint、npm run build:app。

### 2026-06-11：启动 AI上架审核表第一版

- 用户确认第一版按“飞书行里填写郑和数据链接”推进；系统读取郑和 SKU 价格、结合 1688 Top3 比价结果做克重多数决和利润测算。
- 目标同时支持飞书版和本地 Excel 版；先生成审核表供用户审查字段，再继续删减/增强。
- 需同步修复 AI 模型配置保存文案：点击保存后立即生效，不再提示重启。

### 2026-06-11：完成 AI上架审核表第一版

- 新增郑和数据读取服务：按郑和链接/复制链接里的商品ID读取 `/product/sku`，按站点汇率换算前端SKU价格；基础信息和近30天趋势作为参考字段。
- 输入选品表、输出货源表、待上架商品表新增「郑和数据链接」字段；本地 Excel 也会保留该列。
- 新增 `AI上架审核表` 飞书表，字段覆盖前端SKU价、币种、站点、评分、佣金、类目、上架时间、近30天销量、推荐1688货源、克重决策、利润测算、上架状态和不可上架原因。
- AI上架页新增两个按钮：生成飞书审核表、生成本地审核表；本地版会导出同字段 Excel。
- 上架配置新增站点汇率配置和目标利润率，默认目标利润率 5%。
- AI模型配置保存提示已改为“后续任务立即使用”；设置保存本身已经写入 store，任务启动时会读取最新值。
- 已重新启动 dev 项目并通过：npm run typecheck、npm run lint、npm run build:app。
### 2026-06-11：记录妙手 skill 上架接口清单

- 新增 `docs/miaoshou-skill-api-record.md`，固定记录 7 个妙手官方 skill 中与上架相关的 OpenAPI。
- 已区分读数接口和动作接口：核心读数接口为公共采集箱详情、TikTok 店铺/站点采集箱详情、类目元数据、仓库/制造商/责任人列表；最终发布接口暂不自动调用。
- 明确当前软件已接入接口与缺口：下一步若要做真实编辑闭环，需要补 `get_common_collect_box_detail`、`get_shop_collect_item_info/get_site_collect_item_info` 和对应保存接口。

### 2026-06-11：对照妙手官方 Apifox 文档补充接口

- 已读取妙手官方 Apifox 分享文档 `api-446814596`，并从侧边栏逐页提取公开接口。
- 商品/公共采集箱/TK采集箱/店铺模块与已安装 7 个 skill 的上架接口基本一致，没有发现新的商品上架核心接口。
- 已补充官方店铺查询枚举：`platform` 支持 `tiktok` / `tiktokGlobal`，站点包含 `ID/VN/TH/MY/PH/BR/MX/ES/FR/GB/TIKTOKGLOBAL/TIKTOKGLOBALUS/TIKTOKGLOBALEU/US/DE/IT/JP`。
- 已新增“官方额外履约接口”章节，记录物流、运单、包裹详情、批量包裹、发货等接口；这些接口先归入未来履约/物流卡片，不进入当前 AI上架第一版。

### 2026-06-12：锁定 AI比价三表字段与流程

- 新增 `docs/ai-price-three-table-workflow.md`，记录已确认的 AI比价三表闭环：输入表、输出货源表、待人工核实上架表。
- 已锁定字段名、状态选项、失败归因多选、比价批次号、重复检测、表二到表三推荐规则、表三硬校验、手动重跑规则、模板按钮规则。
- 已确认第一版表三不放利润字段；利润筛选后续放到 AI上架模块或独立利润审核表。
- 已确认模板按钮包括：创建飞书三表字段、导出本地三表 Excel 模板。

### 2026-06-12：AI比价三表真实流程跑通

- AI比价三表专项计划已更新：`.planning/ai-price-three-table/`。
- 真实单行流程已跑通：郑和链接 -> 1688 搜图 -> AI列表相似度 -> 详情页解析 -> 表二输出货源表。
- 验证批次：
  - runId：`run_codex_realtime_mqau1xzy_i92ehz`
  - 商品ID：`1731239626193011815`
  - 国家/站点：`id`
  - 比价批次号：`cmp_20260612_192016_stt1`
- 表二成功写入 3 条候选；表一写入 `已进入比价`。
- 表三未生成是正确结果：表二商品组状态仍为 `待核实`，需人工改为 `已核实 / 待更新表三` 后才进入表三推荐。
- 已修正：
  - `起批量` 只作为参考值，不再硬拦截表三。
  - 自动生成表三限定当前 `比价批次号`，不再扫描旧已核实商品组。
  - 配置文件 UTF-8 BOM 导致 Electron 启动 JSON.parse 报错的问题。
- 已验证：`npm.cmd run verify:price-three-table`、`npm.cmd run typecheck`、`npm.cmd run build:electron` 通过。

### 2026-06-13：AI上架展示价与 5% 利润率规则记录

- 已确认“5%利润”不是妙手开放 API 可直接套用的定价模板字段。
- 当前业务含义：5% 对应表三/上架链路中的跨境利润率，用于后续按国家、克重、采购总成本计算最终 `展示价格`。
- AI上架编辑表中的 `展示价格` 后续从该利润率公式生成；保存妙手草稿时写入 SKU 的 `priceIncludeVat`，不改 `price`。
- 第一版先保留手动填写/回写框架，等用户补充不同国家的公式后再接入自动计算。

### 2026-06-13：上架配置店铺导出与站点下拉

- 上架配置「店铺与站点」已把目标站点改为下拉选项：MY、SG、PH、VN、TH。
- 新增「导出店铺配置」按钮，批量调用妙手店铺列表接口，默认导出 MY/SG/PH/VN/TH 五个站点的店铺 ID、店铺名、平台、授权状态和到期时间。
- Excel 中同时提供可复制到配置页的三列：`填入上架配置-目标站点`、`填入上架配置-目标店铺ID`、`填入上架配置-目标店铺名称`。
- 已用当前妙手配置做冒烟验证：MY 7 个、SG 6 个、PH 3 个、VN 5 个、TH 4 个，共 25 个店铺。
- 已验证：`npm.cmd run typecheck`、`npm.cmd run build:app` 通过。

### 2026-06-13：开始 AI上架妙手真实闭环执行

- 用户授权按既定计划持续执行并自查遗漏，目标是从表三/AI上架审核表 1 条 `已审核` 记录跑通妙手采集、TikTok 认领、目标店铺认领、AI上架编辑表生成和后续草稿保存。
- 本轮先不清空飞书表；只有在完整链路仍无法跑通时，才按用户规则清空相关表，仅保留表一郑和数据单条并最多重测 5 次。
- 当前自查重点：轻量编辑表字段、妙手公共采集箱 ID/TikTok 采集箱 ID 传递、默认尺寸、克重缺失保护、保存草稿只改 `originPrice` / `priceIncludeVat` / 重量 / 尺寸。
- 自查修正：
  - `generateMiaoshouListingEditTable` / `saveMiaoshouListingDrafts` 增加可选 `limit`，便于真实冒烟测试只跑 1 条，避免误批量处理。
  - 保存妙手草稿后新增包裹长宽高校验，防止接口忽略尺寸仍被误判为成功。
  - 通过 UTF-8 请求体将表三当前唯一测试记录状态从 `待核实` 更新为 `已审核`，用于单条妙手链路测试；记录ID `recvmk8vGFk1ZL`。
- 单条真实妙手生成链路已跑通：
  - 目标店铺：`MY / 小郭马来 / 15013562`。
  - 结果：扫描 1 条、创建 AI上架编辑表记录 1 条、推进 1 条、失败 0。
  - AI上架编辑表：`tblZAcboSuBPVuJ4`，记录 `recvmnZbu42uzS`。
  - 当前状态：公共采集箱已采集、TikTok采集箱已认领、目标店铺已认领、编辑状态 `待人工编辑`。
  - 当前 `展示价格` 为空；后续保存草稿只能验证统一货源价格、重量和尺寸，不能验证 `priceIncludeVat` 展示价写入。
- 保存草稿测试发现新的真实接口约束：
  - 妙手保存接口返回 `cid 必填`，说明保存前 payload 必须已有类目。
  - 已改代码：目标类目ID不再作为上架配置项；保存草稿不主动写 `cid`，只保留妙手详情里已有的类目。
  - 如果妙手未自动匹配类目，系统提前写入 `需人工处理`，失败原因：`妙手未自动匹配类目，请先在妙手编辑页选择店铺并完成类目匹配`。
- 继续测试发现当前采集到的 TikTok 采集箱记录 `editModel = site`，`collectBoxDetailShopList = []`；店铺模式详情接口报 `未选择预发布店铺` / `此产品在采集箱中已被删除`。
  - 结论：第一版“只做店铺模式”的假设在真实数据上不成立；需要补 TikTok 站点模式 `get_site_collect_item_info` / `save_site_collect_item_info`，或确认 claim_to_shop 对 site 模式的正确前置步骤。
- 已补 TikTok 站点模式兼容：
  - 妙手客户端新增 `get_site_collect_item_info` / `save_site_collect_item_info`。
  - AI上架编辑表新增 `编辑模式` 字段。
  - 生成编辑表时，店铺模式详情遇到 `未选择预发布店铺 / 已被删除` 自动 fallback 到站点模式。
  - 保存草稿时按 `编辑模式=site/shop` 调用对应保存接口。
  - 重新推进当前测试记录成功：扫描 1 条、更新 1 条、失败 0；编辑模式已写为 `site`。
  - 再次保存草稿时失败原因已明确为 `妙手未自动匹配类目，请先在妙手编辑页选择店铺并完成类目匹配`，这是当前剩余人工卡点。
- 本轮验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `npm.cmd run build:app`
- 当前需要人工确认/配置：
  - 当前妙手 site 模式详情 `cid` 为空，保存接口要求 `cid`，所以系统已停止在人工处理节点。
  - 当前 `展示价格` 为空，保存草稿即使有类目 ID，也只能验证货源价、重量、尺寸；展示价公式和目标展示价仍待补。
  - 后续可选增强：新增“类目推荐/类目树”按钮，先读取 site 类目树并给出候选 cid，人工确认后写入妙手详情；当前第一版先走妙手后台自动匹配/人工选类目。

### 2026-06-13：AI上架妙手阶段检查点

- 已按用户要求记录当前进程：AI比价三表已经跑通，当前主线切到 AI上架/妙手真实闭环。
- AI上架当前边界保持不变：
  - 不自动发布。
  - 不做采购。
  - 不把主图、详情、SKU图、完整 SKU Map、`ossMd5` 写入飞书。
  - 保存草稿前重新读取妙手详情，只改统一货源价格、展示价格、重量、尺寸。
- 当前真实测试记录：
  - 表三记录：`recvmk8vGFk1ZL`。
  - AI上架编辑表：`tblZAcboSuBPVuJ4`。
  - AI上架编辑记录：`recvmnZbu42uzS`。
  - 商品ID：`1729650408469530302`。
  - 站点：`MY`。
  - 目标店铺：`小郭马来 / 15013562`。
  - 公共采集箱ID：`3692840388`。
  - TikTok采集箱ID：`3076160427`。
- 当前状态：
  - 采集状态：`已采集公共采集箱`。
  - 认领状态：`已认领TikTok采集箱`。
  - 店铺认领状态：`已认领目标店铺`。
  - 编辑模式：`site`。
  - 编辑状态：`需人工处理`。
  - 失败原因：`妙手未自动匹配类目，请先在妙手编辑页选择店铺并完成类目匹配`。
- 下一步执行规则：
  - 用户在妙手编辑页选择店铺并完成类目匹配后，回到飞书 AI上架编辑表，将 `编辑状态` 改为 `待保存草稿`。
  - 再运行软件里的保存草稿流程，验证 `originPrice`、重量、默认尺寸 `10*10*10cm` 是否保存成功。
  - 如果 `展示价格` 已填写，则同步验证 `priceIncludeVat` 写入；如果仍为空，只验证货源价、重量、尺寸。
  - 展示价格公式后续由用户补充，当前只保留字段和写入框架。

### 2026-06-13：AI上架店铺选择复核修正

- 用户在妙手后台截图确认：当前 TikTok 采集箱记录仍显示 `请选择预发布店铺`，发布店铺列为 `+ 选择店铺`。
- 结论：此前 `claim_to_shop` 接口调用后直接写 `已认领目标店铺` 的判断过早，实际后台可能没有真正触发/完成预发布店铺绑定。
- 已修正软件逻辑：
  - 调用 `claim_to_shop` 后，不再只按接口无异常判断成功。
  - 新增远端复核：读取 TikTok 采集箱列表、site 详情和 shop 详情，确认目标 `shopId` 出现在 `claimToShopIds`、`collectBoxDetailShopList[].shopId`，或店铺模式详情已能读取。
  - 如果复核失败，AI上架编辑表写：
    - `店铺认领状态 = 需人工选择店铺`
    - `编辑状态 = 需人工处理`
    - `失败原因 = 妙手未触发预发布店铺选择，请先在妙手采集箱点击“选择店铺”并选择目标店铺`
  - 复核失败时不再继续误读 site 详情并写成 `待人工编辑`。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `npm.cmd run build:app`

### 2026-06-13：接入妙手最终发布接口

- 用户确认希望后续尽量找出自动发布到店铺的能力，这是自动上架系统的核心。
- 已确认妙手官方上架 skill / API 文档存在最终发布接口：
  - `/open/v1/product/collect_box/tiktok/collect_box/save_move_collect_task`
  - 参数：`detailIds + shopIds`
- 已在软件中接入受控发布能力：
  - 妙手 API 客户端新增 `publishCollectTask`。
  - AI上架页新增 `9. 提交妙手发布`。
  - 点击按钮会二次确认；只有确认后才调用发布接口。
  - 只处理 AI上架编辑表中 `编辑状态 = 草稿已保存` 的记录。
  - 发布提交成功后写：
    - `编辑状态 = 已提交发布`
    - `发布准备状态 = 已提交发布`
  - 发布失败写：
    - `编辑状态 = 需人工处理`
    - `发布准备状态 = 发布失败`
    - `失败原因 = 妙手提交发布失败原因`
- 第一版仍不做无确认自动发布；后续如果发布前检查稳定，再升级成规则内自动发布。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `npm.cmd run build:app`

### 2026-06-13：再次尝试妙手店铺选择/绑定

- 按用户要求再次执行真实单条 AI上架推进，目标是验证已知店铺 ID 是否可以自动触发妙手预发布店铺选择。
- 第一次重试结果：
  - 旧 TikTok采集箱ID `3076160427` 已失效。
  - 妙手详情接口返回：`此产品在采集箱中已被删除` / `未找到采集箱产品信息`。
- 已修正：
  - 将 `未找到采集箱产品信息` 纳入旧采集箱失效识别，后续会自动重采集，而不是继续使用旧 ID。
  - 远端复核失败时会再次调用 `claim_to_shop`，再复核目标店铺绑定状态。
- 第二次重试结果：
  - 重新采集成功。
  - 新公共采集箱ID：`3694039545`。
  - 新 TikTok采集箱ID：`3077390913`。
  - AI上架编辑表记录 `recvmnZbu42uzS` 更新成功，状态为 `待人工编辑`。
  - 店铺模式详情 `get_shop_collect_item_info(detailId=3077390913, shopId=15013562)` 已可读取，说明目标店铺绑定已通过接口成功。
  - 当前 `cid` 仍为空，说明下一卡点已经从“店铺选择”变成“类目未自动匹配”。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `npm.cmd run build:app`

### 2026-06-13：类目未自动匹配改为人工处理并继续下一条

- 用户确认：妙手/TK 自动匹配类目受店铺类目权限限制；如果店铺没有开通该类目，不应强行自动归类。
- 已更新规则：
  - 店铺绑定成功后读取妙手详情。
  - 如果 `cid` 为空，写入：
    - `编辑状态 = 需人工处理`
    - `发布准备状态 = 类目未自动匹配`
    - `失败原因 = 妙手未自动匹配类目，可能是目标店铺未开通该类目或TikTok类目限制；请人工处理该商品`
  - 该条不进入 `待人工编辑` / `待保存草稿`。
  - 批量执行时继续下一条，不把整个任务卡住。
- 同步修正：
  - 旧公共采集箱/TikTok采集箱如果接口返回 `已被删除` / `未找到采集箱产品信息`，本轮立即重新采集一次，不等下一轮。
- 真实单条验证结果：
  - 新公共采集箱ID：`3694154071`。
  - 新 TikTok采集箱ID：`3077500459`。
  - 店铺认领状态：`已认领目标店铺`。
  - 编辑状态：`需人工处理`。
  - 失败原因已按类目未自动匹配规则写入。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `npm.cmd run build:app`

### 2026-06-13：AI比价 SG 新增表1真实数据从头跑通

- 按用户要求从表1新增/重置的 SG 记录重新跑 AI比价真实链路。
- 测试记录：
  - 表1记录：`recvmpxBWKI7h0`
  - 商品ID：`1731896561184441521`
  - 站点：`sg`
  - 原商品链接：`https://www.tiktok.com/shop/sg/pdp/1731896561184441521?source=ecommerce_mall`
  - 新比价批次号：`cmp_20260613_184858_3heu`
- 已修复并验证 1688 搜图结果页候选解析：
  - 旧错误为 `page.evaluate: ReferenceError: __name is not defined`。
  - 修复后同一真实流程可解析 50 个候选。
  - 表2成功写入 3 条候选，均为 `候选状态 = 成功`。
- 真实 run 结果：
  - 本地 run：`run_smoke_mqc8ctw7_unugi2`
  - 状态：`success`
  - 总数：1
  - 成功：1
  - 失败：0
  - 列表 AI 相似度：50/50 完成。
  - 达标候选：44/50。
  - 快速模式下钻：3 条。
- 表2结果核对：
  - 候选1：`https://detail.1688.com/offer/1016594785810.html`，SKU `黑色【赠背胶】`，采购价 0.36，运费 2.5，总成本 2.86，克重 200，尺寸 `2×7`。
  - 候选2：`https://detail.1688.com/offer/1009148342055.html`，SKU `免打孔-黑色`，采购价 1.14，运费 3.5，总成本 4.64，克重 130，尺寸 `7.5×9×9`。
  - 候选3：`https://detail.1688.com/offer/1010736392063.html`，SKU `免打孔-黑色`，采购价 1.14，运费 3.5，总成本 4.64，克重 130，尺寸 `7.5×9×9`。
- 表三生成验证：
  - 只手动把表2本批次候选1的 `商品组状态` 改成 `已核实`。
  - 调用表三生成后，系统自动同步本批次同组 3 行 `商品组状态 = 已核实`。
  - 表三扫描 1 组，成功 1，失败 0。
  - 表三推荐链接：`https://detail.1688.com/offer/1009148342055.html`。
  - 选择依据：`克重多数决策：130g组命中2/3，组内最低采购总成本链接胜出`。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
- 备注：
  - 命令行 smoke 脚本本次在 run 已成功写回后仍出现进程未自动退出，需要手动清理测试脚本进程；软件业务结果不受影响，后续可单独收尾这个测试脚本退出问题。

### 2026-06-13：AI上架站点规则调整

- 用户确认新的站点规则：
  - 表三中的 `国家/站点` 正常录入原商品国家即可。
  - AI上架编辑/妙手接口调用时，以妙手店铺接口返回或上架配置选择的目标店铺站点为准。
  - 后续会有更多国家进来，不能用表三国家和当前目标站点做硬性不匹配拦截。
- 已调整代码：
  - 移除 AI上架生成编辑表时的 `站点不匹配：表三=...，目标店铺=...` 硬拦截。
  - AI上架编辑表新增字段：`目标店铺站点`。
  - 生成 AI上架编辑表时写入 `目标店铺站点`，表三 `国家/站点` 继续保留原值。
  - 保存妙手草稿、读取 site 模式详情、复核店铺绑定时，优先使用 `目标店铺站点`，再兜底上架配置站点，最后才兜底表三国家。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
- 已重启项目，当前运行中的 Electron 已加载新主进程代码。

### 2026-06-13：AI比价到妙手草稿保存真实闭环跑通

- 本次真实闭环按当前第一版边界执行：
  - 表一待处理入口检查。
  - 表二候选货源读取。
  - 表三 `已审核` 记录进入 AI上架编辑表。
  - 妙手原商品链接采集到公共采集箱。
  - 认领到 TikTok 采集箱。
  - 认领/绑定目标店铺。
  - 读取妙手店铺模式详情。
  - 保存妙手草稿。
- 当前测试记录：
  - 商品ID：`1731896561184441521`
  - 表三记录：`recvmr3KO2cP87`
  - AI上架编辑表记录：`recvmr55Fj5znJ`
  - 公共采集箱ID：`3695644566`
  - TikTok采集箱ID：`3078872531`
  - 目标店铺ID：`15013562`
  - 目标店铺名称：`小郭马来`
- 保存草稿前发现并修复两个妙手保存接口适配点：
  - `shopCollectItemInfo.deliveryOptionSetType` 必填：保存前若缺失，补 `default`，并补空数组 `deliveryOptionIds`。
  - 空尺寸表触发 `尺寸表图片URL仅支持JPG、JPEG、PNG格式`：如果 `sizeChart` 为空或不是 jpg/jpeg/png URL，保存时移除空尺寸表字段，不改主图、详情和 SKU 图。
- 最终真实保存结果：
  - AI上架编辑表 `编辑状态 = 草稿已保存`。
  - `统一货源价格 = 4.64` 已写入妙手所有有效 SKU 的 `originPrice`。
  - `包裹重量g = 130` 已写入商品重量 `0.13kg` 和所有有效 SKU 重量 `0.13kg`。
  - `包裹尺寸 = 7.5 × 9 × 9` 已写入商品包裹尺寸。
  - `展示价格` 为空，因此未改妙手原有 `priceIncludeVat`，当前仍为 `11.85`。
  - 未调用最终发布接口。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `scripts\smoke-miaoshou-save-drafts.ts` 返回 `savedCount = 1`、`failedCount = 0`。

### 2026-06-13：表三本地展示价同步到 AI上架编辑表

- 用户已在表三新增公式字段并产出展示价格。
- 已调整 AI上架读取逻辑：
  - 表三采购成本支持读取 `采购总成本/CNY`。
  - 表三展示价支持读取 `本地展示价/MYR`、`本地展示价`、`展示价格`、`最终成交价格/MYR`。
  - 飞书公式字段返回 `{ type: 2, value: [数字] }` 时可正常解析为数字。
- AI上架编辑表新增/同步字段：
  - `本地展示价`
  - 同时保留旧字段 `展示价格`，两者写入同一个展示价，便于兼容旧脚本和页面。
- 重新执行生成/推进 AI上架编辑表后，当前 MY 测试记录已同步：
  - 表三 `本地展示价/MYR = 20.39`
  - AI上架编辑表 `展示价格 = 20.39`
  - AI上架编辑表 `本地展示价 = 20.39`
  - `统一货源价格 = 4.88`
- 已补保护：如果 AI上架编辑表记录处于 `待保存草稿`、`草稿已保存`、`已提交发布`、`需人工处理`、`失败` 等人工/终态状态，再点击生成/推进时只同步价格等基础字段，不自动回退到 `待人工编辑`。
- 二次修改规则已确定：
  - 要改货源价、展示价、重量、尺寸，直接在 AI上架编辑表修改 `统一货源价格`、`本地展示价/展示价格`、`包裹重量g`、长宽高。
  - 然后把 `编辑状态` 改为 `待保存草稿`，再点击保存草稿。
  - 保存前系统重新读取妙手最新详情和 `ossMd5`，只覆盖 `originPrice`、`priceIncludeVat`、重量、尺寸，不改主图、详情、SKU图、SKU结构。
- 本轮真实保存测试：
  - 已将 MY 测试记录置为 `待保存草稿`。
  - 保存草稿被正确拦截，原因仍是妙手详情 `cid` 为空。
  - 上架表最终写回：`编辑状态 = 需人工处理`，失败原因为 `妙手未自动匹配类目，可能是目标店铺未开通该类目或TikTok类目限制；请人工处理该商品`。
- 当前卡点：
  - 展示价同步已完成。
  - 保存/发布仍卡在类目 `cid` 为空。
  - 下一步需要人工在妙手选择类目，或接入类目推荐/类目树接口，生成候选类目后人工确认写入。
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`

### 2026-06-14：SG 单条从表1到妙手草稿保存完整闭环复测

- 按用户要求从头执行：清理旧的 MY 表三记录和 AI上架编辑表记录，只保留表1 SG 待处理入口。
- 本次入口：
  - 表1记录：`recvmpxBWKI7h0`
  - 商品ID：`1731896561184441521`
  - 原商品链接：`https://www.tiktok.com/shop/sg/pdp/1731896561184441521?source=ecommerce_mall`
- 先发现 AI Base URL 配置为 `https://sub2api.toioto.org//v1`，请求 `/chat/completions` 返回 ToioTo 网关 HTML 首页，导致 AI 相似度失败。
- 已修复：
  - 本地配置规整为 `https://sub2api.toioto.org/v1`。
  - 代码新增 OpenAI Compatible Base URL 规范化，避免 `//v1` 再打到首页。
- 重新执行 AI比价成功：
  - 批次号：`cmp_20260614_045019_pg8t`
  - 表2写入 3 条成功候选。
  - 候选1：`https://detail.1688.com/offer/1016594785810.html`，SKU `黑色【赠背胶】`，采购总成本 `2.86`，克重 `200g`，尺寸 `2×7`。
  - 候选2：`https://detail.1688.com/offer/1010736392063.html`，SKU `免打孔-黑色`，采购总成本 `4.64`，克重 `130g`，尺寸 `7.5×9×9`。
  - 候选3：`https://detail.1688.com/offer/1009148342055.html`，SKU `免打孔-黑色`，采购总成本 `4.64`，克重 `130g`，尺寸 `7.5×9×9`。
- 表三生成成功：
  - 表三记录：`recvmsAEeLMLau`
  - 推荐链接：`https://detail.1688.com/offer/1010736392063.html`
  - 选择依据：`克重多数决策：130g组命中2/3，组内最低采购总成本链接胜出`
  - 已手动标记为 `已审核` 进入 AI上架。
- AI上架生成/推进成功：
  - AI上架编辑表记录：`recvmsB6UvEAPg`
  - 公共采集箱ID：`3695937112`
  - TikTok采集箱ID：`3079176566`
  - 编辑模式：`shop`
  - 目标店铺：`15013562 / 小郭马来`
  - 妙手类目：`cid=600403`
- 妙手草稿保存成功：
  - `originPrice` 已写入所有有效 SKU：`4.64`
  - 商品/SKU 重量已写入：`0.13kg`
  - 包裹尺寸已写入：`7.5 × 9 × 9`
  - 展示价未写入妙手：表三/上架表本地展示价为 `-0.81`，不满足正价条件，妙手原售价保持 `11.85`。
- 发布流程已测试并被安全拦截：
  - 扫描 1 条，提交 0 条，失败 1 条。
  - AI上架编辑表写回：`编辑状态 = 需人工处理`
  - 失败原因：`本地展示价必须大于 0，当前公式结果无效，已停止自动发布`
- 已验证：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
- 当前结论：
  - 技术链路已跑通到妙手草稿保存。
  - 自动发布被业务校验阻断，卡点是展示价公式结果为负数，需要修正表三价格/利润公式后再允许发布。


### 2026-06-14：AI上架价格异常重跑闭环补强

- 新增 AI上架编辑表异常项重跑能力：`prepareMiaoshouListingDraftRetry`。
- 页面新增按钮：`7B. 重新保存异常项 / 准备重保存`。
- 使用规则：人工在 AI上架编辑表修正 `统一货源价格`、`本地展示价/展示价格`、`包裹重量g`、尺寸后，点击该按钮；系统只把字段完整且 `本地展示价 > 0` 的异常项改回 `待保存草稿`。
- 安全边界：该动作不调用妙手，不改主图/详情/SKU，只操作飞书状态；负价仍停在 `需人工处理`。
- 真实验证：当前 SG 记录 `本地展示价=-0.81`，执行重跑准备后未放行，写回 `失败原因=请先修正：本地展示价`。
- 已验证：`npm.cmd run typecheck`、`npm.cmd run build:electron`。

### 2026-06-14：AI上架展示价字段容错补强

- 保存草稿成功后的 `发布准备状态` 已改为动态判断：
  - `本地展示价/展示价格 > 0`：写 `待人工发布`。
  - 价格为空或小于等于 0：写 `价格异常`，失败原因写明正价要求。
- AI上架编辑表读取展示价时改为优先取正数：如果 `本地展示价` 仍是旧负数，但人工只把 `展示价格` 改成正数，系统也会使用正数继续重保存/发布。
- 已验证：`npm.cmd run typecheck`、`npm.cmd run build:electron`。

### 2026-06-14：AI上架准备保存按钮扩展

- `准备保存草稿` 现在不仅处理异常项，也处理 `待人工编辑` 行。
- 人工在 AI上架编辑表确认/修正 `统一货源价格`、`本地展示价/展示价格`、重量、尺寸后，不需要手动把状态改成 `待保存草稿`，点按钮即可放行合格记录。
- 当前真实 SG 记录仍因 `本地展示价=-0.81` 被拦截：`preparedCount=0`、`failedCount=1`。
- 已验证：`npm.cmd run typecheck`、`npm.cmd run build:electron`。

### 2026-06-14：项目自查与 ESLint 配置修复

- `npm.cmd run build:app` 已通过。
- 初次 `npm.cmd run lint` 被新增的 `scripts/*.ts` 调试脚本卡住：这些脚本不在 `tsconfig.json` include 范围内。
- 已将 `scripts` 纳入 `tsconfig.json` include，保留 `.codex-run/**` 忽略策略。
- 复测通过：`npm.cmd run lint`、`npm.cmd run typecheck`。

### 2026-06-14：AI上架正价后完整发布闭环跑通

- 表三公式刷新后读取到 `本地展示价/MYR = 61.09`、`最终成交价格/MYR = 18.33`。
- 已重新执行 `generateMiaoshouListingEditTable`，AI上架编辑表同步：
  - `展示价格 = 61.09`
  - `本地展示价 = 61.09`
  - `统一货源价格 = 4.64`
- 执行 `prepareMiaoshouListingDraftRetry`：1 条记录从 `需人工处理` 置为 `待保存草稿`。
- 执行 `saveMiaoshouListingDrafts`：保存成功 1 条。
- 妙手远端复核：
  - `cid = 600403`
  - `originPrice = 4.64`
  - `priceIncludeVat = 61.09`
  - `weight = 0.13kg`
  - `packageLength/Width/Height = 7.5/9/9`
- 执行 `publishMiaoshouListingProducts`：提交发布成功 1 条。
- AI上架编辑表最终状态：`编辑状态 = 已提交发布`，失败原因为空。

### 2026-06-14：AI上架飞书表精简与旧表删除

- 按当前跑通闭环，将飞书主链路收敛为 4 张表：
  - `输入表`：`tblhkP8dLOTKTWyO`
  - `输出货源表`：`tblhttFU2Uy1Semz`
  - `待人工核实上架表`：`tblrnhl2KDy5QKqG`
  - `AI上架编辑表`：`tblZAcboSuBPVuJ4`
- 已删除飞书冗余/旧链路表：
  - `待上架商品表`：`tblpmRtXfEMlsg0E`
  - `刊登任务表`：`tblr3nobh1dppoVs`
  - `AI上架审核表`：`tblG1E11H3zfA1qY`
  - `采购任务表`：`tblf6LDFlDEl4rLU`
- 代码侧优化：
  - AI上架主流程 `生成/推进编辑表`、`准备保存草稿`、`保存草稿`、`提交发布` 不再调用 `ensureCommerceTables`，不会重新创建旧表。
  - AI上架页面移除旧链路按钮：初始化上架表、同步待上架、生成飞书审核表、生成本地审核表、旧采集导入、旧认领、资料包等。
  - 首页和 AI上架页文案改为：读取表三已审核记录，写入 AI上架编辑表。
- 复核：执行 `generateMiaoshouListingEditTable` 后飞书仍只有 4 张表，没有重新创建旧表。
- 已验证：`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build:app`。

### 2026-06-14：AI上架发布防重与表三字段收口

- 已完成表三字段收口：
  - 飞书 `待人工核实上架表` 当前为 44 个字段。
  - 已删除表三中的妙手过程字段：`妙手公共采集箱ID`、`妙手TikTok采集箱ID`、`妙手处理状态`。
  - 妙手采集、认领、店铺绑定、编辑、发布状态只保存在 `AI上架编辑表`。
- 已完成发布前检查增强：
  - 检查 AI上架编辑表中的店铺 ID、目标店铺站点、TikTok采集箱ID、店铺认领状态、货源价格、展示价格、重量、尺寸。
  - `编辑状态 = 已提交发布` 会返回 `已提交发布，禁止重复发布`。
  - 发布前检查返回统计：扫描数、可发布数、已提交数、失败数。
- 已完成重复发布防护验证：
  - 当前真实记录 `recvmsB6UvEAPg` 状态为 `已提交发布`。
  - 执行发布前检查结果：`readyCount = 0`、`alreadySubmittedCount = 1`，缺失项为 `已提交发布，禁止重复发布`。
  - 再次执行发布脚本结果：`publishedCount = 0`、`skippedCount = 1`、`failedCount = 0`，未重复提交。
- 已复核飞书表结构：
  - 当前飞书只剩 4 张主链路表：`输入表`、`输出货源表`、`待人工核实上架表`、`AI上架编辑表`。
  - 再次执行 AI上架生成/推进后，旧表没有被重新创建。
- 当前真实 AI上架编辑表记录：
  - 商品ID：`1731896561184441521`
  - 目标店铺：`15013562 / 小郭马来`
  - 公共采集箱ID：`3695937112`
  - TikTok采集箱ID：`3079176566`
  - 编辑模式：`shop`
  - 统一货源价格：`4.64`
  - 展示价格/本地展示价：`61.09`
  - 重量：`130g`
  - 尺寸：`7.5 × 9 × 9`
  - 编辑状态：`已提交发布`
- 已验证通过：
  - `npm.cmd run lint`
  - `npm.cmd run typecheck`
  - `npm.cmd run build:app`

### 2026-06-14：当前阶段整理

- 使用 `planning-with-files-zh` 对项目当前阶段做阶段性归档。
- 当前项目已经从早期 Excel MVP 进入“AI比价 + AI上架真实闭环”阶段：
  - AI比价三表已经跑通。
  - AI上架已经从表三 `已审核` 记录跑通到妙手草稿保存和确认发布。
  - 发布防重已验证，`已提交发布` 不会被重复发布。
- 当前飞书主链路锁定为 4 张表：
  - `输入表`
  - `输出货源表`
  - `待人工核实上架表`
  - `AI上架编辑表`
- 已明确表职责：
  - 表一负责入口、郑和/主图/原商品链接解析、去重、状态归因。
  - 表二负责 1688 候选明细、SKU/价格/运费/克重/尺寸、商品组状态。
  - 表三负责唯一推荐上架货源、人工审核、利润/展示价公式字段。
  - AI上架编辑表负责妙手采集、认领、店铺绑定、草稿保存、发布状态。
- 当前关键边界：
  - 表三不再保存妙手过程字段。
  - 妙手主图、详情、SKU图、完整 SKU Map、`ossMd5` 不写入飞书。
  - 保存草稿前重新读取妙手详情，只改 `originPrice`、`priceIncludeVat`、重量、尺寸。
  - 展示价必须大于 0 才允许发布。
  - `已提交发布` 禁止重复发布。
  - 采购继续独立成后续 AI采购 模块。
- 下一阶段建议：
  - 补“发布结果复核”，确认妙手发布任务最终结果、失败原因、TikTok 商品 ID 或妙手任务 ID。
  - 做多国家/多店铺映射，按站点自动选择目标店铺。
  - 单独做“已发布商品维护”入口，用于后续改价、改重量、改尺寸。
  - UI 上增强逐行失败原因展示，方便批量人工处理。

### 2026-06-14：阶段 25 发布复核、多店铺映射、维护入口

- 按用户确认的 `123` 执行当前 AI上架后续阶段，采购模块未改动。
- `AI上架编辑表` 新增轻量字段：
  - `发布复核状态`
  - `发布复核时间`
  - `妙手发布状态`
  - `妙手发布任务ID`
  - `TikTok商品ID`
  - `已发布商品链接`
  - `维护状态`
  - `维护备注`
- 新增 `发布结果复核` 流程：
  - 扫描 `已提交发布` 或已有复核状态的 AI上架编辑表记录。
  - 通过妙手 TikTok 采集箱列表按 `published / timingPublish / notPublished` 查询。
  - 按 `TikTok采集箱ID / 公共采集箱ID / 商品ID` 匹配后写回复核结果。
  - 没有独立发布任务结果接口时，第一版以采集箱状态作为发布复核依据，并在失败原因中说明接口边界。
- 新增 `多站点店铺映射`：
  - 上架配置新增文本配置，格式示例：`MY=15013562|小郭马来`。
  - 在线刷新店铺后，选择站点/店铺会自动写入映射。
  - 生成 AI上架编辑表时按表三 `国家/站点` 匹配店铺；未命中时再回退当前目标店铺。
  - 后续准备保存、保存草稿、提交发布、复核不再强制使用当前页面店铺过滤，默认按每行自己的 `目标店铺ID` 执行。
- 新增 `已发布维护入口`：
  - AI上架页新增第 8 步。
  - 当前只把 `发布复核状态=已发布` 或 `编辑状态=已发布` 的行置为 `维护状态=待维护`。
  - 不自动修改已发布商品；后续维护流程再单独实现安全字段改价、改重量、改尺寸。
- 已验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`

### 2026-06-14：本地可执行动作落地与重复自查

- 按用户要求，以“总结建议 -> 按建议执行 -> 再查遗漏”的方式继续自查 AI上架当前阶段。
- 第一轮建议：软件按钮已接通，但本地可执行动作没有覆盖新加的 `发布结果复核` 和 `已发布维护入口`。
- 已执行：
  - 新增 `scripts/miaoshou-smoke-helpers.ts`，统一读取 Electron 配置、飞书任务、飞书客户端和妙手客户端。
  - 新增 `scripts/smoke-miaoshou-verify-publish.ts`。
  - 新增 `scripts/smoke-miaoshou-prepare-maintenance.ts`。
  - `scripts/smoke-miaoshou-listing-edit.ts` 改为支持多站点店铺映射，不再固定当前目标店铺。
  - `scripts/smoke-miaoshou-save-drafts.ts` 改为默认按 AI上架编辑表每行目标店铺执行。
  - `.codex-run/smoke-miaoshou-publish.ts` 改为默认按行目标店铺执行。
  - `package.json` 新增：
    - `smoke:miaoshou:listing-edit`
    - `smoke:miaoshou:save-drafts`
    - `smoke:miaoshou:verify-publish`
    - `smoke:miaoshou:prepare-maintenance`
- 真实执行发现：
  - 首次 `npm.cmd run smoke:miaoshou:verify-publish` 返回 `failedCount=1`。
  - 读取 AI上架编辑表发现失败原因为 `飞书接口返回错误：URLFieldConvFail（code: 1254068）`。
  - 根因：复核时没有已发布商品链接，系统尝试向飞书 URL 字段写空值，飞书 URL 字段不接受该写法。
  - 修复：`buildFieldsByNamesAllowEmpty` 对 URL 字段空值不再写入，避免空 URL 更新导致整行失败。
- 修复后真实执行结果：
  - `npm.cmd run smoke:miaoshou:verify-publish`：`verifiedCount=1`、`publishedCount=1`、`failedCount=0`。
  - `npm.cmd run smoke:miaoshou:prepare-maintenance`：`preparedCount=1`、`failedCount=0`。
  - AI上架编辑表当前真实记录：
    - 商品ID：`1731896561184441521`
    - 发布复核状态：`已发布`
    - 妙手发布状态：`published`
    - 维护状态：`待维护`
    - 失败原因：空
- 已验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`
- 再次搜索 `verifyMiaoshouPublishResults / preparePublishedListingMaintenance / listingShopMappings / 发布复核 / 维护状态`，确认新动作已覆盖：
  - shared types
  - defaults
  - preload
  - IPC
  - Feishu service
  - renderer UI
  - dev mock
  - smoke scripts
  - planning files

### 2026-06-14：当前可用性收口复查

- 按用户要求继续执行“总结建议 -> 按建议执行 -> 再查遗漏”的循环，采购仍未进入当前阶段。
- 完成本地可执行动作复测：
  - `npm.cmd run smoke:miaoshou:listing-edit`：扫描 1 条，更新 1 条，失败 0。
  - `npm.cmd run smoke:miaoshou:prepare-draft`：已发布记录安全跳过，失败 0。
  - `npm.cmd run smoke:miaoshou:save-drafts`：已发布记录安全跳过，失败 0。
  - `npm.cmd run smoke:miaoshou:check-readiness`：已提交发布记录被拦截，`alreadySubmittedCount=1`，`failedCount=0`。
  - `npm.cmd run smoke:miaoshou:publish`：已提交发布记录跳过，`publishedCount=0`，`skippedCount=1`，未重复提交。
  - `npm.cmd run smoke:miaoshou:verify-publish`：复核 1 条，已发布 1 条，失败 0。
  - `npm.cmd run smoke:miaoshou:prepare-maintenance`：准备维护 1 条，失败 0。
  - `npm.cmd run smoke:price:run-next`：当前无待处理记录，安全跳过。
  - `npm.cmd run smoke:price:rerun-failed`：当前无失败记录，安全跳过。
  - `npm.cmd run export:price-template`：成功导出本地三表模板到 Documents。
- 修正发布前检查统计口径：
  - `已提交发布，禁止重复发布` 仍保留在 `missing` 中。
  - 已提交记录只计入 `alreadySubmittedCount`，不再计入 `failedCount`。
- 收口旧四表链路：
  - `ensureCommerceTables` 默认硬停用，防止内部误调用重新创建 `待上架商品表`、`刊登任务表`、`AI上架审核表`、`采购任务表`。
  - AI上架相关结果类型不再继承旧 `CommerceTablesResult`，运行时返回值也不再带旧四表空壳。
  - UI、preload、IPC 搜索确认旧入口不再暴露；保留的 `exportMiaoshouShopConfig` 是店铺配置导出，不属于旧上架/采购链路。
- 项目卫生：
  - `.codex-run/` 已加入 `.gitignore`，避免调试脚本和临时打包产物污染正式工作区。
- 最终验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`
  - `npm.cmd run verify:price-three-table`

### 2026-06-14：使用说明窗口与界面命名收口

- 按用户要求新增首页 `使用说明` 卡片。
- `使用说明` 不跳转主页面，点击后通过 Electron IPC 打开独立 BrowserWindow，路由为 `/#/guide`，可拖到旁边对照配置。
- 使用说明页内容已覆盖：
  - 版本号：`v0.1.0`
  - 更新日期：`2026-06-14`
  - 当前四张飞书主表：`输入表`、`输出货源表`、`待人工核实上架表`、`AI上架编辑表`
  - AI智能比价流程
  - AI智能上架流程
  - AI比价配置 / AI上架配置必填项
  - 当前安全边界
  - 本地验证命令
- 命名收口：
  - 首页与侧边栏模块名：`AI智能上架`
  - 配置入口与配置页标题：`AI上架配置`
  - 飞书表名继续保持 `AI上架编辑表`，避免破坏现有表结构和脚本。
- 修复说明窗口适配：
  - 使用说明页挂载 `guide-body`，避免继承主应用 `body min-width: 1280px` 后在 900px 独立窗口横向挤压。
  - `home-menu-card` 现在兼容 `<button>`，避免首页说明按钮出现浏览器默认按钮样式。
  - 独立窗口 preload 路径改为优先按当前 main bundle 目录解析，失败再回退 `app.getAppPath()/dist/preload/preload.js`。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`

### 2026-06-14：表三新字段与AI上架配置页收口

- 用户更新表三字段，要求 AI上架编辑读取 表三 本地展示价(折后)(MYR) 作为展示价格。
- 配置页需将 妙手开放平台 移到顶部，移除 默认库存/妙手定价模板名/物流模板名。
- 定价利润配置需映射 表三 汇率(CNY/MYR)、目标利润率、TK费用合计总费率(MYR)，并增加站点汇率配置表和单独保存反馈。
- 表一入口需放宽为 郑和数据链接/主图URL/原商品链接 任一可尝试；新电脑打开登录浏览器时需弹窗提示登录 1688、郑和数据、妙手。
- 已查公开参考汇率，优先使用中行/公开汇率作为默认参考值，具体结算仍以表三公式和人工维护为准。

### 2026-06-14：表三字段改版与真实比价复测

- 已实现表三新字段读取：AI上架编辑优先读取 \\本地展示价(折后)(MYR)\\，并兼容 \\采购总成本（CNY）\\、\\克重（g）\\。
- 已将表三模板字段追加利润字段，并允许既有飞书公式字段 type=20 保留，避免误报字段类型不匹配。
- 已修复表一入口：郑和链接、原商品主图URL、原商品链接任一存在即可尝试；主图URL单独录入时使用飞书记录ID生成临时商品ID；TK链接可解析商品ID和站点。
- 已修复国家字段无效值（如 0）覆盖链接站点的问题；实际修复表一记录 1730732598372566181 的国家为 MY、原商品链接 region=my。
- 真实复测：第一条 SG 记录被入口去重拦截，命中表三既有记录；第二条 MY 记录失败重跑成功，写入输出货源表 3 条候选，表一状态为 已进入比价。
- 当前表三未自动生成是预期：表二候选仍需人工将商品组状态改为 已核实 后，下轮生成表三。

### 2026-06-14：AI上架字段同步与真实保存复测

- 已修复飞书公式字段读取：\\本地展示价(折后)(MYR)\\ 原始结构为 \\{ type: 2, value: [数字] }\\，现在读取数字时递归提取 value/result/formula_result。
- 已调整 AI上架编辑表刷新规则：\\已提交发布/草稿已保存/发布中/保存中\\ 锁定不覆盖；\\需人工处理/失败\\ 可从表三重新刷新统一货源价格、展示价格、重量和尺寸，同时保留采集箱ID与失败原因。
- 真实验证：MY 商品 \\1730732598372566181\\ 的 AI上架编辑表展示价格已从旧值 276.37 刷新为表三 \\本地展示价(折后)(MYR)=35.06\\。
- 继续执行草稿准备成功：preparedCount=1。保存草稿仍失败，原因保持为：妙手未自动匹配类目，可能是目标店铺未开通该类目或 TikTok 类目限制；按既定规则停止并交人工处理。
- 发布前检查：SG 已提交发布被防重拦截但不计失败；MY 因类目未匹配未进入发布。

### 2026-06-14：最终自查与验证

- 自查发现使用说明页仍写旧的 默认库存/物流模板名，已改为 站点汇率、目标利润率、TK费用合计总费率。
- 最终验证通过：npm.cmd run typecheck、npm.cmd run lint、npm.cmd run build:app。
- 当前可用状态：AI比价可处理郑和链接/主图URL/原商品链接任一入口；AI上架配置页已按新字段和新卡片顺序收口；表三配置可同步汇率/目标利润率/TK总费率；AI上架编辑表可从表三折后展示价刷新。
- 当前唯一业务卡点：MY 商品已完成采集、认领和店铺绑定，但妙手未自动匹配类目，按规则保持 需人工处理，不自动发布。

### 2026-06-14：AI上架配置堆叠修复与物流公式模板

- 已修复 AI上架配置页新增卡片后的窗口堆叠问题：配置卡片改为稳定单列排列，避免妙手开放平台、店铺、定价、物流公式模板互相压住。
- 站点汇率配置表已保持紧凑输入，不再占用大块空白；目标站点仍走下拉选择，页面显示对应币种/CNY 汇率。
- 已加入折扣率配置，位置在目标利润率和 TK费用合计总费率之间；保存定价配置时同步写入表三 折扣率。
- 已加入后台物流公式模板配置：按目标站点匹配公式，使用表三 克重（g）计算跨境物流成本(CNY)，保存定价配置或保存模板时都会立即同步表三。
- 已增加飞书公式字段保护：如果 跨境物流成本(CNY) 是飞书公式字段则跳过写入，并优先尝试写普通数字字段 物流费用(CNY)/物流成本(CNY)，避免同步失败。
- 已明确 AI上架执行站点/店铺以 AI上架配置为准，郑和/TK 原链接国家只保留在比价链路做来源参考。
- 默认汇率参考已更新为 2026-06-14 中国银行公开牌价：MYR/CNY=1.6729、SGD/CNY=5.2891、PHP/CNY=0.1108、THB/CNY=0.2068、VND/CNY=0.000257。
- 验证通过：npm.cmd run typecheck、npm.cmd run lint、npm.cmd run build:app。

### 2026-06-15：当地货币物流费与1688销量参考收口

- 按最新讨论收口物流公式：后台物流公式模板费用单位改为当地货币，默认格式为 `MY|MYR|first=10|firstFee=0.15|step=10|stepFee=0.15`。
- 同步表三时，后台只优先写 `跨境物流成本(当地货币)` / `物流费用(当地货币)` / `物流成本(当地货币)`，不再把当地货币物流费回退写入 CNY 字段，避免字段名和币种不一致。
- AI上架配置页“当前站点公式”已支持新格式 `站点|币种|首续重参数`，选择站点后能正确显示对应物流公式。
- 定价与利润卡片文案已改为“回填当地货币物流费”；其他费用说明保留为：平台支持费、物流头程费用、海运核算费用等。
- 使用说明更新为 `v0.1.1 / 2026-06-15`，补充：
  - 1688 销量参考第一版只写表二和风险备注，不改变表三推荐。
  - 物流公式费用单位是当地货币，保存后回填表三当地货币物流字段。
  - 任务执行不会强行弹出登录浏览器；新电脑或登录失效时，先在 AI比价配置点击“打开登录浏览器”，登录 1688、郑和数据、妙手。
- 1688 搜图结果卡片增加销量文本提取，支持 `已售/成交/销量/月销 + 数字/万 + 件/单` 这类 DOM 文本。
- AI比价配置新增销量参考开关、最低销量阈值、销量缺失处理；任务执行配置会写入执行配置表。
- 飞书表二和本地候选表/SKU匹配表新增 `1688销量`、`1688销量文本`、`销量风险备注`；表三风险备注会合并选中候选的销量风险。
- 本地 Excel 三表读取也支持销量字段，保证本地模板和飞书链路一致。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`
  - `npm.cmd run verify:price-three-table`

### 2026-06-15：字段名全角/半角兼容

- 读取真实飞书表三 `tblrnhl2KDy5QKqG` 字段后确认：表三存在 `跨境物流成本（当地货币）`，使用中文全角括号；代码此前候选为 `跨境物流成本(当地货币)`，使用英文半角括号。
- 已将字段匹配统一改到归一化层：
  - 飞书表名/字段名匹配统一使用 `normalize('NFKC')`。
  - 本地 Excel 表头读取、查找、写入也统一使用同样归一化。
  - 可兼容全角/半角括号、全角英文数字、隐藏零宽字符、空格差异。
- 复核结果：程序候选字段 `跨境物流成本(当地货币)` 已可命中飞书实际字段 `跨境物流成本（当地货币）`。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run verify:price-three-table`
  - `npm.cmd run build:app`

### 2026-06-15：剔除跨境物流成本 CNY 模板字段

- 按用户确认，表三只保留当地货币物流成本字段，不再保留 `跨境物流成本(CNY)` 模板字段。
- 已从表三模板字段 `priceReviewHeaders` 中删除 `跨境物流成本(CNY)`。
- 已从飞书数字字段集合中删除 `跨境物流成本(CNY)`，后台不再尝试识别或写入该字段。
- 当前真实表三仍使用 `跨境物流成本（当地货币）`，程序已通过全角/半角兼容正常命中。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run verify:price-three-table`
  - `npm.cmd run build:app`

### 2026-06-15：上下文归纳与边界锁定

- 用户确认：其它 CNY 字段不变，只剔除 `跨境物流成本(CNY)`。
- 已同步规划文件：
  - `task_plan.md` 增加当前优先事项：表三物流只写 `跨境物流成本（当地货币）`；其它 CNY 成本字段保持不变，供利润公式使用。
  - `findings.md` 记录真实表三字段、全角/半角兼容策略、CNY 字段保留边界。
- 后续恢复上下文时应按此边界继续：
  - 不新增 `物流费用（当地货币）` / `物流成本（当地货币）`。
  - 不恢复 `跨境物流成本(CNY)`。
  - 不删除 `采购总成本（CNY）`、`平台处理费/CNY`、`货代费用(CNY)`、`其他费用(CNY)`。

### 2026-06-15：软件直跑闭环与耗时记录

- 已确认飞书输入表领取逻辑支持空状态、`待处理`、`待核实`；本次输入表没有可领取新行，因此比价启动耗时约 3.0s 后返回“无可执行记录”。
- 使用软件 `window.appApi` 直跑已生成表三后的闭环：
  - 表三生成/更新：5.9s，扫描 1 个已核实商品组，生成 1 条。
  - AI上架生成/采集/认领：46.1s，扫描表三已审核 1 条，新增 1 条正确 SG 店铺记录。
  - 正确 SG 记录准备草稿：4.2s。
  - 正确 SG 记录保存妙手草稿：6.6s。
  - 正确 SG 记录发布前检查：2.6s。
  - 正确 SG 记录提交发布：5.7s。
  - 正确 SG 记录发布结果复核：4.2s，复核为 `已发布`。
- 正确发布记录：
  - 商品ID：`1731896561184441521`
  - 表三站点：`SG`
  - 目标店铺：`15013552 / 小郭新加坡`
  - AI上架编辑表记录：`recvmAjKemGjip`
  - 最终状态：`编辑状态=已提交发布`，`发布复核状态=已发布`，`妙手发布状态=published`。
- 发现并修复安全遗漏：
  - 生成上架编辑表时改为表三 `国家/站点` 优先，默认目标站点只作为兜底。
  - `草稿已保存` 不再锁死，允许从表三重新同步价格、重量、尺寸后再次保存；`保存中/发布中/已提交发布` 仍锁定。
  - 准备草稿、保存草稿、发布前检查、提交发布都新增“商品站点与目标店铺站点一致”校验。
  - 发布前检查默认要求 `草稿已保存`，避免“待人工编辑”被误判为可发布。
- 历史错配行已标记：
  - 记录 `recvmAg3Pk4Xj2` 是历史旧数据，商品站点 `SG` 但目标店铺为 `MY / 小郭马来`，已写入失败原因并禁止自动重跑。
- 当前未发布记录：
  - MY 商品 `1730732598372566181` 展示价格仍为 `0`，按规则保持 `需人工处理 / 价格异常`，不自动发布。

### 2026-06-15：重新从表一空状态跑完整闭环

- 本次表一只保留 1 条空状态郑和链接：`https://zhenghedata.com/product/search/detail?id=1730732598372566181&keyword=`。
- 第一次启动比价失败，原因是软件配置为连接现有 Chrome 调试端口 `http://127.0.0.1:9222`，当时 9222 未监听。已通过软件 `打开登录浏览器` 拉起登录浏览器后，将该记录置为 `失败` 并使用“重跑失败”继续。
- 比价重跑成功：
  - Run：`run_mqetzrxx_h5sc00`
  - 耗时：2分22秒
  - AI 请求：10 次；图片计数 136 张；tokens 合计 94063。
  - 表二写入 3 条成功候选，批次号：`cmp_20260615_142945_bs58`。
  - 最新推荐逻辑：3 条候选克重均为 1000g，组内最低采购总成本胜出。
- 为继续闭环测试，按既定人工核实动作将最新批次 3 条候选的 `商品组状态` 标为 `已核实`。
- 表三生成成功：
  - 耗时：8.8s
  - 表三记录：`recvmAJYqTk9Ug`
  - 推荐链接：`https://detail.1688.com/offer/1039482413166.html`
  - 采购总成本：12.22 CNY
  - 克重：1000g
  - 尺寸为空，进入上架后按默认 `10*10*10cm`。
- 同步 MY 定价配置后，表三公式有效：
  - 汇率：1.6729
  - 本地展示价(折后)(MYR)：10.49
  - 状态已置为 `已审核`。
- AI上架生成/采集/认领成功：
  - 上架编辑表记录：`recvmAKXV9qbry`
  - 公共采集箱ID：`3699927108`
  - TikTok采集箱ID：`3082984168`
  - 目标店铺：`15013562 / 小郭马来`
  - 统一货源价格：12.22
  - 本地展示价：10.49
  - 包裹重量：1000g
  - 包裹尺寸：10*10*10cm
- 保存妙手草稿：
  - 第一次保存遇到妙手接口 `502 Bad Gateway 下游服务连接被重置`。
  - 重试保存耗时 67.8s 后失败，最终失败原因变为：`妙手未自动匹配类目，可能是目标店铺未开通该类目或TikTok类目限制；请人工处理该商品`。
- 发布阶段按安全规则停止：
  - 发布前检查返回 `草稿未保存`。
  - 提交发布跳过 1 条，未调用成功发布。
  - 发布复核未发现已发布结果。
- 当前闭环结论：比价、表三、定价同步、采集认领均跑通；上架保存卡在妙手未自动匹配类目，符合“类目未匹配则交人工处理，不自动发布”的既定边界。

### 2026-06-15：白屏修复、郑和抓取修复与软件直跑复测

- 用户反馈软件窗口只显示空白背景。排查后确认旧 Electron 窗口仍加载 `http://127.0.0.1:5173/`，但 Vite 开发服务已停止；这不是业务配置卡片错乱，而是启动目标失效导致 React 未加载。
- 已修复 Electron 启动兜底：
  - `src/main/main.ts` 新增 `loadRenderer`。
  - 开发服务 URL 加载失败时自动回退到 `dist/renderer/index.html`。
  - 重新启动后页面已加载本地构建产物，调试口确认首页、AI比价、AI上架和使用说明均正常渲染，无前端控制台错误。
- 已修复郑和登录态抓取在 Electron 主进程失败的问题：
  - 原因：主进程打包后没有全局 `WebSocket`，导致只填郑和链接/原商品链接时补主图失败。
  - 处理：`src/main/services/zhengheDataService.ts` 改为使用项目已有 `playwright-core` 连接 `http://127.0.0.1:9222`，监听郑和页面 `/product/info/base` 响应。
  - 保留安全校验：返回数据必须匹配商品 ID 和站点，避免 MY 商品被 US 接口返回值污染。
- 软件直跑比价复测：
  - 任务：`task_mqalikk5_8hwz89`
  - Run：`run_mqf86nag_wdldlz`
  - 输入商品：`1730732598372566181 / MY`
  - 比价总耗时：1分35秒。
  - 表二写入：3 条候选。
  - 最新批次：`cmp_20260615_210615_r4xh`
  - AI费用统计：请求 11 次；图片计数 74 张；tokens 合计 69706。
- 软件直跑表三生成：
  - 动作：`确认最新批次并生成表三`
  - 耗时：约 45 秒。
  - 扫描 1 组，成功 1，失败 0。
  - 已同步 MY 站点定价配置。
  - 表三推荐链接：`https://detail.1688.com/offer/919100918198.html`
  - 采购总成本：17.2 CNY
  - 克重：1000g
  - 尺寸：`53×6`，上架编辑表按缺失高度兜底为 10cm。
  - 飞书公式结果：`本地展示价(折后)(MYR)=14.17`。
- 为继续闭环测试，人工审核动作已模拟：将表三记录 `recvmClwMZeKfR` 状态改为 `已审核`。
- 软件直跑 AI上架编辑：
  - 耗时：约 95 秒。
  - AI上架编辑表新增记录：`recvmCmLJuOSWl`
  - 公共采集箱ID：`3701802068`
  - TikTok采集箱ID：`3084798310`
  - 目标店铺：`15013562 / 小郭马来`
  - 统一货源价格：17.2
  - 本地展示价：14.17
  - 包裹重量：1000g
  - 包裹尺寸：`53*6*10cm`
  - 结果：公共采集箱、TikTok采集箱、目标店铺认领均成功；妙手未自动匹配类目，已按规则写入 `编辑状态=需人工处理`、`发布准备状态=类目未自动匹配`。
- 当前结论：
  - 软件可打开，白屏问题已收敛。
  - 比价 → 表二 → 确认最新批次 → 表三 → 上架编辑表 → 妙手采集/认领/店铺选择链路可直跑。
  - 自动发布未继续，因为妙手没有自动匹配类目；这符合用户确认过的安全边界。
  - 后续效率优化重点：降低 50 张候选 AI 相似度成本、减少表三确认耗时、优化妙手采集/认领等待策略。

### 2026-06-16：下一阶段产品收口原则

- 用户确认需要记录：当前越改越复杂，下一步不要继续堆字段和配置入口，优先把正常操作路径收口。
- 下一阶段 UI/流程原则：
  - 主操作入口压成 3 个大按钮：
    1. `开始AI比价`
    2. `确认最新比价并生成表三`
    3. `开始AI上架`
  - 高级配置默认折叠，只在需要改凭证、店铺映射、汇率、利润率、物流公式时展开。
  - 正常使用时不让用户来回跳多个配置页和表格找原因。
  - 失败时在软件里直接展示明确中文原因，并同步写回飞书表。
  - 后续新增能力先判断能否挂到这 3 个主动作下，避免继续增加分散按钮。
- 暂定产品目标：
  - 普通操作只看主流程按钮和结果状态。
  - 飞书仍作为数据中心，但软件侧要提供清晰的一键推进和卡点提示。
  - 采购模块继续独立，暂不混入比价/上架主链路。

### 2026-06-16：planning-with-files 上下文归纳

- 按用户要求使用 `planning-with-files-zh` 归纳当前阶段，避免后续上下文丢失。
- 已读取并恢复：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 已运行 `session-catchup.py`，没有报出未同步上下文。
- 已更新 `task_plan.md`：
  - 当前阶段快照改为 `2026-06-16`。
  - 写入三按钮收口方向。
  - 写入最新真实卡点：MY 商品妙手目标店铺认领成功，但类目未自动匹配。
  - 写入已修复：Electron 白屏兜底、郑和抓取 Playwright CDP。
- 已更新 `findings.md`：
  - 增加 `2026-06-16：当前上下文归纳快照`。
  - 归纳四张表职责、安全边界、最新真实运行结果、已修复稳定性问题、下一阶段产品收口方向。
- 后续恢复上下文时优先读取：
  - `task_plan.md` 的 `当前阶段快照（2026-06-16）`
  - `findings.md` 的 `2026-06-16：当前上下文归纳快照`
  - `progress.md` 最近的 2026-06-16 记录。
### 2026-06-16：AI上架妙手接口启用开关

- 已按“新电脑可能拿不到妙手接口”的边界增加 AI上架安全开关：`启用妙手接口上架`。
- 默认值为关闭，避免用户只配置飞书和比价后误触发妙手采集、认领、草稿保存或发布动作。
- 前端处理：
  - `AI上架配置` 页面新增勾选项，并提示必须先配置妙手开放平台 AppKey、AppSecret、账号ID 和目标店铺。
  - `AI上架` 页面在未启用时展示明确警告，并禁用依赖妙手接口的按钮。
- 后端处理：
  - 主进程 IPC 增加硬拦截，防止绕过前端直接调用妙手接口。
  - 已拦截动作包括：查询店铺、导出店铺配置、生成上架编辑表、保存草稿、发布前检查、提交发布、发布结果复核。
  - 飞书侧的草稿重试准备、已发布维护准备仍可作为本地/飞书状态整理动作保留。
- 验证范围：
  - `npm.cmd run typecheck`
  - `npm.cmd run build:electron`
  - `npm.cmd run build:app`

### 2026-06-17：妙手 DOM 编辑/保存并发布执行器接入

- 已按用户确认的新链路接入第一版 DOM 执行器：
  - 妙手 OpenAPI 继续负责：原商品链接采集到公共采集箱、认领到 TikTok 采集箱、认领目标店铺。
  - 后续编辑/发布改为浏览器模拟：打开 `https://erp.91miaoshou.com/tiktok/collect_box/items`，按货源ID搜索，进入编辑弹窗，批量改重量、货源价格、本地展示价，引用定价模板后固定点击“保存并发布”。
  - 结果写入独立 `AI上架结果表`，不写入表三，不把图片、详情、SKU结构、ossMd5 等大字段写进飞书。
- 新增配置能力：
  - `miaoshouPricingTemplatesJson`：缓存从已登录妙手页面/网络响应抓到的定价模板。
  - `miaoshouPricingTemplateMappings`：站点到模板映射，格式 `MY=模板ID|模板名`。
  - AI上架配置新增“妙手定价模板”卡片，支持刷新模板、按当前站点选择模板并保存映射。
- 新增主进程能力：
  - `commerce:refreshMiaoshouPricingTemplates`：通过登录浏览器刷新模板并写入配置缓存。
  - `commerce:publishMiaoshouListingProductsByBrowser`：读取 AI上架编辑表可执行记录，执行 DOM 保存并发布，并追加写 `AI上架结果表`。
- 新增服务文件：`src/main/services/miaoshouBrowserListingService.ts`。
- 当前 DOM 执行候选要求：
  - 采集状态 = 已采集公共采集箱。
  - 认领状态 = 已认领TikTok采集箱。
  - 店铺认领状态 = 已认领目标店铺。
  - 未处于已提交发布。
  - 存在 TikTok采集箱ID、目标店铺ID、货源ID/1688链接、统一货源价格、本地展示价、克重。
- 当前遗漏/待真实页面验证：
  - 妙手“引用模板”弹窗的实际按钮/下拉 DOM 可能因账号、站点、页面版本不同变化；当前实现优先通过文本和通用 `.jx-*` 选择器匹配。
  - 类目自动匹配仍是上游卡点；DOM 执行器不会绕过类目限制，真实保存并发布时如果妙手页面拦截，会写失败截图路径。
  - 第一版不删除/重排 SKU，不改图片/详情/类目/属性，只做批量重量、货源价、本地展示价和保存并发布。
- 已验证：`npm.cmd run typecheck` 通过，`npm.cmd run build:app` 通过。
### 2026-06-17：按软件入口复测 AI比价到 AI上架可达闭环

- 已重新启动软件并接入真实 Electron 页面调试。发现当前已安装目录 `C:\Program Files\TikTok AI Flow` 里的 preload 桥接仍是旧版，页面已经显示“浏览器模拟保存并发布”，但安装版 `window.appApi` 未暴露 `publishMiaoshouListingProductsByBrowser` / `refreshMiaoshouPricingTemplates`。
- 为了继续测试最新软件逻辑，已使用当前源码执行 `npm.cmd run build:app` 后启动本地最新版 Electron 页面，仍复用同一份配置、同一套飞书表和同一登录浏览器。
- 登录浏览器检查：
  - 初始 `http://127.0.0.1:9222` 未监听。
  - 通过软件 `openLoginBrowser` 拉起项目 Chrome 后，9222 正常返回 Chrome DevTools 信息。
- AI比价阶段：
  - 任务：`task_mqalikk5_8hwz89 / feishu-tblhkP8dLOTKTWyO`
  - Run：`run_mqhjrn0i_p2fj5k`
  - 领取记录：`1730732598372566181 / VN`
  - 输入链接：`https://shop.tiktok.com/view/product/1730732598372566181?source=agency&region=vn`
  - 结果：成功。
  - 耗时：约 110.5 秒（12:04:38 到 12:06:28）。
  - 搜图结果：50 个候选，44/50 相似度达标，快速模式下钻 3 个详情页。
- 表三生成阶段：
  - 使用软件同一入口 `confirmLatestPriceBatchAndGenerateReviewTable`。
  - 最新批次：`cmp_20260617_120616_tloo`
  - 已核实表二候选：3 条。
  - 生成表三：1 条成功，0 条失败。
  - 耗时：约 9.2 秒。
  - 表三最新记录：`recvmLPUgCAg9q`
  - 推荐链接：`https://detail.1688.com/offer/1045351887135.html`
  - 采购总成本：`6`
  - 克重：`400`
  - 状态：`待核实`
- AI上架阶段：
  - 使用软件同一入口 `generateMiaoshouListingEditTable`。
  - 当前配置目标站点/店铺：`VN / 16281849 / 内衣店--越南`
  - 因表三状态仍为 `待核实`，上架入口扫描 `已审核` 记录为 0，未生成 AI上架编辑表记录。
  - AI上架编辑表 `tblZAcboSuBPVuJ4` 当前记录数为 0。
  - 妙手店铺查询正常，VN 返回 5 个授权店铺，首个为 `16281849 / 内衣店--越南 / normal`。
  - 浏览器模拟保存并发布入口安全执行：扫描 0 条，执行 0 条，失败 0 条，未发布任何商品。
- 本轮明确卡点：
  1. 安装版落后于源码构建，安装目录 preload 缺少最新 DOM 发布桥接接口。
  2. 表三生成后状态为 `待核实`，AI上架只读 `已审核`，所以完整上架链路在人工审核节点停止。
  3. 浏览器模拟发布入口当前按整个 AI上架编辑表扫描候选，后续应加“只执行当前批次/当前商品/最新生成记录”的保护，避免误执行历史待发布记录。
- 验证命令通过：
  - `npm.cmd run build:app`
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`

### 2026-06-17 14:49:34：修复郑和源图错配、表二重复批次和 AI上架入口

- 已确认当前错误不是 1688 匹配偏差：任务缓存源图就是手机支架图，表一保存的主图 URL 也是手机支架图。
- 已修复飞书/本地 Excel 输入补全：郑和 productId 与旧字段冲突时判定旧字段残留，清空旧图并以郑和商品ID重建原商品链接；无冲突时不覆盖用户已有主图。
- 已修复表二重复批次：同一输入表记录重跑前删除旧表二候选；同一输入表记录对应的旧表二/表三不再作为重复拦截。
- 已调整任务执行边界：AI比价执行只写表二，不再自动生成表三。
- 已调整 AI上架页：开始上架会显式确认最新表三并采集认领；新增采集认领失败重试和浏览器发布失败重试入口；上架卡片网格改为自适应避免堆叠。
- 验证通过：
pm.cmd run typecheck、
pm.cmd run lint、
pm.cmd run build:app。

### 2026-06-17 18:56：郑和错图修复后真实闭环复测

- 已清理飞书当前测试商品的旧污染数据：
  - 表一 `recvmAHc7EnGek` 重置为 `1730732598372566181 / MY / 待处理`。
  - 原商品链接修正为 `https://shop.tiktok.com/view/product/1730732598372566181?source=agency&region=my`。
  - 主图修正为郑和登录态可信返回的睡衣主图 `7d68f10459623749b3cc7a55dbd03a64.jpeg`。
  - 删除旧 VN/手机支架表二 6 行，删除旧表三 1 行。
- 已验证郑和登录态解析：
  - 同一郑和链接无 region 时，登录态返回 `region=my`、可信主图和睡衣标题。
  - 修复点：不再用 AI上架目标站点或表里旧 TikTok 链接 region 反向污染郑和解析。
  - 修复点：郑和返回可信时覆盖旧站点、原商品链接和主图；不可信时拒绝使用返回主图。
- 已真实跑通 AI比价：
  - 新批次：`cmp_20260617_185602_tbtw`。
  - 表二只生成 2 条候选，没有再出现 2 批 6 行重复。
  - 候选为服饰相关链接：`916415447379 / 301裙-黑色`、`901176496289 / 108#黑色`，不再是手机支架。
  - 表一状态已进入比价，源站点保持 MY。
- 已真实跑通 AI上架前半段：
  - `开始AI上架` 对应逻辑已改为：确认最新表二并生成表三 -> 表三自动标记已审核 -> 采集公共采集箱 -> 认领 TikTok 采集箱 -> 认领目标店铺 -> 写 AI上架编辑表。
  - 表三生成 1 条、确认 1 条。
  - AI上架编辑表新增/推进 1 条：公共采集箱ID `3709029573`，TikTok采集箱ID `3091695098`，目标店铺 `16281866 / 内衣店--马来`。
- 当前停止点：
  - 表三 `本地展示价(折后)(MYR)` 为空，AI上架编辑表 `本地展示价/展示价格` 也为空。
  - 浏览器模拟发布预检已按规则停止，未打开妙手执行发布；AI上架编辑表写回 `编辑状态=需人工处理`、`发布准备状态=资料缺失`、`失败原因=本地展示价必须大于0`。
  - 下一步需要补表三展示价公式或在表三写入有效 `本地展示价(折后)(MYR)` 后，再点“失败重试保存并发布”。
- 额外修复：
  - `scripts/smoke-run-price-from-pending.ts` 改为原子写配置文件，避免长任务超时/并发写入时把 `config.json` 追加成坏 JSON。
  - 郑和 CDP 登录浏览器连接用完会关闭连接，避免脚本挂住。
  - 浏览器发布扫描现在会把缺展示价/缺重量/缺货源价等预检失败写回 AI上架编辑表，不再静默跳过。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`

### 2026-06-17 19:07：展示价卡点处理

- 已确认表三展示价为空的直接原因：
  - `确认最新批次并生成表三` 和 AI上架自动生成表三之前没有同步定价/物流配置。
  - 已修复：这两个入口生成表三后都会执行 `syncListingPricingForConfiguredSites`，把汇率、目标利润率、折扣率、TK费用合计总费率和当地货币物流成本同步到表三。
- 已确认当前表三写入了：
  - `汇率(CNY/MYR)=1.6729`
  - `目标利润率=0.05`
  - `折扣率=0.3`
  - `TK费用合计总费率(MYR)=0.14`
  - `跨境物流成本(当地货币)=0`
  - 但表三公式字段 `本地展示价(原价)(MYR)`、`本地展示价(折后)(MYR)` 仍为空，说明飞书公式本身还需要调整或字段依赖不完整。
- 已按“妙手定价模板优先”的方向修正浏览器发布：
  - 如果当前站点配置了妙手定价模板，浏览器发布允许表三/编辑表展示价为空，执行器会先改重量和货源价，再在妙手弹窗里引用定价模板生成展示价。
  - 如果没有妙手定价模板，也没有展示价，仍然停止并写回 `本地展示价必须大于0`。
- 当前配置状态：
  - `miaoshouPricingTemplatesJson=[]`
  - `miaoshouPricingTemplateMappings=` 为空
  - 因此当前仍不能进入浏览器发布，需要先在 AI上架配置里“刷新模板”，并为 MY 站点选择/保存一个定价模板，或在表三/AI上架编辑表写入有效本地展示价。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`

### 2026-06-17 19:20：展示价逻辑归纳更新

- 用户确认：当前不再把表三 `本地展示价(折后)(MYR)` 作为妙手上架的必填来源。
- 最新定价链路改为：
  - 表三/AI上架编辑表提供 `采购总成本/统一货源价格` 和 `克重`。
  - 浏览器模拟进入妙手 TikTok 采集箱编辑页后，批量写货源价格和 SKU 克重。
  - 本地展示价通过妙手页面里的“引用定价模板”生成。
  - 保存并发布固定走妙手页面最终逻辑。
- 代码后续需要同步的校验口径：
  - 已配置目标站点妙手定价模板时，允许表三/AI上架编辑表本地展示价为空。
  - 未配置妙手定价模板时，才要求 `本地展示价/展示价格 > 0`。
  - 缺模板且缺有效展示价时，失败原因应写：`未配置妙手定价模板，且本地展示价为空或无效`。
- 已更新 `task_plan.md` 与 `findings.md`，明确旧的“展示价必须大于0”规则只作为无模板兜底路径。

### 2026-06-18 13:52:18：1688插件增强筛选与表三兜底规则

- 已在 AI比价配置任务策略中新增：启用真实工厂认证筛选、启用实力认证筛选、启用年销量筛选/最低年销量、启用月代销筛选/最低月代销。
- 旧的 1688销量参考已收口为：启用1688已售数量兜底（未使用插件时）；插件增强数据可用时优先年销量，再月代销，只有未拿到插件数据时才使用已售数量兜底。
- 表二/本地候选结果新增字段：年销量、月代销；保留 1688销量、1688销量文本、销量风险备注作为兜底和复核。
- 1688结果页解析已支持插件注入块 .plugin-offer-search-card.offer-item-extra，解析 年销量、月代销、插件增强文本；认证筛选按钮找不到时不阻塞，候选不足时自动放宽并写风险备注。
- 表三推荐规则已更新：人工指定优先 -> 克重多数决策 -> 若无克重多数（三档/并列），按采购总成本最低进入表三，并在选择依据写明待人工核重。飞书和本地 Excel 逻辑一致。
- 验证通过：npm.cmd run typecheck；npm.cmd run lint；npm.cmd run build:app。

### 2026-06-18 14:07:15：AI比价配置页布局收口

- 已修复任务策略卡片新增选项后与飞书多维表格卡片堆叠的问题。
- AI比价配置页改为左右两列独立堆叠：左列为任务策略、飞书多维表格、Chrome 与 1688；右列为路径、本地 Excel、持续执行、AI 相似度识别、输出与核实规则。
- 输出与核实规则已放到右侧 AI 相似度识别下方。
- 后续任务策略继续新增字段时，会自然撑开左列并让下方卡片顺延，不再依赖 nth-of-type 固定行号。
- 验证通过：npm.cmd run typecheck；npm.cmd run lint；npm.cmd run build:app；并用本地预览截图检查无重叠。

### 2026-06-18 14:25：真实闭环复测通过

- 通过软件入口触发任务 `task_mqalikk5_8hwz89`，run 为 `run_mqj44id2_z58cwc`。
- 输入行商品：`1730732598372566181`，源链接 `https://shop.tiktok.com/view/product/1730732598372566181?source=agency&region=my`，郑和主图为睡衣图，未复现手机支架旧图污染。
- 1688 搜图：50 个候选，列表相似度达标 21/50，快速模式下钻 3 条；已尝试启用实力认证筛选。
- 表二写入：3 条候选，批次号 `cmp_20260618_142343_6a1s`。
- 表三生成：成功 1 条、失败 0 条；推荐链接 `https://detail.1688.com/offer/734466055882.html`，采购总成本 `31.5`，克重 `200g`，尺寸 `25×30×0.50cm`。
- 表三选择依据：克重无多数决策，按采购总成本最低进入表三，待人工核重。
- 自动妙手上架：表三确认 1 条，采集认领推进 1 条，采集认领失败 0 条，浏览器保存并发布 1 条，浏览器失败 0 条。
- 总耗时：3分24秒。AI 请求 9 次，图片 71 张，tokens 合计 71414。
- 当前实际飞书主表：输入表、输出货源表、待人工核实上架表、AI上架编辑表、AI上架结果表，共 5 张。
- 待优化记录：
  - UI 点击“执行”后应立即刷新到 running 状态并展示新 run，避免用户误以为未触发。
  - 表三状态为 `已审核` 但选择依据含“待人工核重”，后续可增加更醒目的风险提示。
  - 表二 `相似度` 字段为空但风险备注里有相似度，后续应把列表相似度/SKU相似度拆成结构化字段，方便筛选。
  - 飞书结果表历史记录多时读取较慢，后续查询应按批次号/商品ID过滤，避免全表扫描。
### 2026-06-18 16:48：妙手尺码表绕过验证结论

- 使用当前已登录浏览器和妙手 OpenAPI 对商品 `1730732598372566181` / TikTok采集箱ID `3094501516` / 店铺 `16281849` 做了尺码表绕过验证。
- 页面路径：关闭叠加的“批量修改本地展示价”弹窗后，直接点击妙手编辑弹窗 `保存并发布`，页面未提交成功，仍显示 `尺码图必传`，编辑弹窗未关闭。
- OpenAPI 元数据路径：`get_category_metadata(site=VN,cid=846088,shopIds=[16281849])` 返回 `sizeChartIsRequired=1`，该类目尺码表为必填。
- OpenAPI 保存路径：`save_shop_collect_item_info` 不传 `sizeChart/sizeChartType` 时，先遇到图片数量超过15张校验；将 `imgUrls` 截断到15张后继续保存，后端明确返回 `请上传尺码图`。
- OpenAPI 发布路径：单独调用 `save_move_collect_task(detailIds=[3094501516], shopIds=[16281849])` 返回 `success`，但25秒后复核采集箱状态仍在 `notPublished`，`published/timingPublish` 未找到，因此不能把这个返回当作真实发布成功。
- 当前结论：保存编辑资料和页面发布都不能可靠绕过尺码表；最终发布必须以保存校验和后续状态复核为准。后续应支持“配置尺码模板”或“默认尺码图URL/文件上传”作为解决方案。

### 2026-06-18 17:20：尺码表网络图片配置与 DOM 自动填写

- 已按用户确认改为“不绕过尺码表”，在 AI上架配置页新增 `尺码表网络图片URL`。
- 已通过当前登录妙手页面确认 DOM：
  - 尺码表区域 `.size-chart-box`
  - 上传入口 `.shopee-icon-shangchuantupian`
  - 下拉项 `.picture-selector-item` 文本 `使用网络图片`
  - 网络图片弹窗 `textarea[placeholder="请输入图片链接"]` + `确定`
- 浏览器模拟发布执行器已增加两层兜底：
  - 保存并发布前如果页面已有 `尺码图必传`，先使用配置 URL 填尺码图。
  - 点击保存并发布后如果妙手返回 `尺码图必传/请上传尺码图`，自动补尺码图并重试一次保存并发布。
- 如果未配置 URL，失败原因会明确提示：请在 AI上架配置填写尺码表网络图片URL，或人工上传尺码图/配置尺码模板。
- 如果配置 URL 但妙手仍不通过，会提示检查图片是否为公网可访问 JPG/JPEG/PNG 且小于 5M。
- 验证通过：
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build:app`

### 2026-06-18 20:22：清表后单条郑和链接完整闭环复测通过

- 按用户要求清理飞书数据：表一重建为 1 条只含郑和数据链接的待处理记录，删除旧表一记录 1 条；清空表二 3 条、表三 1 条、AI上架编辑表 1 条、AI上架结果表 2 条。
- 本次保留郑和链接：`https://zhenghedata.com/product/search/detail?id=1730732598372566181&keyword=`。
- 真实比价运行：`npm.cmd run smoke:price:run-next`。
  - 表二写入 3 条候选，批次号 `cmp_20260618_201422_gely`。
  - 表三自动生成 1 条，推荐 1688 链接 `https://detail.1688.com/offer/901176496289.html`，采购总成本 `18.3`，克重 `1000g`，尺寸缺失按默认 `10*10*10cm` 进入上架。
  - 妙手 OpenAPI 采集/认领/店铺认领成功：公共采集箱ID `3712874430`，TikTok采集箱ID `3095453359`，目标店铺 `16281849 / 内衣店--越南`。
- 首次自动发布阶段仍触发 Playwright JS dialog race：`Protocol error (Page.handleJavaScriptDialog): No dialog is showing`。已修复为浏览器上下文级安全 dialog handler，对所有已存在页面和后续新页面挂载，并避免重复挂载/移除监听器。
- 同步修复尺码图兜底：发布错误识别增加 `必传/请上传`；尺码表为空时新增点击 `.product-picture-item-add` / `.size-chart-picture-item-add` 的上传入口，支持用 AI上架配置中的尺码表网络图片 URL 填入。
- 重试浏览器发布：`node .codex-run/dist/smoke-miaoshou-browser-publish.mjs` 返回 `executedCount=1, failedCount=0`。
- 发布复核：第一次 35 秒内为 pending；等待 35 秒后第二次复核 `publishedCount=1, pendingCount=0, failedCount=0`。
- 当前 AI上架编辑表状态：`编辑状态=已提交发布`、`发布复核状态=已发布`、`妙手发布状态=published`、`维护状态=可维护`。
- 当前主链路表数量：表一 1、表二 3、表三 1、AI上架编辑表 1、AI上架结果表 1。
- 验证通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build:app`。
- 遗留观察点：表三/上架编辑表的源站点仍显示 MY，而目标店铺按配置走 VN；这是当前“采集源站点只作参考，上架目标以配置为准”的既定规则，但后续 UI 可增加醒目提示，避免误以为站点错配。

### 2026-06-18 20:47：再次清表后完整闭环复测通过

- 按用户要求再次执行完整闭环前置清理：表一用原郑和链接重建 1 条 `待处理` 记录，删除旧表一记录 2 条；清空表二 3 条、表三 1 条、AI上架编辑表 1 条、AI上架结果表 1 条。
- 保留郑和链接：`https://zhenghedata.com/product/search/detail?id=1730732598372566181&keyword=`。
- 执行命令：`npm.cmd run smoke:price:run-next`。
- 运行结果：成功 1/1，runId `run_smoke_mqjhkdfe_dymfti`，总耗时约 `4分5秒`。
- 1688 搜图：解析 50 个候选，列表 AI 相似度达标 16/50，快速模式下钻 3 个详情页。
- 详情页结果：2 个候选因价格栏未在 10 秒内显示完整商品金额+运费被跳过；1 个候选成功进入表二。
- 表二：写入 1 条候选，批次号 `cmp_20260618_204020_e5yo`，推荐链接 `https://detail.1688.com/offer/648606056903.html`，offerId `648606056903`，采购总成本 `67`，克重 `336g`，尺寸 `35×25×1cm`。
- 表三：生成 1 条并自动审核，状态 `已审核`，选择依据为单个有效候选的克重决策。
- 妙手自动上架：公共采集箱ID `3712919358`，TikTok采集箱ID `3095500133`，目标店铺 `16281849 / 内衣店--越南`，浏览器保存并发布执行 1 条，失败 0 条。
- 发布复核：`publishedCount=1`、`pendingCount=0`、`failedCount=0`。AI上架编辑表最终为 `发布复核状态=已发布`、`妙手发布状态=published`、`维护状态=可维护`。
- 当前主链路表数量：表一 1、表二 1、表三 1、AI上架编辑表 1、AI上架结果表 1。
- 本轮可优化点：候选下钻 3 条但只有 1 条成功，原因是 1688 详情页计价区没有在 10 秒内完整显示运费。后续可考虑对详情页计价等待做一次轻量重试，或当候选成功数低于配置目标时继续下钻下一批候选，避免表二只剩 1 条时仍直接推荐。

### 2026-06-18 21:xx：1688 候选不足继续下钻优化

- 已按最新复测问题修复 1688 详情候选成功数不足：列表相似度筛选现在返回全部达标候选并排序，详情页验证按配置目标数量分批下钻；如果首批详情页失败导致有效候选不足，会继续下钻下一批候选，直到拿够配置数量或达标候选耗尽。
- 已给 1688 详情页计价栏增加轻量重试：先等待 10 秒，未拿到商品金额+运费时等待 networkidle 并追加 15 秒，总等待上限约 25 秒，避免 10 秒内运费延迟导致候选过早失败。
- 验证通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build:app`。
- 待用户提供新的测试链接后，继续执行单条完整闭环复测。

### 2026-06-19 01:36：图片主图输入到妙手发布闭环复测通过

- 本次输入：表一仅保留原商品主图 URL `https://cbu01.alicdn.com/img/ibank/O1CN01DYFAUj1azFfMdTcEd_!!2214110243400-0-cib.jpg`，无郑和链接、无原商品链接。
- 比价阶段已完成：图片输入按 AI上架配置目标站点兜底为 VN；表二生成 3 条候选；表三推荐 1688 offerId `949756409338`，采购总成本 `44`，克重 `250g`，尺寸 `2*1*10cm`。
- 妙手采集/认领已完成：公共采集箱ID `3713249382`，TikTok采集箱ID `3095889735`，目标店铺 `16281849 / 内衣店--越南`。
- 浏览器模拟发布修复点：
  - 妙手定价模板下拉可见但点击不稳定，已增加普通点击、坐标点击、DOM 事件点击三层兜底。
  - 最终“保存并发布”按钮被 footer/overlay 拦截，已让通用按钮点击复用 overlay 兜底。
  - 包裹尺寸虽然 DOM value 有值但妙手表单仍报空，已改为 Playwright 真实输入长/宽/高并 blur，同步前端表单状态。
  - 一键翻译误点“批量翻译/处理图片”，已限定到底部 `J_editDialogTranslate`，并按站点选择语言：VN -> 越南语；TH -> 泰语；MY -> 马来语/英语兜底；SG/PH -> 英语。
  - 翻译前勾选“规格名称不翻译”，同时保存前自动截断超过 50 字符的规格选项，避免 SKU 规格翻译后超长。
  - 妙手保存并发布后还会弹“发布产品/选择发布店铺/发布配置”最终确认弹窗，已新增持续等待并点击“确认发布”。
  - 发布复核原本只用虚拟商品ID `img_*` 搜索，图片输入会查不到；已把复核关键词补充为 `采集源货源ID/offerId/TikTok采集箱ID/公共采集箱ID`。
- 验证结果：
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run lint` 通过。
  - `npm.cmd run build:app` 通过。
  - `smoke-miaoshou-browser-publish` 最终返回 `executedCount=1, failedCount=0`。
  - `smoke:miaoshou:verify-publish` 最终返回 `publishedCount=2, pendingCount=0, notFoundCount=0, failedCount=0`。
  - AI上架编辑表中新图片记录 `recvmUGDQ0U6cz` 已更新为：`编辑状态=已提交发布`、`发布准备状态=已提交发布`、`发布复核状态=已发布`、`妙手发布状态=published`、`维护状态=可维护`、`失败原因为空`。
- 遗留优化点：
  - 当前一键翻译站点语言为代码内置映射，后续可放到 AI上架配置页让用户按站点维护。
  - 图片输入的商品ID仍是 `img_<recordId>` 虚拟 ID，后续可在表三/上架编辑表展示“采集源货源ID”作为主识别字段，减少排查困惑。
  - 发布复核依赖妙手采集箱列表状态，虽然本次最终已 published，但建议继续保留“发布中待复核”语义，处理妙手异步延迟。

## 2026-06-19 09:33 E2E rerun passed
- Relaunched project Chrome CDP on port 9222 and reran failed Feishu input record recvmWbOA59SOC.
- Price comparison passed: table 2 wrote 3 candidates, batch cmp_20260619_091906_dt7o; table 3 wrote 1 approved recommendation, 1688 offerId 672007166484.
- Miaoshou collect and claim passed: common collect box 3713502868, TikTok collect box 3096117256, target shop 16281849 / VN shop.
- Browser publish actually showed Miaoshou success dialog, but the executor missed .jx-dialog success messages. Fixed waitForPublishOutcome to detect product publish success dialogs before clicking follow-up confirmation buttons.
- Corrected the current listing row to submitted, then reran publish verification: verifiedCount=3, publishedCount=3, failedCount=0.
- Verification passed: npm run typecheck and npm run lint.

## 2026-06-24 版本 v0.1.1：自动上架批量续跑与类目树说明

- 新增 `自动上架每轮处理数量` 配置，默认 1，最大 20；自动妙手上架采集认领和浏览器保存发布都按该数量推进。
- 浏览器模拟发布按行兜底：单条 DOM/发布异常会写入失败原因和结果表，不中断同轮后续记录。
- 输入表待领取状态按最新要求收口为：空状态、待处理；待输入、待核实不再作为输入表执行入口。
- 使用说明升级到 `v0.1.3 / 2026-06-24`，新增妙手官方类目树字段枚举：`cid`、`aid`、`fid`、`name`、`nameChinese`、`isLastLevel`、`disabled`、`children`。
- 验证：`npm.cmd run typecheck` 通过。

## 2026-06-24 版本 v0.1.2：上架配置排版与输入表状态收口

- AI上架配置页改为和 AI比价配置一致的左右列卡片布局：左列为妙手开放平台、采集与刊登路径、AI上架结果表；右列为店铺与站点、妙手定价模板。
- `自动上架每轮处理数量` 说明补充最大值：默认 1，最大 20。
- 飞书输入表执行入口收口为：空状态、待处理；待输入、待核实均不再作为输入表自动领取状态。
- 使用说明升级到 `v0.1.4 / 2026-06-24`。

## 2026-06-24 类目映射与尺码表后续方案记录

- 后续输入表新增/使用 `目标站点类目` 字段：优先填中文类目路径，用于匹配妙手 TikTok 类目树接口返回的中文字段并定位 `cid`。
- 郑和链接输入时，优先使用郑和返回的中文类目路径；1688 链接或主图 URL 输入时，如果没有郑和类目，需要人工在输入表填写 `目标站点类目`。
- 妙手类目匹配字段优先级：先匹配 `nameChinese`，必要时兼容 `name`；匹配时建议对全角/半角符号、空格、大小写、路径分隔符进行归一化。
- 匹配结果必须校验：命中 `cid` 后必须是末级类目 `isLastLevel=true/1`，且 `disabled=false`；不满足则不自动写入，转人工处理。
- 多个候选命中时，按用户确认规则：以输入表 `目标站点类目` / 郑和中文类目路径为准，优先选择路径最接近的一条；若仍无法唯一确定，再使用自动匹配作为兜底或转人工。
- 自动匹配仅作为兜底，不直接覆盖已有妙手自动匹配出的可用 `cid`；优先顺序保持：妙手已匹配 cid -> 输入表中文类目映射 -> 自动模糊匹配 -> 人工处理。
- 尺码表继续通过 API/浏览器兜底写入，但图片 URL 必须来自 AI上架配置面板，不允许写死在代码中。
- 尺码表 API 写入方案：读取最新店铺模式详情和 `ossMd5`，根据 `get_category_metadata` 判断是否必填；必填时写入 `sizeChartType=image` 与配置里的尺码表公网图片 URL，再保存完整 payload。
- 待实施前需确认：妙手类目树中文字段真实返回是否稳定、不同站点中文类目是否一致、同义词/上级类目路径如何处理、尺码图 URL 是否公网可访问且为 JPG/JPEG/PNG。
- 用户已确认上述 4 点按建议执行：`目标站点类目` 尽量使用完整中文路径；妙手类目优先匹配 `nameChinese`；多命中时按路径相似度、末级、未禁用收口；尺码表 URL 放配置面板。
- 站点切换风险已记录：`cid` 不能跨站点复用，类目映射必须至少按 `目标站点 + 目标店铺ID + 目标站点类目` 维度查找；切换 MY/SG/PH/VN/TH 时必须重新调用对应站点的 `get_category_tree_by_site` 和 `get_category_metadata` 校验。
- 必填属性、品牌、认证、责任人等发布要求先只记录，不作为本轮实现内容；后续如果发布反馈这些字段缺失，再按妙手 `get_category_metadata` 返回内容单独补规则。
- 类目缓存需要在 AI上架配置中提供刷新按钮：妙手类目树可能变化，不能永久复用旧缓存；切换目标站点时若本地无该站点缓存，运行时允许自动刷新一次。
- 类目匹配失败必须写清楚归因：`目标站点类目为空`、`未命中目标站点类目`、`命中多个类目`、`命中类目不是末级`、`命中类目已禁用`、`目标店铺未开通该类目`、`类目元数据读取失败`、`尺码表必填但未配置URL`、`尺码表URL格式不支持`。

## 2026-06-24 版本 v0.1.3：目标站点类目匹配与尺码表 API 写入

- 输入表、输出货源表、待人工核实上架表新增/流转 `目标站点类目` 字段；郑和链接会优先用郑和中文类目补该字段，1688 链接/主图 URL 场景可人工填写。
- AI上架配置新增 `刷新类目` 按钮：调用妙手 `get_category_tree_by_site`，按站点缓存扁平化类目树，并在页面显示当前站点缓存数量。
- 上架编辑表新增类目诊断字段：`目标站点类目`、`目标类目ID`、`妙手类目路径`、`类目匹配状态`、`类目失败原因`、`尺码表状态`；AI上架结果表同步写入最小类目状态字段。
- 自动上架采集/认领后，如果妙手没有自动生成 `cid`，会用 `目标站点类目` 优先匹配妙手类目树 `nameChinese/pathChinese`，再兜底 `name/path`；命中后必须是末级且未禁用，否则写失败归因并转人工。
- 保存前调用 `get_category_metadata`：如果目标类目要求尺码表，会从 AI上架配置读取 `尺码表网络图片URL`，写入 `sizeChartType=image` 和 `sizeChart` 后通过 `save_shop_collect_item_info` 保存完整 payload；未配置或格式不支持会直接写明失败原因。
- 验证结果：
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run lint` 通过。
  - `npm.cmd run build:app` 通过。
  - 妙手 VN 类目树实测返回 2596 个节点，中文字段 2596 个，可用末级类目 667 个。
  - 类目匹配实测：`家居用品 > 家居收纳 > 衣架和衣夹` 唯一命中 `cid=600748`；只填 `女士内衣` 命中非末级类目，按规则会转人工或要求填写更完整路径。
- 待继续验证：在真实飞书输入表中填写 `目标站点类目` 后跑完整闭环，确认表三 -> AI上架编辑表 -> 妙手保存发布全链路能回写类目匹配状态。

## 2026-06-24 版本 v0.1.4：类目元数据预检与目标店铺站点收口

- 真实测试使用表三记录 `1730732598372566181`，目标店铺 `16281849 / 内衣店--越南`，目标站点 `VN`，目标站点类目 `女装与女士内衣 > 女士睡衣和家居服 > 女士睡裙`。
- 妙手 VN 类目树刷新验证通过：返回 2596 个节点，中文字段 2596 个，可用末级类目 667 个；上述中文路径唯一命中 `cid=846088`。
- 表三 `目标站点类目` 已能流转到 AI上架编辑表；采集公共采集箱、认领 TikTok 采集箱、认领目标店铺均已通过，当前记录写回公共采集箱 ID `3729571261`、TikTok 采集箱 ID `3112077304`。
- 妙手 `get_category_metadata` 已验证能返回 `categoryProductAttrList`；当前类目中 `材质` 为 `isMandatory=true`，且带有可选值列表。
- 上架保存前新增必填属性预检：如果类目元数据中存在必填商品属性且妙手详情 `productAttributes` 为空或未填，会提前写回 `妙手类目必填属性缺失：材质，需人工在妙手补充后重试`，不再等 `save_shop_collect_item_info` 报错。
- 保持当前边界：暂不自动乱填材质/品牌/认证/责任人，后续如要自动填，需要新增“按站点/类目的属性默认值配置”。
- 妙手保存 payload 增加保护：图片列表最多 15 张；缺少 `deliveryOptionSetType` 时补 `default`；包裹重量必填；包裹长宽高按最小 `1cm` 写入，避免薄件高度 `0.5cm` 被接口拒绝。
- 发布前置校验收口：上架目标以目标店铺配置为准，不再用原商品国家/站点拦截，例如 MY 采集源允许上架到 VN 目标店铺；只校验目标店铺 ID/目标店铺站点与当前配置一致。
- 浏览器发布脚本验证：当前记录因 `材质` 必填被前置拦截，`executedCount=0`、`failedCount=1`，没有误触发发布。
- 验证命令通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run smoke:miaoshou:listing-edit`、`npm.cmd run smoke:miaoshou:check-readiness`、浏览器发布脚本预检。
## 2026-06-24 清晰补充：v0.1.4 阶段记录已归档

- 已把本轮类目树匹配、尺码表 API 写入、保存 payload 保护、必填属性前置拦截的结论补入 `task_plan.md` 和 `findings.md`。
- 当前代码版本为 `0.1.4`，已完成真实 VN 类目树刷新、中文路径匹配 `cid=846088`、尺码表配置 URL 写入、目标店铺站点校验收口。
- 当前真实记录停在合理人工处理点：妙手类目必填属性缺失 `材质`。程序不会自动乱填材质，后续如需自动补属性，需要新增按站点/类目的默认属性配置。
- 下一步建议先确认是否要做“必填属性默认值配置”；未确认前，不继续扩大自动发布字段范围。
- 复测通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build:app` 均通过。
- 复测上架编辑：`npm.cmd run smoke:miaoshou:listing-edit` 扫描 1 条，失败 1 条，原因仍为 `妙手类目必填属性缺失：材质，需人工在妙手补充后重试`，符合当前边界。
- 复测发布前检查：`npm.cmd run smoke:miaoshou:check-readiness` 返回缺失项 `草稿未保存` 和 `材质必填缺失`；没有误触发发布。

## 2026-06-24 版本 v0.1.5：材质必填属性下拉默认值落地

- 小版本号已从 `0.1.4` 升级到 `0.1.5`。
- AI上架配置支持刷新类目属性：按目标站点、目标店铺ID、目标类目ID调用妙手 `get_category_metadata`，读取必填属性，并把 `材质` 可选值展示为下拉选项。
- `材质默认值` 保存为 `站点|类目ID|属性名=选项名`，例如 `VN|846088|材质=涤纶（聚酯纤维）`。
- 自动上架生成/保存阶段新增材质默认值写入：如果目标类目元数据要求 `材质`，且妙手详情 `productAttributes` 未填，则按配置匹配妙手选项并写入标准 `productAttributes` 结构。
- 配置值必须命中妙手元数据选项；未命中会停止并写 `材质默认值未命中妙手选项`，不写自由文本。
- 类目写入补强：如果妙手未自动生成 `cid`，程序会用配置类目ID或输入表 `目标站点类目` 匹配类目树，写入 `cid` 后通过 `save_shop_collect_item_info` 保存完整 payload。
- `AI上架编辑表` 已写回 `尺码表状态`，用于判断 `尺码表非必填`、`已写入尺码表URL` 或尺码表配置错误。
- 修复记录：本轮中 `src/main/services/feishuBitableService.ts` 曾发生编码损坏，已从 Git 基线恢复并重新补齐 v0.1.5 服务层逻辑；损坏备份保存在 `.codex-run/corrupt-backups/feishuBitableService.corrupt-20260624.ts`。
- 验证通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build:app`。

## 2026-06-24 版本 v0.1.6：比价与上架任务日志分段收口

- 小版本号已从 `0.1.5` 升级到 `0.1.6`。
- `startTaskRun` 日志新增本轮商品ID汇总；多商品触发时最多展示前 20 个商品ID，并提示总数。
- 比价阶段日志现在明确停在表二/表三：表三生成后输出比价阶段耗时；未启用妙手自动上架时提示等待人工审核/手动上架。
- 启用妙手自动上架时，表三生成后先提示“准备默认审核并进入采集上架环节”；真正审核通过后，由自动上架阶段输出“表三批次已默认审核通过，进入采集上架环节”。
- 采集上架阶段新增独立开始/完成日志，记录采集认领推进数、失败数、浏览器发布数、浏览器失败数和阶段耗时。
- 最终主任务日志改为整条链路总结：包含商品ID、比价成功数、是否执行采集上架阶段、是否存在后续失败、总耗时。

## 2026-06-24 版本 v0.1.7：必填属性默认值扩展为全属性下拉

- 小版本号已从 `0.1.6` 升级到 `0.1.7`。
- 已用当前妙手接口真实请求 `get_category_metadata` 验证：VN `cid=846088` / 店铺 `16281849` 返回 `categoryProductAttrList` 10 项，`材质` 必填且有 34 个选项，`sizeChartIsRequired=1`。
- AI上架配置页的 `材质默认值` 已改为 `必填属性默认值`：刷新类目属性后，所有必填属性都会按行显示。
- 有妙手选项的必填属性使用下拉选择；没有可选项的必填属性显示 `无可选项，需人工处理`，不写自由文本。
- 默认值保存格式继续兼容 `站点|类目ID|属性=选项`；UI 保存时优先用属性ID作为属性键，执行端仍兼容属性ID和属性名匹配。
- 尺码表网络图片 URL 暂时仍是全局兜底；当前没有新增类目级尺码图预设。
