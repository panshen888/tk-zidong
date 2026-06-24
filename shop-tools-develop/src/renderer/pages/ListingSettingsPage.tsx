import { useEffect, useState, type ReactNode } from 'react';
import { Download, KeyRound, Link2, RefreshCw, Save, Store, Tags } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import type { AppSettings, MiaoshouPricingTemplate, MiaoshouRequiredAttribute, MiaoshouShop } from '../../shared/types';

export function ListingSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [shopConfigMessage, setShopConfigMessage] = useState('');
  const [listingResultTableMessage, setListingResultTableMessage] = useState('');
  const [pricingTemplateMessage, setPricingTemplateMessage] = useState('');
  const [categoryTreeMessage, setCategoryTreeMessage] = useState('');
  const [categoryAttributeMessage, setCategoryAttributeMessage] = useState('');
  const [isExportingShopConfig, setIsExportingShopConfig] = useState(false);
  const [isRefreshingShops, setIsRefreshingShops] = useState(false);
  const [isRefreshingPricingTemplates, setIsRefreshingPricingTemplates] = useState(false);
  const [isRefreshingCategoryTree, setIsRefreshingCategoryTree] = useState(false);
  const [isRefreshingCategoryAttributes, setIsRefreshingCategoryAttributes] = useState(false);
  const [isEnsuringListingResultTable, setIsEnsuringListingResultTable] = useState(false);
  const [refreshedShops, setRefreshedShops] = useState<MiaoshouShop[]>([]);
  const [requiredAttributes, setRequiredAttributes] = useState<MiaoshouRequiredAttribute[]>([]);

  useEffect(() => {
    void window.appApi.getSettings().then(setSettings);
  }, []);

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setSavedMessage('');
    setShopConfigMessage('');
    setListingResultTableMessage('');
    setPricingTemplateMessage('');
    setCategoryTreeMessage('');
    setCategoryAttributeMessage('');
  }

  async function saveSettings() {
    if (!settings) {
      return;
    }

    const nextSettings = await window.appApi.saveSettings(settings);
    setSettings(nextSettings);
    setSavedMessage('AI上架配置已保存');
  }

  async function exportShopConfig() {
    setIsExportingShopConfig(true);
    try {
      if (settings) {
        const nextSettings = await window.appApi.saveSettings(settings);
        setSettings(nextSettings);
      }
      const result = await window.appApi.exportMiaoshouShopConfig({
        sites: listingSiteOptions.map((option) => option.value),
      });
      await window.appApi.openPath(result.outputExcelPath);
      setShopConfigMessage(`店铺配置表已生成：${result.shopCount} 个店铺`);
    } catch (error) {
      setShopConfigMessage(error instanceof Error ? error.message : '店铺配置表生成失败');
    } finally {
      setIsExportingShopConfig(false);
    }
  }

  async function refreshShops() {
    setIsRefreshingShops(true);
    try {
      let nextSettings = settings;
      if (settings) {
        nextSettings = await window.appApi.saveSettings(settings);
        setSettings(nextSettings);
      }
      const result = await window.appApi.queryMiaoshouShops({
        sites: listingSiteOptions.map((option) => option.value),
      });
      setRefreshedShops(result.shops);

      const selectedSite = normalizeSite(nextSettings?.targetSite);
      const shopsForSelectedSite = result.shops.filter((shop) => normalizeSite(shop.site) === selectedSite);
      if (nextSettings && selectedSite && shopsForSelectedSite.length > 0) {
        const currentShop = shopsForSelectedSite.find((shop) => String(shop.shopId) === String(nextSettings?.targetShopId));
        const selectedShop = currentShop ?? shopsForSelectedSite[0];
        setSettings({
          ...nextSettings,
          targetShopId: String(selectedShop.shopId ?? ''),
          targetShopName: getShopDisplayName(selectedShop),
          targetSite: normalizeSite(selectedShop.site) || selectedSite,
          listingShopMappings: upsertListingShopMapping(nextSettings.listingShopMappings, selectedShop),
        });
      }

      setShopConfigMessage(`已在线刷新 ${result.shops.length} 个店铺；选择站点和店铺后会自动回填店铺 ID`);
    } catch (error) {
      setShopConfigMessage(error instanceof Error ? error.message : '在线刷新店铺失败');
    } finally {
      setIsRefreshingShops(false);
    }
  }

  async function ensureListingResultTable() {
    if (!settings) {
      return;
    }
    setIsEnsuringListingResultTable(true);
    try {
      const nextSettings = await window.appApi.saveSettings(settings);
      setSettings(nextSettings);
      const result = await window.appApi.ensureMiaoshouListingResultTable();
      setSettings({
        ...nextSettings,
        listingResultBitable: result.listingResultBitable,
      });
      setListingResultTableMessage('AI上架结果表已创建/补齐字段，后续浏览器模拟发布结果会写入这里。');
    } catch (error) {
      setListingResultTableMessage(error instanceof Error ? error.message : 'AI上架结果表创建失败');
    } finally {
      setIsEnsuringListingResultTable(false);
    }
  }

  async function refreshPricingTemplates() {
    if (!settings) {
      return;
    }
    setIsRefreshingPricingTemplates(true);
    try {
      const nextSettings = await window.appApi.saveSettings(settings);
      setSettings(nextSettings);
      const result = await window.appApi.refreshMiaoshouPricingTemplates({
        site: nextSettings.targetSite,
      });
      const refreshedSettings = await window.appApi.getSettings();
      setSettings(refreshedSettings);
      setPricingTemplateMessage(`已刷新 ${result.templates.length} 个妙手定价模板；请选择当前站点要使用的模板并保存配置。`);
    } catch (error) {
      setPricingTemplateMessage(error instanceof Error ? error.message : '刷新妙手定价模板失败');
    } finally {
      setIsRefreshingPricingTemplates(false);
    }
  }

  async function refreshCategoryTree() {
    if (!settings) {
      return;
    }
    setIsRefreshingCategoryTree(true);
    try {
      const nextSettings = await window.appApi.saveSettings(settings);
      setSettings(nextSettings);
      const result = await window.appApi.refreshMiaoshouCategoryTree({
        site: nextSettings.targetSite,
      });
      const refreshedSettings = await window.appApi.getSettings();
      setSettings(refreshedSettings);
      setCategoryTreeMessage(`已刷新 ${result.site} 类目树：${result.categories.length} 个类目节点`);
    } catch (error) {
      setCategoryTreeMessage(error instanceof Error ? error.message : '刷新目标站点类目失败');
    } finally {
      setIsRefreshingCategoryTree(false);
    }
  }

  async function refreshCategoryAttributes() {
    if (!settings) {
      return;
    }
    setIsRefreshingCategoryAttributes(true);
    try {
      const nextSettings = await window.appApi.saveSettings(settings);
      setSettings(nextSettings);
      const result = await window.appApi.refreshMiaoshouCategoryAttributes({
        site: nextSettings.targetSite,
        cid: nextSettings.miaoshouTargetCategoryId,
        shopId: nextSettings.targetShopId,
      });
      setRequiredAttributes(result.requiredAttributes);
      const materialAttr = findMaterialAttribute(result.requiredAttributes);
      setCategoryAttributeMessage(materialAttr
        ? `已读取 ${result.site} / ${result.cid} 必填属性，材质可选 ${materialAttr.options.length} 项`
        : `已读取 ${result.site} / ${result.cid} 必填属性，当前类目未返回材质必填项`);
    } catch (error) {
      setRequiredAttributes([]);
      setCategoryAttributeMessage(error instanceof Error ? error.message : '刷新类目属性失败');
    } finally {
      setIsRefreshingCategoryAttributes(false);
    }
  }

  function handlePricingTemplateChange(templateKey: string) {
    if (!settings) {
      return;
    }
    const template = parsePricingTemplates(settings.miaoshouPricingTemplatesJson)
      .find((item) => getPricingTemplateKey(item) === templateKey);
    if (!template) {
      updateSettings({ miaoshouPricingTemplateMappings: removePricingTemplateMapping(settings.miaoshouPricingTemplateMappings, selectedSite) });
      return;
    }
    updateSettings({
      miaoshouPricingTemplateName: template.name,
      miaoshouPricingTemplateMappings: upsertPricingTemplateMapping(settings.miaoshouPricingTemplateMappings, template),
    });
  }

  function handleTargetSiteChange(site: string) {
    const targetSite = normalizeSite(site);
    const shopsForSite = refreshedShops.filter((shop) => normalizeSite(shop.site) === targetSite);
    if (shopsForSite.length > 0) {
      const firstShop = shopsForSite[0];
      updateSettings({
        targetSite,
        targetShopId: String(firstShop.shopId ?? ''),
        targetShopName: getShopDisplayName(firstShop),
        listingShopMappings: upsertListingShopMapping(settings?.listingShopMappings, firstShop),
      });
      return;
    }

    updateSettings(refreshedShops.length > 0
      ? { targetSite, targetShopId: '', targetShopName: '' }
      : { targetSite });
  }

  function handleTargetShopChange(shopId: string) {
    const selectedSite = normalizeSite(settings?.targetSite);
    const selectedShop = refreshedShops.find((shop) => (
      String(shop.shopId) === shopId && normalizeSite(shop.site) === selectedSite
    ));
    if (!selectedShop) {
      updateSettings({ targetShopId: '', targetShopName: '' });
      return;
    }

    updateSettings({
      targetShopId: String(selectedShop.shopId ?? ''),
      targetShopName: getShopDisplayName(selectedShop),
      targetSite: normalizeSite(selectedShop.site) || selectedSite,
      listingShopMappings: upsertListingShopMapping(settings?.listingShopMappings, selectedShop),
    });
  }

  function handleMaterialDefaultChange(valueName: string) {
    if (!settings) {
      return;
    }
    const materialAttr = findMaterialAttribute(requiredAttributes);
    const attrName = materialAttr?.attrName || '材质';
    updateSettings({
      miaoshouRequiredAttributeDefaults: upsertRequiredAttributeDefault(settings.miaoshouRequiredAttributeDefaults, {
        site: selectedSite,
        cid: settings.miaoshouTargetCategoryId,
        attrName,
        valueName,
      }),
    });
  }

  if (!settings) {
    return <p className="muted">正在读取配置...</p>;
  }

  const selectedSite = normalizeSite(settings.targetSite);
  const shopsForSelectedSite = refreshedShops.filter((shop) => normalizeSite(shop.site) === selectedSite);
  const selectedShopId = shopsForSelectedSite.some((shop) => String(shop.shopId) === String(settings.targetShopId))
    ? String(settings.targetShopId)
    : '';
  const pricingTemplates = parsePricingTemplates(settings.miaoshouPricingTemplatesJson);
  const pricingTemplatesForSite = pricingTemplates.filter((template) => normalizeSite(template.site) === selectedSite);
  const selectedPricingTemplateKey = getSelectedPricingTemplateKey(
    pricingTemplates,
    settings.miaoshouPricingTemplateMappings,
    selectedSite,
  );
  const categoryCacheSummary = getCategoryCacheSummary(settings.miaoshouCategoryTreeCacheJson, selectedSite);
  const materialAttribute = findMaterialAttribute(requiredAttributes);
  const selectedMaterialDefault = getRequiredAttributeDefaultValue(settings.miaoshouRequiredAttributeDefaults, {
    site: selectedSite,
    cid: settings.miaoshouTargetCategoryId,
    attrName: materialAttribute?.attrName || '材质',
  });
  return (
    <section className="page-section settings-page listing-settings-page">
      <PageHeader
        eyebrow="AI Listing Settings"
        title="AI上架配置"
        description="AI智能上架只配置当前必要项：妙手接口、采集路径、目标店铺和结果表。定价模板和物流公式暂不接入上架编辑表。"
        action={
          <button className="primary-button" type="button" onClick={() => void saveSettings()}>
            <Save size={18} />
            保存AI上架配置
          </button>
        }
      />

      {savedMessage ? <p className="success-message settings-save-message">{savedMessage}</p> : null}

      <div className="listing-settings-grid compact-settings-grid">
        <div className="settings-column settings-column-left">
          <SettingsPanel
            className="listing-settings-api"
            icon={<KeyRound size={18} />}
            title="妙手开放平台"
            note="服务店铺查询、货源采集导入、公共采集箱、认领 TikTok 采集箱和发布前检查。"
          >
          <label className="toggle-row span-2 listing-api-enable-toggle">
            <input
              type="checkbox"
              checked={settings.enableMiaoshouListingApi}
              onChange={(event) => updateSettings({ enableMiaoshouListingApi: event.target.checked })}
            />
            <span>启用妙手自动上架（接入 AI比价执行按钮）</span>
          </label>

          <p className={settings.enableMiaoshouListingApi ? 'success-message span-2' : 'warning-message span-2'}>
            {settings.enableMiaoshouListingApi
              ? '已启用自动上架：点击 AI比价任务执行后，会在写入表二后自动生成表三，并继续推进妙手采集、认领和浏览器保存发布。AI上架页的分段执行按钮会被锁定，避免重复执行。'
              : '未启用自动上架：AI比价只自动生成表三；需要分段人工处理时，可以到 AI上架页手动执行采集、认领和浏览器保存发布。'}
          </p>

          <label className="field span-2">
            <span>妙手 API 域名</span>
            <input
              value={settings.miaoshouOpenApiBaseUrl}
              placeholder="https://openapi-erp.91miaoshou.com"
              onChange={(event) => updateSettings({ miaoshouOpenApiBaseUrl: event.target.value })}
            />
          </label>

          <label className="field span-2">
            <span>妙手 AppKey</span>
            <input
              value={settings.miaoshouOpenApiAppKey}
              placeholder="开放平台应用 AppKey"
              onChange={(event) => updateSettings({ miaoshouOpenApiAppKey: event.target.value })}
            />
          </label>

          <label className="field span-2">
            <span>妙手 AppSecret</span>
            <input
              type="password"
              value={settings.miaoshouOpenApiAppSecret}
              placeholder="开放平台应用 AppSecret"
              onChange={(event) => updateSettings({ miaoshouOpenApiAppSecret: event.target.value })}
            />
          </label>

          <label className="field span-2">
            <span>妙手账号 ID</span>
            <input
              value={settings.miaoshouOpenApiAccountId}
              placeholder="货源采集接口要求 x-account-id 时填写"
              onChange={(event) => updateSettings({ miaoshouOpenApiAccountId: event.target.value })}
            />
          </label>

          <label className="field">
            <span>自动上架每轮处理数量</span>
            <input
              min={1}
              max={20}
              type="number"
              value={settings.listingAutoRunLimit}
              onChange={(event) => updateSettings({ listingAutoRunLimit: Number(event.target.value) })}
            />
          </label>
          <p className="helper-text span-2">
            默认 1 条用于稳定调试，最大 20 条；调大后单条类目或发布失败会写回原因，同轮继续处理后续待上架记录。输入表还有空状态/待处理时，持续执行会在下一轮继续领取。
          </p>
          </SettingsPanel>

          <SettingsPanel
            className="listing-settings-flow"
            icon={<Link2 size={18} />}
            title="采集与刊登路径"
            note="默认采集原商品链接进入妙手公共采集箱；1688 链接保留给货源绑定和成本字段。"
          >
          <label className="field span-2">
            <span>妙手采集链接来源</span>
            <select
              value={settings.listingCollectSource}
              onChange={(event) => updateSettings({ listingCollectSource: event.target.value === 'offerUrl' ? 'offerUrl' : 'sourceUrl' })}
            >
              <option value="sourceUrl">原商品链接</option>
              <option value="offerUrl">1688 货源链接</option>
            </select>
          </label>

          <label className="field">
            <span>发布方式</span>
            <input value="采集/认领走接口，编辑/发布走浏览器模拟，固定保存并发布" disabled />
          </label>
          <label className="field span-2">
            <span>尺码表网络图片URL</span>
            <input
              value={settings.miaoshouSizeChartImageUrl}
              placeholder="妙手提示尺码图必传时，自动选择“使用网络图片”并填入此URL"
              onChange={(event) => updateSettings({ miaoshouSizeChartImageUrl: event.target.value })}
            />
          </label>
          <p className="helper-text span-2">
            定价模板和物流公式暂时隐藏，不写入 AI上架编辑表；如果目标类目要求尺码图，需配置可公网访问的 JPG/JPEG/PNG 图片 URL。
          </p>
          </SettingsPanel>

          <SettingsPanel
            className="listing-settings-result"
            icon={<Link2 size={18} />}
            title="AI上架结果表"
            note="浏览器模拟编辑和保存并发布的执行结果单独写入此表，不再写入 AI上架编辑表。"
            action={
              <button
                className="small-button"
                type="button"
                disabled={isEnsuringListingResultTable}
                onClick={() => void ensureListingResultTable()}
              >
                <Save size={15} />
                {isEnsuringListingResultTable ? '创建中' : '创建结果表字段'}
              </button>
            }
          >
          {listingResultTableMessage ? <p className="inline-notice span-2">{listingResultTableMessage}</p> : null}
          <label className="field">
            <span>结果表 appToken</span>
            <input
              value={settings.listingResultBitable.appToken}
              placeholder="留空时复用 AI比价三表 appToken"
              onChange={(event) => updateSettings({
                listingResultBitable: {
                  ...settings.listingResultBitable,
                  appToken: event.target.value,
                },
              })}
            />
          </label>
          <label className="field">
            <span>结果表 tableId</span>
            <input
              value={settings.listingResultBitable.tableId}
              placeholder="点击创建后自动回填"
              onChange={(event) => updateSettings({
                listingResultBitable: {
                  ...settings.listingResultBitable,
                  tableId: event.target.value,
                },
              })}
            />
          </label>
          <label className="field span-2">
            <span>结果表 viewId（可选）</span>
            <input
              value={settings.listingResultBitable.viewId}
              placeholder="为空时处理整张结果表"
              onChange={(event) => updateSettings({
                listingResultBitable: {
                  ...settings.listingResultBitable,
                  viewId: event.target.value,
                },
              })}
            />
          </label>
          </SettingsPanel>
        </div>

        <div className="settings-column settings-column-right">
          <SettingsPanel
            className="listing-settings-shop"
            icon={<Store size={18} />}
            title="店铺与站点"
            note="店铺和站点用于认领 TikTok 采集箱、选择预发布店铺和发布前检查；类目由妙手编辑页自动匹配或人工处理。"
            action={
              <>
                <button className="small-button" type="button" disabled={isExportingShopConfig} onClick={() => void exportShopConfig()}>
                  <Download size={15} />
                  {isExportingShopConfig ? '生成中' : '导出店铺配置'}
                </button>
                <button className="small-button" type="button" disabled={isRefreshingShops} onClick={() => void refreshShops()}>
                  <RefreshCw size={15} />
                  {isRefreshingShops ? '刷新中' : '在线刷新'}
                </button>
                <button className="small-button" type="button" disabled={isRefreshingCategoryTree} onClick={() => void refreshCategoryTree()}>
                  <RefreshCw size={15} />
                  {isRefreshingCategoryTree ? '类目刷新中' : '刷新类目'}
                </button>
              </>
            }
          >
            {shopConfigMessage ? <p className="inline-notice span-2">{shopConfigMessage}</p> : null}
            {categoryTreeMessage ? <p className="inline-notice span-2">{categoryTreeMessage}</p> : null}
            <label className="field">
              <span>目标站点</span>
              <select
                value={settings.targetSite}
                onChange={(event) => handleTargetSiteChange(event.target.value)}
              >
                <option value="">请选择站点</option>
                {listingSiteOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>目标店铺名称</span>
              {refreshedShops.length > 0 ? (
                <select
                  value={selectedShopId}
                  disabled={!selectedSite || shopsForSelectedSite.length === 0}
                  onChange={(event) => handleTargetShopChange(event.target.value)}
                >
                  <option value="">{shopsForSelectedSite.length > 0 ? '请选择店铺' : '当前站点没有店铺'}</option>
                  {shopsForSelectedSite.map((shop) => (
                    <option key={`${normalizeSite(shop.site)}-${shop.shopId}-${shop.shopNick ?? ''}`} value={String(shop.shopId)}>
                      {formatShopOptionLabel(shop)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={settings.targetShopName}
                  placeholder="妙手/TikTok 店铺名称"
                  onChange={(event) => updateSettings({ targetShopName: event.target.value })}
                />
              )}
            </label>

            <label className="field">
              <span>目标店铺 ID</span>
              <input
                value={settings.targetShopId}
                placeholder="查询店铺后填写 shopId"
                onChange={(event) => updateSettings({ targetShopId: event.target.value })}
              />
            </label>

            <label className="field">
              <span>类目缓存</span>
              <input value={categoryCacheSummary} disabled />
            </label>

            <label className="field">
              <span>目标类目ID</span>
              <input
                value={settings.miaoshouTargetCategoryId}
                placeholder="例如 846088"
                onChange={(event) => updateSettings({ miaoshouTargetCategoryId: event.target.value })}
              />
            </label>

            <div className="field">
              <span>必填属性</span>
              <button
                className="small-button"
                type="button"
                disabled={isRefreshingCategoryAttributes || !settings.targetSite || !settings.targetShopId || !settings.miaoshouTargetCategoryId}
                onClick={() => void refreshCategoryAttributes()}
              >
                <RefreshCw size={15} />
                {isRefreshingCategoryAttributes ? '刷新中' : '刷新类目属性'}
              </button>
            </div>

            {categoryAttributeMessage ? <p className="inline-notice span-2">{categoryAttributeMessage}</p> : null}

            <label className="field span-2">
              <span>材质默认值</span>
              <select
                value={selectedMaterialDefault}
                disabled={!materialAttribute || materialAttribute.options.length === 0}
                onChange={(event) => handleMaterialDefaultChange(event.target.value)}
              >
                <option value="">{materialAttribute ? '请选择材质默认值' : '请先刷新带材质的类目属性'}</option>
                {materialAttribute?.options.map((option) => (
                  <option key={`${option.valueId}-${option.valueName}`} value={option.valueName}>
                    {option.valueName}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>仓库名称</span>
              <input
                value={settings.miaoshouWarehouseName}
                placeholder="妙手仓库名称"
                onChange={(event) => updateSettings({ miaoshouWarehouseName: event.target.value })}
              />
            </label>

            <label className="field span-2">
              <span>多站点店铺映射</span>
              <textarea
                rows={5}
                value={settings.listingShopMappings}
                placeholder={'MY=15013562|小郭马来\nSG=店铺ID|店铺名称\nPH=店铺ID|店铺名称'}
                onChange={(event) => updateSettings({ listingShopMappings: event.target.value })}
              />
            </label>
          </SettingsPanel>

          <SettingsPanel
            className="listing-settings-pricing-template"
            icon={<Tags size={18} />}
            title="妙手定价模板"
            note="浏览器模拟编辑本地展示价时使用。采集认领仍走开放 API，编辑发布走已登录浏览器页面。"
            action={
              <button
                className="small-button"
                type="button"
                disabled={isRefreshingPricingTemplates}
                onClick={() => void refreshPricingTemplates()}
              >
                <RefreshCw size={15} />
                {isRefreshingPricingTemplates ? '刷新中' : '刷新模板'}
              </button>
            }
          >
          {pricingTemplateMessage ? <p className="inline-notice span-2">{pricingTemplateMessage}</p> : null}
          <label className="field span-2">
            <span>当前站点模板</span>
            <select
              value={selectedPricingTemplateKey}
              disabled={!selectedSite || pricingTemplatesForSite.length === 0}
              onChange={(event) => handlePricingTemplateChange(event.target.value)}
            >
              <option value="">{pricingTemplatesForSite.length > 0 ? '请选择定价模板' : '请先刷新当前站点模板'}</option>
              {pricingTemplatesForSite.map((template) => (
                <option key={getPricingTemplateKey(template)} value={getPricingTemplateKey(template)}>
                  {formatPricingTemplateLabel(template)}
                </option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            <span>站点模板映射</span>
            <textarea
              rows={4}
              value={settings.miaoshouPricingTemplateMappings}
              placeholder="MY=模板ID|模板名"
              onChange={(event) => updateSettings({ miaoshouPricingTemplateMappings: event.target.value })}
            />
          </label>
          </SettingsPanel>
        </div>
      </div>
    </section>
  );
}

type SettingsPanelProps = {
  children: ReactNode;
  className: string;
  icon: ReactNode;
  note: string;
  title: string;
  action?: ReactNode;
};

const listingSiteOptions = [
  { value: 'MY', label: 'MY - 马来西亚' },
  { value: 'SG', label: 'SG - 新加坡' },
  { value: 'PH', label: 'PH - 菲律宾' },
  { value: 'VN', label: 'VN - 越南' },
  { value: 'TH', label: 'TH - 泰国' },
];

function normalizeSite(site?: string) {
  return (site ?? '').trim().toUpperCase();
}

function getShopDisplayName(shop: MiaoshouShop) {
  const shopNick = shop.shopNick?.trim();
  return shopNick || String(shop.shopId ?? '');
}

function formatShopOptionLabel(shop: MiaoshouShop) {
  const name = getShopDisplayName(shop);
  const shopId = String(shop.shopId ?? '');
  return shopId && shopId !== name ? `${name}（${shopId}）` : name;
}

function upsertListingShopMapping(current: string | undefined, shop: MiaoshouShop) {
  const site = normalizeSite(shop.site);
  const shopId = String(shop.shopId ?? '').trim();
  if (!site || !shopId) {
    return current ?? '';
  }
  const shopName = getShopDisplayName(shop);
  const rows = (current ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => normalizeSite(line.split(/[=,]/)[0]) !== site);
  rows.push(`${site}=${shopId}${shopName ? `|${shopName}` : ''}`);
  return rows.join('\n');
}

function parsePricingTemplates(value: string): MiaoshouPricingTemplate[] {
  try {
    const parsed = JSON.parse(value || '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => item && typeof item === 'object' ? item as MiaoshouPricingTemplate : null)
      .filter((item): item is MiaoshouPricingTemplate => Boolean(item?.name || item?.priceTemplateId));
  } catch {
    return [];
  }
}

function getPricingTemplateKey(template: MiaoshouPricingTemplate) {
  return `${normalizeSite(template.site)}__${template.priceTemplateId || template.name}`;
}

function getSelectedPricingTemplateKey(templates: MiaoshouPricingTemplate[], mappings: string, site: string) {
  const mapping = parsePricingTemplateMappings(mappings).find((item) => normalizeSite(item.site) === normalizeSite(site));
  if (!mapping) {
    return '';
  }
  const matched = templates.find((template) => (
    normalizeSite(template.site) === normalizeSite(site) &&
    ((mapping.templateId && template.priceTemplateId === mapping.templateId) || template.name === mapping.templateName)
  ));
  return matched ? getPricingTemplateKey(matched) : '';
}

function parsePricingTemplateMappings(value: string) {
  return (value ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [site = '', right = ''] = line.split(/=(.*)/s);
      const [templateId = '', templateName = ''] = right.split('|');
      return { site, templateId: templateId.trim(), templateName: templateName.trim() };
    });
}

function upsertPricingTemplateMapping(current: string | undefined, template: MiaoshouPricingTemplate) {
  const site = normalizeSite(template.site);
  const rows = (current ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => normalizeSite(line.split(/[=,]/)[0]) !== site);
  rows.push(`${site}=${template.priceTemplateId || ''}|${template.name}`);
  return rows.join('\n');
}

function removePricingTemplateMapping(current: string | undefined, site: string) {
  return (current ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => normalizeSite(line.split(/[=,]/)[0]) !== normalizeSite(site))
    .join('\n');
}

type RequiredAttributeDefaultMapping = {
  site: string;
  cid: string;
  attrName: string;
  valueName: string;
};

function findMaterialAttribute(attributes: MiaoshouRequiredAttribute[]) {
  return attributes.find((attribute) => normalizeText(attribute.attrName) === normalizeText('材质'));
}

function parseRequiredAttributeDefaults(value: string | undefined): RequiredAttributeDefaultMapping[] {
  return String(value ?? '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalizedLine = line.replace(/｜/g, '|').replace(/＝/g, '=');
      const match = normalizedLine.match(/^([^|]+)\|([^|]+)\|([^=]+)=(.+)$/);
      if (!match) {
        return null;
      }
      return {
        site: normalizeSite(match[1]),
        cid: match[2].trim(),
        attrName: match[3].trim(),
        valueName: match[4].trim(),
      };
    })
    .filter((item): item is RequiredAttributeDefaultMapping => Boolean(item?.site && item.cid && item.attrName && item.valueName));
}

function upsertRequiredAttributeDefault(current: string | undefined, mapping: RequiredAttributeDefaultMapping) {
  const site = normalizeSite(mapping.site);
  const cid = mapping.cid.trim();
  const attrName = mapping.attrName.trim();
  const valueName = mapping.valueName.trim();
  const rows = parseRequiredAttributeDefaults(current)
    .filter((item) => !(
      normalizeSite(item.site) === site &&
      item.cid === cid &&
      normalizeText(item.attrName) === normalizeText(attrName)
    ));
  if (site && cid && attrName && valueName) {
    rows.push({ site, cid, attrName, valueName });
  }
  return rows.map((item) => `${item.site}|${item.cid}|${item.attrName}=${item.valueName}`).join('\n');
}

function getRequiredAttributeDefaultValue(
  current: string | undefined,
  input: { site: string; cid: string; attrName: string },
) {
  const match = parseRequiredAttributeDefaults(current).find((item) => (
    normalizeSite(item.site) === normalizeSite(input.site) &&
    item.cid === input.cid.trim() &&
    normalizeText(item.attrName) === normalizeText(input.attrName)
  ));
  return match?.valueName ?? '';
}

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function formatPricingTemplateLabel(template: MiaoshouPricingTemplate) {
  const id = template.priceTemplateId ? ` / ${template.priceTemplateId}` : '';
  const profit = template.profitPercent != null ? ` / 利润 ${template.profitPercent}` : '';
  return `${template.name}${id}${profit}`;
}

function getCategoryCacheSummary(cacheJson: string, site: string) {
  if (!site) {
    return '请选择目标站点';
  }
  try {
    const parsed = JSON.parse(cacheJson || '{}') as Record<string, unknown>;
    const categories = parsed[normalizeSite(site)];
    if (!Array.isArray(categories)) {
      return `${site} 未刷新`;
    }
    return `${site} 已缓存 ${categories.length} 个类目`;
  } catch {
    return `${site} 类目缓存无效`;
  }
}

function SettingsPanel({ children, className, icon, note, title, action }: SettingsPanelProps) {
  return (
    <article className={`panel settings-card listing-settings-card ${className}`}>
      <div className="settings-card-header">
        <span className="settings-card-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
        {action ? <div className="settings-card-action">{action}</div> : null}
      </div>
      <div className="settings-form-grid">{children}</div>
    </article>
  );
}
