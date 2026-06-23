import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenText, Boxes, PackagePlus, Settings2, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

const navigationModules = [
  {
    title: 'AI智能比价',
    description:
      '读取用户在 Excel 中选好的商品图片，到 1688 搜索相似货源；通过 AI 对比图片相似度，优先下钻高相似商品做价格对比，最终筛出低价且与原商品一致的候选，供用户直接使用或继续筛选。',
    to: '/tasks',
    action: '进入比价',
    icon: Boxes,
  },
  {
    title: 'AI智能上架',
    description:
      '承接 AI比价表三的已审核记录，写入 AI上架编辑表，串起妙手公共采集箱、TikTok 采集箱、草稿保存和二次确认发布。',
    to: '/listing',
    action: '进入上架',
    icon: PackagePlus,
  },
  {
    title: 'AI比价配置',
    description: '配置 Chrome 登录浏览器、1688 搜图入口、任务执行模式、AI 中转站、相似度阈值、并发和默认输出目录。',
    to: '/tasks/settings',
    action: '配置比价',
    icon: SlidersHorizontal,
  },
  {
    title: 'AI上架配置',
    description: '配置妙手开放平台、TikTok 店铺、站点、类目、仓库、物流模板和上架默认值。',
    to: '/listing/settings',
    action: '配置上架',
    icon: Settings2,
  },
];

export function HomePage() {
  async function openUserGuide() {
    await window.appApi.openUserGuide();
  }

  return (
    <section className="page-section home-page">
      <PageHeader
        eyebrow="Dashboard"
        title="AI智能比价工作台"
        description="从这里进入核心模块：AI智能比价和AI智能上架各自独立配置，先配置再执行对应流程。"
      />

      <div className="home-menu-grid">
        {navigationModules.map((module) => {
          const Icon = module.icon;
          return (
            <Link className="home-menu-card" to={module.to} key={module.title}>
              <div className="home-menu-icon">
                <Icon size={24} />
              </div>
              <div>
                <h2>{module.title}</h2>
                <p>{module.description}</p>
              </div>
              <span className="home-menu-action">
                {module.action}
                <ArrowRight size={16} />
              </span>
            </Link>
          );
        })}
        <button className="home-menu-card home-guide-card" type="button" onClick={() => void openUserGuide()}>
          <div className="home-menu-icon">
            <BookOpenText size={24} />
          </div>
          <div>
            <h2>使用说明</h2>
            <p>查看当前版本、更新日期、四张飞书表、AI智能比价流程、AI智能上架流程、必填配置和安全边界。会打开独立窗口，方便拖到旁边对照操作。</p>
          </div>
          <span className="home-menu-action">
            打开说明
            <ArrowRight size={16} />
          </span>
        </button>
      </div>
    </section>
  );
}
