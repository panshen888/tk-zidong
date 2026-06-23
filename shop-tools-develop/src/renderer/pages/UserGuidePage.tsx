import { useEffect } from 'react';
import { CheckCircle2, ClipboardList, PackageCheck, Settings2, ShieldCheck, Table2 } from 'lucide-react';

const guideVersion = 'v0.1.2';
const guideUpdatedAt = '2026-06-23';
const stableFlowText = ['AI智能比价', '待人工核实上架表', 'AI智能上架', '妙手采集认领'].join(' -> ');

const priceTables = [
  ['输入表', '录入郑和数据链接、原商品链接或主图 URL；负责入口去重、状态和失败归因。'],
  ['输出货源表', '保存 1688 候选货源明细；包含候选序号、SKU、采购价、运费、采购总成本、克重、尺寸、1688 销量参考和商品组状态。'],
  ['待人工核实上架表', '从表二多条候选中生成唯一推荐货源；人工审核通过后进入 AI智能上架。'],
  ['AI上架编辑表', '承接表三已审核记录；记录妙手采集和认领准备状态。'],
  ['AI上架结果表', '浏览器模拟编辑和保存并发布的结果表；不写入主图、详情、SKU图或完整SKU结构。'],
];

const priceSteps = [
  '在 AI比价配置中确认飞书三表、候选数量、AI 模型、1688 销量参考、Chrome 登录浏览器和 1688 搜图入口。',
  '在输入表新增待处理商品；可只填郑和数据链接，或填原商品链接和主图 URL。',
  '运行 AI智能比价；系统会搜图、读取列表销量文本、下钻 1688 详情页、匹配 SKU、读取价格、运费、克重和尺寸。',
  '表二候选全部成功时，系统自动把商品组状态写为“已核实”；人工改“已核实/待更新表三”只是兜底触发。',
  '可点击“确认最新批次并生成表三”；系统按人工指定优先、克重多数决策、组内采购总成本最低生成唯一推荐。',
  '也可以直接在 AI智能上架里点击“开始AI上架”；软件会先从最新表二批次生成表三，再确认最新表三批次为“已审核”并进入采集认领。',
];

const listingSteps = [
  '进入 AI上架配置，勾选妙手接口上架，填写妙手开放平台 AppKey、AppSecret、账号 ID，并在线刷新店铺。',
  '选择目标站点和目标店铺；多国家店铺通过“多站点店铺映射”维护。',
  '进入 AI智能上架，选择飞书比价任务。',
  '点击“开始AI上架”，系统先从最新表二批次生成/更新表三并确认已审核，再用原商品链接采集到妙手公共采集箱并认领到 TikTok 采集箱。',
  '下一步浏览器模拟执行器会打开妙手采集箱，按货源ID搜索，批量改重量、货源价、本地展示价，应用定价模板后固定保存并发布。',
  '浏览器模拟发布结果写入 AI上架结果表，不回写到 AI上架编辑表。',
];

const localCommands = [
  ['npm run export:price-template', '导出本地三表 Excel 模板。'],
  ['npm run smoke:price:run-next', '从飞书输入表读取下一条待处理记录并跑 AI比价。'],
  ['npm run smoke:price:rerun-failed', '只重跑失败记录。'],
  ['npm run smoke:miaoshou:listing-edit', '从表三已审核记录生成或推进 AI上架编辑表。'],
  ['软件按钮：开始保存并发布', '通过浏览器模拟执行妙手编辑、应用定价模板、保存并发布。'],
];

export function UserGuidePage() {
  useEffect(() => {
    document.body.classList.add('guide-body');
    return () => {
      document.body.classList.remove('guide-body');
    };
  }, []);

  return (
    <main className="guide-window">
      <header className="guide-hero">
        <div>
          <span className="eyebrow">User Guide</span>
          <h1>TikTok AI Flow 使用说明</h1>
          <p>版本：{guideVersion} / 更新日期：{guideUpdatedAt}</p>
        </div>
        <div className="guide-version-card">
          <strong>当前稳定链路</strong>
          <span>{stableFlowText}</span>
        </div>
      </header>

      <section className="guide-section">
        <h2><Table2 size={20} /> 飞书表格</h2>
        <div className="guide-table-list">
          {priceTables.map(([name, description]) => (
            <article key={name}>
              <strong>{name}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <h2><ClipboardList size={20} /> AI智能比价使用流程</h2>
        <OrderedGuideList items={priceSteps} />
      </section>

      <section className="guide-section">
        <h2><PackageCheck size={20} /> AI智能上架使用流程</h2>
        <OrderedGuideList items={listingSteps} />
      </section>

      <section className="guide-section">
        <h2><Settings2 size={20} /> 必填配置</h2>
        <div className="guide-two-column">
          <GuideChecklist
            title="AI比价配置"
            items={[
              '飞书 App ID / App Secret',
              '输入表、输出货源表、待人工核实上架表',
              'Chrome 可执行程序和登录浏览器',
              '1688 搜图入口',
              '1688 销量参考：第一版只写表二和风险备注，不改变表三推荐结果',
              'AI Base URL、API Key、模型名和相似度阈值',
            ]}
          />
          <GuideChecklist
            title="AI上架配置"
            items={[
              '妙手 API 域名、AppKey、AppSecret、账号 ID',
              '目标站点、目标店铺 ID、目标店铺名称',
              '多站点店铺映射：MY/SG/PH/VN/TH',
              'AI上架结果表 appToken/tableId/viewId',
              '定价模板和物流公式暂不接入上架编辑表；当前以上游表三字段为准',
            ]}
          />
        </div>
      </section>

      <section className="guide-section">
        <h2><ShieldCheck size={20} /> 安全边界</h2>
        <GuideChecklist
          title="当前已锁定规则"
          items={[
            '采购模块暂停，不在当前 AI智能上架中执行。',
            '主图、详情、SKU 图、完整 SKU Map、ossMd5 不写入飞书。',
            '当前主链路只做妙手采集和认领；编辑发布改为浏览器模拟执行器单独接入。',
            '定价模板、物流公式先隐藏，不接入 AI上架编辑表写入。',
            '已发布商品后续可在妙手后台人工编辑。',
              '任务执行前必须使用软件里的“打开登录浏览器”；如果 9222 端口不是软件自己的浏览器，系统会阻止刷新模板和浏览器发布。',
          ]}
        />
      </section>

      <section className="guide-section">
        <h2><CheckCircle2 size={20} /> 本地验证命令</h2>
        <div className="guide-command-list">
          {localCommands.map(([command, description]) => (
            <div key={command}>
              <code>{command}</code>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function OrderedGuideList({ items }: { items: string[] }) {
  return (
    <ol className="guide-ordered-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

function GuideChecklist({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="guide-check-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
