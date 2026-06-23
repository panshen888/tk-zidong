# AI Price Three Table Workflow

Updated: 2026-06-12

This document is the locked first-version workflow for the AI price comparison module. It is intentionally separate from the Miaoshou listing/editing workflow.

## Scope

Current module boundary:

`输入表 -> 输出货源表 -> 待人工核实上架表 -> AI上架/妙手采集`

First version rules:

- 表三不保存利润字段。
- 利润筛选后续放到 AI上架模块或单独的上架利润审核表。
- 妙手采集不在 AI比价模块执行。
- 妙手采集由 AI上架模块读取表三 `状态 = 已审核` 的记录执行。
- 表三生成支持按钮手动生成和自动扫描生成；第一版默认按钮手动生成，自动扫描配置默认关闭。

## Batch And Key Rules

Unique business key:

- `商品ID + 国家/站点`

Batch fields:

- 表一：`当前比价批次号`
- 表二：`比价批次号`
- 表三：`比价批次号`

Batch ID format:

- `cmp_yyyyMMdd_HHmmss_随机4位`

Batch rules:

- Every manual rerun creates a new batch ID.
- Old candidates are not deleted.
- 表三 only uses the latest batch candidates for the same `商品ID + 国家/站点`.

## Table 1: 输入表

### Fields

| Order | Field | Type |
| ---: | --- | --- |
| 1 | `商品ID` | text |
| 2 | `状态` | single select |
| 3 | `国家/站点` | single select or text |
| 4 | `郑和数据链接` | url or text |
| 5 | `原商品链接` | url or text |
| 6 | `原商品主图URL` | url or text |
| 7 | `当前比价批次号` | text |
| 8 | `失败归因` | multi select |
| 9 | `重复位置` | single select or text |
| 10 | `重复记录ID` | text |
| 11 | `备注` | multiline text |
| 12 | `最后更新时间` | datetime |

### 状态 Options

- `待处理`
- `处理中`
- `已进入比价`
- `已重复`
- `失败`

### 失败归因 Options

- `郑和链接为空`
- `郑和链接格式错误`
- `郑和商品ID解析失败`
- `国家/站点解析失败`
- `原商品主图缺失`
- `原商品链接缺失`
- `商品已重复`
- `郑和接口请求失败`
- `郑和返回数据为空`
- `郑和返回字段缺失`
- `未知异常`

### 重复位置 Options

- `表一`
- `表二`
- `表三`

## Table 2: 输出货源表

### Fields

| Order | Field | Type |
| ---: | --- | --- |
| 1 | `商品ID` | text |
| 2 | `商品组状态` | single select |
| 3 | `候选状态` | single select |
| 4 | `采购总成本` | number |
| 5 | `克重` | number, unit g |
| 6 | `尺寸` | text, `长x宽x高cm` |
| 7 | `人工指定上架货源` | checkbox |
| 8 | `国家/站点` | single select or text |
| 9 | `比价批次号` | text |
| 10 | `输入表记录ID` | text |
| 11 | `候选序号` | number |
| 12 | `1688链接` | url or text |
| 13 | `offerId` | text |
| 14 | `SKU名称` | text |
| 15 | `SKU图片URL` | url or text |
| 16 | `采购价` | number, CNY |
| 17 | `运费` | number, CNY |
| 18 | `供应商` | text |
| 19 | `相似度` | number, 0-100 |
| 20 | `起批量` | number |
| 21 | `风险备注` | multiline text |
| 22 | `失败归因` | multi select |
| 23 | `郑和数据链接` | url or text |
| 24 | `原商品链接` | url or text |
| 25 | `原商品主图URL` | url or text |
| 26 | `最后更新时间` | datetime |

### 商品组状态 Options

- `比价中`
- `待核实`
- `已核实`
- `待更新表三`
- `失败`

### 候选状态 Options

- `成功`
- `失败`
- `需人工处理`

### 失败归因 Options

- `主图下载失败`
- `1688搜图失败`
- `1688无搜索结果`
- `候选链接不足`
- `相似度不足`
- `详情页打开失败`
- `offerId解析失败`
- `SKU列表为空`
- `SKU图片缺失`
- `SKU匹配失败`
- `采购价缺失`
- `运费缺失`
- `克重缺失`
- `尺寸缺失`
- `供应商缺失`
- `详情页解析失败`
- `1688登录失效`
- `1688验证拦截`
- `AI相似度接口失败`
- `AI SKU匹配失败`
- `未知异常`

## Table 3: 待人工核实上架表

### Fields

| Order | Field | Type |
| ---: | --- | --- |
| 1 | `商品ID` | text |
| 2 | `状态` | single select |
| 3 | `采购总成本` | number, CNY |
| 4 | `克重` | number, unit g |
| 5 | `尺寸` | text, `长x宽x高cm` |
| 6 | `妙手公共采集箱ID` | text |
| 7 | `妙手TikTok采集箱ID` | text |
| 8 | `妙手处理状态` | single select |
| 9 | `国家/站点` | single select or text |
| 10 | `比价批次号` | text |
| 11 | `输入表记录ID` | text |
| 12 | `输出货源表记录ID` | text |
| 13 | `推荐1688链接` | url or text |
| 14 | `offerId` | text |
| 15 | `推荐SKU名称` | text |
| 16 | `SKU图片URL` | url or text |
| 17 | `采购价` | number, CNY |
| 18 | `运费` | number, CNY |
| 19 | `起批量` | number |
| 20 | `供应商` | text |
| 21 | `候选数量` | number |
| 22 | `有效候选数量` | number |
| 23 | `选择依据` | text or single select |
| 24 | `风险备注` | multiline text |
| 25 | `失败归因` | multi select |
| 26 | `郑和数据链接` | url or text |
| 27 | `原商品链接` | url or text |
| 28 | `原商品主图URL` | url or text |
| 29 | `重复位置` | single select or text |
| 30 | `重复记录ID` | text |
| 31 | `最后更新时间` | datetime |

### 状态 Options

- `核实中`
- `待核实`
- `已审核`
- `采集中`
- `采集完成`
- `失败`

### 妙手处理状态 Options

- `未采集`
- `采集中`
- `已采集`
- `失败`

### 失败归因 Options

- `表二未核实`
- `无可用候选链接`
- `候选均失败`
- `候选均缺克重`
- `克重无法形成多数决策`
- `人工指定多条候选`
- `采购价缺失`
- `运费缺失`
- `采购总成本缺失`
- `克重缺失`
- `尺寸缺失`
- `商品ID无法关联`
- `国家/站点无法关联`
- `候选记录不完整`
- `表三更新失败`
- `未知异常`

### 重复位置 Options

- `表一`
- `表二`
- `表三`

## Table 2 To Table 3 Rules

Trigger conditions:

- 表二 `商品组状态 = 已核实`
- 表二 `商品组状态 = 待更新表三`

When manually changing one candidate row's `商品组状态`, the next scan must synchronize all rows in the same `商品ID + 国家/站点 + 比价批次号` group.

Table 3 generation:

- Search by `商品ID + 国家/站点`.
- Existing table 3 record: update it.
- Missing table 3 record: create it.
- During generation: `状态 = 核实中`.
- Success: `状态 = 待核实`.
- Failure: `状态 = 失败`, write `失败归因`.

If table 3 was already `已审核` and table 2 triggers `待更新表三`:

- Allow overwrite.
- After overwrite, set table 3 `状态 = 待核实`.
- Do not keep the old `已审核`.

If table 3 already has Miaoshou fields:

- `妙手处理状态` empty or `未采集`: overwrite normally.
- `妙手处理状态 = 采集中 / 已采集`: do not clear Miaoshou IDs or status automatically; set table 3 `状态 = 待核实`; append risk note `已存在妙手采集记录，需人工确认是否重新采集`.

## Recommendation Rules

Manual override:

- Same `商品ID + 国家/站点 + 比价批次号` has 0 selected rows: use automatic recommendation.
- 1 selected row: force this candidate.
- Multiple selected rows: table 3 fails with `人工指定多条候选`.

Manual selected candidates still must pass table 3 hard validation.

Automatic recommendation:

- Group candidates by `克重`.
- Tolerance comes from config `克重归组容差`, default `5g`.
- Highest hit-count weight group wins.
- Within winning group, lowest `采购总成本` wins.
- If multiple weight groups tie, the group with lower minimum `采购总成本` wins.
- If still impossible to determine, table 3 fails with `克重无法形成多数决策`.

## Table 3 Hard Validation

Required:

- `商品ID`
- `国家/站点`
- `推荐1688链接`
- `采购价`
- `运费`
- `采购总成本`
- `克重`

`offerId`, `推荐SKU名称`, `尺寸`, and `起批量` are recorded when available, but they do not block table 3 generation.
`起批量` is a reference/risk value only. Values greater than 1 should be written to `风险备注`, not `失败归因`.

Missing `运费` or `克重` may stay in table 2 as risks, but must not enter table 3 as a successful recommendation.

`有效候选数量` means candidates with `候选状态 = 成功` and all table 3 hard-validation base fields available.

## Rerun Rules

Duplicate records are blocked, including failed records.

Manual rerun:

- Do not create duplicate input rows.
- Table 1 failure: manually change original table 1 row back to `待处理`.
- Table 2 or table 3 failure: manually fix table 2 rows, then change table 2 `商品组状态` to `待更新表三`.
- Each rerun creates a new `比价批次号`.

## Candidate Count Rules

Candidate count comes from config `候选生成数量`.

- Config 5, found 5: normal.
- Config 5, found 2: write 2 candidates; do not mark failure; add risk note `候选链接不足：配置5条，实际2条`.
- Found 0: create a placeholder failed row in table 2:
  - `候选序号 = 0`
  - `商品组状态 = 失败`
  - `候选状态 = 失败`
  - `失败归因 = 1688无搜索结果`
  - include `商品ID`, `国家/站点`, source links, and `输入表记录ID`.

If table 2 has no usable candidate after manual verification, table 3 should still create or update a failed record so operators can see the reason in table 3.

## Config

AI比价配置 adds:

- `克重归组容差`, default `5`
- `自动生成待人工核实上架表`, default off
- `输入表tableId`
- `输入表viewId`
- `输出货源表tableId`
- `输出货源表viewId`
- `待人工核实上架表tableId`
- `待人工核实上架表viewId`

Existing config retained:

- `候选生成数量`
- `相似度阈值`

View rules:

- Reads are limited by configured viewId.
- Writes and same-group status synchronization operate on the whole target table, not only the configured view.

## Template Buttons

AI比价配置 adds two buttons:

- `创建飞书三表字段`
- `导出本地三表Excel模板`

Feishu template creation rules:

- If tables do not exist, create them.
- If tables exist, add missing fields.
- Do not delete existing fields.
- Do not modify existing field types.
- If existing field type mismatches, stop and show `字段类型不匹配`.

Local Excel template:

- Generate one xlsx with three sheets:
  - `输入表`
  - `输出货源表`
  - `待人工核实上架表`
- Header row only. Do not add example data rows.

## Unit Rules

- `采购价`: CNY
- `运费`: CNY
- `采购总成本`: CNY
- `克重`: g
- `尺寸`: `长x宽x高cm`
- `相似度`: 0-100

## Execution Priority

One scan cycle priority:

1. 表二 `待更新表三 / 已核实` -> generate or update table 3.
2. AI上架 module handles table 3 `已审核` -> Miaoshou collection.
3. 表一 `待处理` -> new price comparison.

Miaoshou collection belongs to AI上架, not AI比价.
