import { useEffect, useState } from 'react';
import { ExternalLink, FileSpreadsheet, FolderOpen, RotateCcw, Save, TableProperties } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import type { AppSettings } from '../../shared/types';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [browserMessage, setBrowserMessage] = useState('');
  const [templateMessage, setTemplateMessage] = useState('');

  useEffect(() => {
    void window.appApi.getSettings().then(setSettings);
  }, []);

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setSavedMessage('');
    setAiMessage('');
    setBrowserMessage('');
    setTemplateMessage('');
  }

  async function chooseDirectory(key: 'defaultOutputDir' | 'defaultAssetDir') {
    const directory = await window.appApi.selectDirectory();
    if (directory) {
      updateSettings({ [key]: directory });
    }
  }

  async function chooseChromeExecutable() {
    const executablePath = await window.appApi.selectChromeExecutable();
    if (executablePath) {
      updateSettings({ chromeExecutablePath: executablePath });
    }
  }

  async function saveSettings() {
    if (!settings) {
      return;
    }

    const nextSettings = await window.appApi.saveSettings(settings);
    setSettings(nextSettings);
    setSavedMessage('配置已保存');
    window.alert('保存成功');
  }

  async function saveAiSettings() {
    if (!settings) {
      return;
    }

    const nextSettings = await window.appApi.saveSettings(settings);
    setSettings(nextSettings);
    setAiMessage('AI 配置已保存，后续任务立即使用');
  }

  async function clearAiSettings() {
    if (!settings) {
      return;
    }

    const nextSettings = await window.appApi.saveSettings({
      ...settings,
      aiBaseUrl: '',
      aiApiKey: '',
    });
    setSettings(nextSettings);
    setAiMessage('AI Base URL 和 API Key 已清除');
  }

  async function openLoginBrowser() {
    if (!settings) {
      return;
    }

    if (!settings.chromeExecutablePath) {
      setBrowserMessage('未找到 Chrome，请先点击“选择”指定 Chrome 可执行程序。');
      return;
    }

    window.alert([
      '即将打开应用独立 Chrome，请确认以下账号都已登录：',
      '1. 1688：用于搜图、详情页价格、运费、克重和尺寸抓取。',
      '2. 郑和数据：用于郑和链接解析、国家/站点和原商品信息补全。',
      '3. 妙手 ERP：用于采集、认领、草稿编辑和发布复核。',
      '登录完成后不要关闭这个浏览器，后续任务会复用该登录态。',
    ].join('\n'));
    const nextSettings = await window.appApi.saveSettings(settings);
    setSettings(nextSettings);
    await window.appApi.openLoginBrowser();
    setBrowserMessage('已打开应用独立 Chrome，请在里面完成 1688、郑和数据、妙手登录。后续比价和上架任务会复用这个登录态。');
  }

  async function ensurePriceTables() {
    try {
      const nextSettings = settings ? await window.appApi.saveSettings(settings) : null;
      if (nextSettings) {
        setSettings(nextSettings);
      }
      const result = await window.appApi.ensurePriceComparisonTables();
      setSettings((current) =>
        current
          ? {
              ...current,
              priceInputBitable: result.inputBitable,
              priceOutputBitable: result.outputBitable,
              priceReviewBitable: result.reviewBitable,
              lastFeishuInputBitable: result.inputBitable,
              lastFeishuOutputBitable: result.outputBitable,
            }
          : current,
      );
      setTemplateMessage('飞书三表字段已创建/补齐');
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : '飞书三表字段创建失败');
    }
  }

  async function exportLocalTemplate() {
    try {
      const result = await window.appApi.exportLocalThreeTableTemplate();
      await window.appApi.openPath(result.outputExcelPath);
      setTemplateMessage(`本地三表 Excel 模板已导出：${result.outputExcelPath}`);
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : '本地三表 Excel 模板导出失败');
    }
  }

  async function generateReviewTable() {
    try {
      const nextSettings = settings ? await window.appApi.saveSettings(settings) : null;
      if (nextSettings) {
        setSettings(nextSettings);
      }
      const result = await window.appApi.generatePriceComparisonReviewTable({
        weightToleranceGram: settings?.weightGroupToleranceGram,
      });
      setTemplateMessage(`待人工核实上架表生成完成：扫描 ${result.scannedGroupCount} 组，成功 ${result.generatedCount}，失败 ${result.failedCount}`);
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : '待人工核实上架表生成失败');
    }
  }

  async function confirmLatestBatchAndGenerateReviewTable() {
    try {
      const nextSettings = settings ? await window.appApi.saveSettings(settings) : null;
      if (nextSettings) {
        setSettings(nextSettings);
      }
      const result = await window.appApi.confirmLatestPriceBatchAndGenerateReviewTable();
      setTemplateMessage(
        `最新批次已确认并生成表三：批次 ${result.batchId}，核实表二 ${result.verifiedOutputCount} 条，扫描 ${result.scannedGroupCount} 组，成功 ${result.generatedCount}，失败 ${result.failedCount}，同步定价/物流配置 ${result.pricingSyncedCount} 条`,
      );
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : '确认最新批次并生成表三失败');
    }
  }

  async function generateLocalReviewTable() {
    try {
      const workbookPath = await window.appApi.selectExcelFile();
      if (!workbookPath) {
        return;
      }

      const nextSettings = settings ? await window.appApi.saveSettings(settings) : null;
      if (nextSettings) {
        setSettings(nextSettings);
      }
      const result = await window.appApi.generateLocalPriceComparisonReviewTable({
        workbookPath,
        weightToleranceGram: settings?.weightGroupToleranceGram,
      });
      await window.appApi.openPath(result.outputExcelPath);
      setTemplateMessage(`本地待人工核实上架表生成完成：扫描 ${result.scannedGroupCount} 组，成功 ${result.generatedCount}，失败 ${result.failedCount}`);
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : '本地待人工核实上架表生成失败');
    }
  }

  if (!settings) {
    return <p className="muted">正在读取配置...</p>;
  }

  return (
    <section className="page-section settings-page">
      <PageHeader
        eyebrow="AI Price Settings"
        title="AI比价配置"
        description="配置输出目录、候选数量、Chrome 程序路径、AI 中转站、接口并发、飞书凭证和页面超时。"
        action={
          <button className="primary-button" type="button" onClick={() => void saveSettings()}>
            <Save size={18} />
            保存配置
          </button>
        }
      />

      <div className="settings-grid compact-settings-grid">
        <div className="settings-column settings-column-left">
          <article className="panel settings-card settings-card-strategy">
            <h3>任务策略</h3>
            <div className="settings-form-grid">
              <label className="field">
                <span>默认执行模式</span>
                <select
                  value={settings.sourcingMode}
                  onChange={(event) => {
                    const sourcingMode = event.target.value as AppSettings['sourcingMode'];
                    updateSettings({
                      sourcingMode,
                      acceptedCandidateLimit: Math.min(sourcingMode === 'fast' ? 3 : 10, settings.acceptedCandidateLimit),
                    });
                  }}
                >
                  <option value="fast">快速模式：列表价优先，只下钻前 3 条</option>
                  <option value="accurate">精准模式：相似度优先，可下钻更多候选</option>
                </select>
              </label>

              <label className="field">
                <span>搜图候选数</span>
                <input
                  min={1}
                  max={200}
                  type="number"
                  value={settings.candidateLimit}
                  onChange={(event) => updateSettings({ candidateLimit: Number(event.target.value) })}
                />
              </label>

            <label className="field">
              <span>下钻详情数</span>
              <input
                min={1}
                max={settings.sourcingMode === 'fast' ? 3 : 10}
                type="number"
                value={settings.acceptedCandidateLimit}
                onChange={(event) => updateSettings({ acceptedCandidateLimit: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span>详情页并发数</span>
              <input
                min={1}
                max={10}
                type="number"
                value={settings.detailPageConcurrency}
                onChange={(event) => updateSettings({ detailPageConcurrency: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span>页面超时 ms</span>
              <input
                min={5000}
                step={1000}
                type="number"
                value={settings.pageTimeoutMs}
                onChange={(event) => updateSettings({ pageTimeoutMs: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span>失败重试次数</span>
              <input
                min={0}
                max={5}
                type="number"
                value={settings.retryCount}
                onChange={(event) => updateSettings({ retryCount: Number(event.target.value) })}
              />
            </label>

            <label className="field checkbox-field">
              <span>启用真实工厂认证筛选</span>
              <input
                type="checkbox"
                checked={settings.enable1688RealFactoryFilter}
                onChange={(event) => updateSettings({ enable1688RealFactoryFilter: event.target.checked })}
              />
            </label>

            <label className="field checkbox-field">
              <span>启用实力认证筛选</span>
              <input
                type="checkbox"
                checked={settings.enable1688StrengthFactoryFilter}
                onChange={(event) => updateSettings({ enable1688StrengthFactoryFilter: event.target.checked })}
              />
            </label>

            <label className="field checkbox-field">
              <span>启用年销量筛选</span>
              <input
                type="checkbox"
                checked={settings.enable1688AnnualSalesFilter}
                onChange={(event) => updateSettings({ enable1688AnnualSalesFilter: event.target.checked })}
              />
            </label>

            <label className="field">
              <span>最低年销量</span>
              <input
                min={0}
                type="number"
                value={settings.min1688AnnualSales}
                onChange={(event) => updateSettings({ min1688AnnualSales: Number(event.target.value) })}
              />
            </label>

            <label className="field checkbox-field">
              <span>启用月代销筛选</span>
              <input
                type="checkbox"
                checked={settings.enable1688MonthlySalesFilter}
                onChange={(event) => updateSettings({ enable1688MonthlySalesFilter: event.target.checked })}
              />
            </label>

            <label className="field">
              <span>最低月代销</span>
              <input
                min={0}
                type="number"
                value={settings.min1688MonthlySales}
                onChange={(event) => updateSettings({ min1688MonthlySales: Number(event.target.value) })}
              />
            </label>

            <label className="field checkbox-field">
              <span>启用1688已售数量兜底（未使用插件时）</span>
              <input
                type="checkbox"
                checked={settings.enable1688SalesReference}
                onChange={(event) => updateSettings({ enable1688SalesReference: event.target.checked })}
              />
            </label>

            <label className="field">
              <span>最低已售数量</span>
              <input
                min={0}
                type="number"
                value={settings.min1688SalesVolume}
                onChange={(event) => updateSettings({ min1688SalesVolume: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span>销量缺失处理</span>
              <select
                value={settings.missing1688SalesAction}
                onChange={(event) => updateSettings({ missing1688SalesAction: event.target.value as AppSettings['missing1688SalesAction'] })}
              >
                <option value="markRisk">标记风险，不剔除</option>
                <option value="ignore">忽略缺失</option>
                <option value="filter">剔除缺失候选</option>
              </select>
            </label>
          </div>

          <p className="helper-text">
            快速模式按列表价低优先，只下钻前 3 条；精准模式按相似度优先，最多下钻 10 条。插件增强数据优先用年销量，再用月代销；未拿到插件数据时才使用已售数量兜底。认证筛选候选不足时会自动放宽并写入风险备注。
          </p>
        </article>

        <article className="panel settings-card settings-card-feishu">
          <h3>飞书多维表格</h3>
          <div className="settings-form-grid">
            <label className="field span-2">
              <span>飞书 app_id</span>
              <input
                value={settings.feishuAppId}
                placeholder="cli_..."
                onChange={(event) => updateSettings({ feishuAppId: event.target.value })}
              />
            </label>

            <label className="field span-2">
              <span>飞书 app_secret</span>
              <input
                type="password"
                value={settings.feishuAppSecret}
                placeholder="应用凭证中的 App Secret"
                onChange={(event) => updateSettings({ feishuAppSecret: event.target.value })}
              />
            </label>
          </div>
          <p className="helper-text">
            创建飞书任务时填写输入表和输出货源表的 app_token、table_id、view_id；具体链接会在新建任务时自动提取并保存上次输入。
          </p>
        </article>

        <article className="panel settings-card settings-card-browser">
          <h3>Chrome 与 1688</h3>
          <p className="helper-text">
            登录浏览器永远可见，只用于登录、验证码和风控处理；执行任务时会按下方模式复用这个独立浏览器的登录态，不会关闭你的日常 Chrome。
          </p>
          <label className="field">
            <span>搜图适配器</span>
            <select
              value={settings.searchAdapterMode}
              onChange={(event) =>
                updateSettings({
                  searchAdapterMode: event.target.value as AppSettings['searchAdapterMode'],
                })
              }
            >
              <option value="mock">Mock 测试适配器</option>
              <option value="real1688">真实 1688 / Chrome 适配器</option>
            </select>
          </label>

          <PathField
            label="Chrome 可执行程序"
            value={settings.chromeExecutablePath}
            placeholder="未自动找到 Chrome，请点击选择"
            onChoose={() => void chooseChromeExecutable()}
          />

          <label className="field">
            <span>任务执行浏览器模式</span>
            <select
              value={settings.taskBrowserMode}
              onChange={(event) =>
                updateSettings({
                  taskBrowserMode: event.target.value as AppSettings['taskBrowserMode'],
                })
              }
            >
              <option value="headless">无头后台模式（推荐）</option>
              <option value="headed">有头低打扰模式</option>
            </select>
          </label>

          <p className="helper-text">
            选择无头后台模式时，执行任务前会自动关闭应用自己打开的可见登录浏览器，再用同一个独立用户目录无头运行。
          </p>

          <div className="button-row inline-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => void openLoginBrowser()}
              disabled={!settings.chromeExecutablePath}
            >
              <ExternalLink size={18} />
              打开登录浏览器
            </button>
          </div>

          <label className="field">
            <span>1688 搜图入口</span>
            <input
              value={settings.imageSearchUrl}
              onChange={(event) => updateSettings({ imageSearchUrl: event.target.value })}
            />
          </label>

          {savedMessage ? <p className="success-message">{savedMessage}</p> : null}
          {browserMessage ? <p className={settings.chromeExecutablePath ? 'success-message' : 'warning-message'}>{browserMessage}</p> : null}
        </article>
        </div>

        <div className="settings-column settings-column-right">
        <article className="panel settings-card settings-card-path">
          <h3>路径</h3>
          <div className="settings-form-grid">
            <PathField
              label="默认输出目录"
              value={settings.defaultOutputDir}
              onChoose={() => void chooseDirectory('defaultOutputDir')}
            />
            <PathField
              label="默认任务资产目录"
              value={settings.defaultAssetDir}
              onChoose={() => void chooseDirectory('defaultAssetDir')}
            />
          </div>
        </article>

        <article className="panel settings-card settings-card-local">
          <h3>本地 Excel</h3>
          <div className="settings-form-grid">
            <label className="field">
              <span>Excel 行并发数</span>
              <input
                min={1}
                max={10}
                type="number"
                value={settings.excelRowConcurrency}
                onChange={(event) => updateSettings({ excelRowConcurrency: Number(event.target.value) })}
              />
            </label>
          </div>
          <p className="helper-text">
            本地任务会自动在第一列补「状态」；状态值使用待核实、核实中、已完成、失败。结果和执行配置会回写到本地 Excel。
          </p>
        </article>

        <article className="panel settings-card settings-card-realtime">
          <h3>持续执行</h3>
          <div className="settings-form-grid">
            <label className="field">
              <span>持续扫描间隔（秒）</span>
              <input
                min={5}
                max={3600}
                type="number"
                value={settings.realtimePollIntervalSeconds}
                onChange={(event) => updateSettings({ realtimePollIntervalSeconds: Number(event.target.value) })}
              />
            </label>
          </div>
          <p className="helper-text">
            飞书任务直接通过多维表格 API 读写，本地任务直接扫描 Excel；两种持续执行都会每次领取 1 行空状态/「待处理」/「待核实」记录，已完成自动跳过。
          </p>
        </article>

        <article className="panel settings-card settings-card-ai">
          <h3>AI 相似度识别</h3>
          <div className="settings-form-grid">
            <label className="field span-2">
              <span>中转站 Base URL</span>
              <input
                value={settings.aiBaseUrl}
                placeholder="https://your-proxy.example.com/v1"
                onChange={(event) => updateSettings({ aiBaseUrl: event.target.value })}
              />
            </label>

            <label className="field span-2">
              <span>中转站 API Key</span>
              <input
                type="password"
                value={settings.aiApiKey}
                placeholder="sk-..."
                onChange={(event) => updateSettings({ aiApiKey: event.target.value })}
              />
            </label>

            <label className="field">
              <span>模型名称</span>
              <input
                value={settings.aiModel}
                placeholder="例如 gpt-5.5"
                onChange={(event) => updateSettings({ aiModel: event.target.value })}
              />
            </label>

            <label className="field">
              <span>同款判定阈值</span>
              <input
                min={0}
                max={1}
                step={0.01}
                type="number"
                value={settings.aiSimilarityThreshold}
                onChange={(event) => updateSettings({ aiSimilarityThreshold: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span>AI 接口并发数</span>
              <input
                min={1}
                max={10}
                type="number"
                value={settings.aiRequestConcurrency}
                onChange={(event) => updateSettings({ aiRequestConcurrency: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span>AI 列表批量大小</span>
              <input
                min={1}
                max={50}
                type="number"
                value={settings.aiListBatchSize}
                onChange={(event) => updateSettings({ aiListBatchSize: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="button-row inline-actions">
            <button className="ghost-button" type="button" onClick={() => void saveAiSettings()}>
              <Save size={18} />
              保存 AI 配置
            </button>
            <button className="danger-button" type="button" onClick={() => void clearAiSettings()}>
              <RotateCcw size={18} />
              清除 AI 配置
            </button>
          </div>
          <p className="helper-text">AI 接口并发默认建议 8；列表批量大小默认 10，单批越大越省请求，失败影响面也越大。</p>
          {aiMessage ? <p className="success-message">{aiMessage}</p> : null}
        </article>

        <article className="panel settings-card settings-card-review">
          <h3>输出与核实规则</h3>
          <div className="settings-form-grid">
            <BitableConfigFields
              title="表一：输入表"
              value={settings.priceInputBitable}
              onChange={(priceInputBitable) => updateSettings({ priceInputBitable })}
            />
            <BitableConfigFields
              title="表二：输出货源表"
              value={settings.priceOutputBitable}
              onChange={(priceOutputBitable) => updateSettings({ priceOutputBitable })}
            />
            <BitableConfigFields
              title="表三：待人工核实上架表"
              value={settings.priceReviewBitable}
              onChange={(priceReviewBitable) => updateSettings({ priceReviewBitable })}
            />

            <label className="field">
              <span>克重归组容差 g</span>
              <input
                min={0}
                max={100}
                type="number"
                value={settings.weightGroupToleranceGram}
                onChange={(event) => updateSettings({ weightGroupToleranceGram: Number(event.target.value) })}
              />
            </label>

          </div>

          <div className="button-row inline-actions">
            <button className="ghost-button" type="button" onClick={() => void ensurePriceTables()}>
              <TableProperties size={18} />
              创建飞书三表字段
            </button>
            <button className="ghost-button" type="button" onClick={() => void exportLocalTemplate()}>
              <FileSpreadsheet size={18} />
              导出本地三表Excel模板
            </button>
            <button className="ghost-button" type="button" onClick={() => void generateLocalReviewTable()}>
              <FileSpreadsheet size={18} />
              本地生成待人工核实表
            </button>
            <button className="primary-button" type="button" onClick={() => void generateReviewTable()}>
              <TableProperties size={18} />
              飞书生成待人工核实表
            </button>
            <button className="primary-button" type="button" onClick={() => void confirmLatestBatchAndGenerateReviewTable()}>
              <TableProperties size={18} />
              确认最新批次并生成表三
            </button>
          </div>

          <p className="helper-text">
            AI比价执行会先写入表二，再自动确认本次批次并生成表三；“确认最新批次并生成表三”按钮只作为人工兜底工具。
            表二候选成功后会自动把商品组状态写为“已核实”；人工修改“已核实/待更新表三”只作为兜底触发。
            表三规则固定为：人工指定优先、克重多数决策、同组采购总成本最低。妙手采集和利润审核不在 AI比价配置里执行。
          </p>
          {templateMessage ? <p className="success-message">{templateMessage}</p> : null}
        </article>
        </div>
      </div>
    </section>
  );
}

type PathFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  onChoose: () => void;
};

function PathField({ label, value, placeholder, onChoose }: PathFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="file-picker">
        <input readOnly value={value} placeholder={placeholder} />
        <button type="button" onClick={onChoose}>
          <FolderOpen size={16} />
          选择
        </button>
      </div>
    </label>
  );
}

type BitableConfigFieldsProps = {
  title: string;
  value: AppSettings['priceInputBitable'];
  onChange: (value: AppSettings['priceInputBitable']) => void;
};

function BitableConfigFields({ title, value, onChange }: BitableConfigFieldsProps) {
  function updateBitable(patch: Partial<AppSettings['priceInputBitable']>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="settings-subpanel span-2">
      <h4>{title}</h4>
      <div className="settings-form-grid">
        <label className="field">
          <span>app_token</span>
          <input value={value.appToken} onChange={(event) => updateBitable({ appToken: event.target.value })} />
        </label>
        <label className="field">
          <span>table_id</span>
          <input value={value.tableId} onChange={(event) => updateBitable({ tableId: event.target.value })} />
        </label>
        <label className="field">
          <span>view_id</span>
          <input value={value.viewId} onChange={(event) => updateBitable({ viewId: event.target.value })} />
        </label>
      </div>
    </div>
  );
}
