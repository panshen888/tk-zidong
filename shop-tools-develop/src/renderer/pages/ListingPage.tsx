import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FolderOpen, PackageCheck, RefreshCw, RotateCcw, Send, Settings, Store } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import type { AppSettings, Task, TaskLogEntry, TaskRun, TaskStatus } from '../../shared/types';

const statusLabels: Record<TaskStatus, string> = {
  pending: '待执行',
  running: '运行中',
  success: '成功',
  partial_failed: '部分失败',
  failed: '失败',
  cancelled: '已中断',
  skipped: '已跳过',
};

export function ListingPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTaskRuns, setSelectedTaskRuns] = useState<TaskRun[]>([]);
  const [focusedRun, setFocusedRun] = useState<TaskRun | null>(null);
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const feishuTasks = useMemo(() => tasks.filter((task) => task.inputSource === 'feishuBitable'), [tasks]);
  const selectedTask = useMemo(
    () => feishuTasks.find((task) => task.id === selectedTaskId) ?? feishuTasks[0] ?? null,
    [feishuTasks, selectedTaskId],
  );
  const miaoshouListingApiEnabled = Boolean(settings?.enableMiaoshouListingApi);
  const manualActionsDisabled = miaoshouListingApiEnabled;
  const activeTask = useMemo(
    () => tasks.find((task) => task.status === 'running' || (Boolean(task.currentRunId) && task.status === 'pending')) ?? null,
    [tasks],
  );

  useEffect(() => {
    void Promise.all([window.appApi.getSettings(), window.appApi.listTasks()]).then(async ([nextSettings, nextTasks]) => {
      setSettings(nextSettings);
      setTasks(nextTasks);
      const firstTask = nextTasks.find((task) => task.inputSource === 'feishuBitable') ?? null;
      setSelectedTaskId(firstTask?.id ?? '');
      if (firstTask) {
        await loadTaskRuns(firstTask.id);
      }
    });
  }, []);

  async function loadTaskRuns(taskId: string) {
    const runs = await window.appApi.listTaskRuns(taskId);
    const nextFocusedRun = runs.find((run) => run.status === 'running') ?? runs[0] ?? null;
    setSelectedTaskRuns(runs);
    setFocusedRun(nextFocusedRun);
    setLogs(nextFocusedRun ? await window.appApi.getRunLogEntries(nextFocusedRun.id) : []);
  }

  async function refreshTasks(preferredTaskId = selectedTaskId) {
    const nextTasks = await window.appApi.listTasks();
    setTasks(nextTasks);
    const nextTaskId = preferredTaskId && nextTasks.some((task) => task.id === preferredTaskId)
      ? preferredTaskId
      : nextTasks.find((task) => task.inputSource === 'feishuBitable')?.id ?? '';
    setSelectedTaskId(nextTaskId);
    if (nextTaskId) {
      await loadTaskRuns(nextTaskId);
    } else {
      setSelectedTaskRuns([]);
      setFocusedRun(null);
      setLogs([]);
    }
  }

  async function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
    await loadTaskRuns(taskId);
  }

  async function runAction(action: () => Promise<string>) {
    setIsBusy(true);
    try {
      setMessage(await action());
      await refreshTasks(selectedTaskId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI智能上架流程执行失败。');
    } finally {
      setIsBusy(false);
    }
  }

  function getManualDisabledReason() {
    return '已启用妙手自动上架：入口在 AI比价任务的“执行”按钮。该按钮会先完成比价、生成表三，再继续妙手采集、认领和浏览器保存发布。';
  }

  async function queryShops() {
    const result = await window.appApi.queryMiaoshouShops({
      platform: 'tiktok',
      site: settings?.targetSite,
    });
    const firstShop = result.shops[0];
    return firstShop
      ? `已查询到 ${result.shops.length} 个 TikTok 授权店铺。首个店铺：${firstShop.shopNick ?? firstShop.shopId} / ${firstShop.site} / ${firstShop.status ?? 'unknown'}。`
      : '未查询到可用 TikTok 店铺，请检查妙手开放平台应用权限、IP 白名单和店铺授权。';
  }

  async function collectFromApprovedReviewRows(task: Task) {
    const result = await window.appApi.generateMiaoshouListingEditTable({
      taskId: task.id,
      site: settings?.targetSite,
      shopId: settings?.targetShopId,
      shopName: settings?.targetShopName,
      autoGenerateReviewFromLatestOutput: false,
      autoApproveLatestReview: false,
    });
    return `已从表三已审核记录开始采集认领：扫描 ${result.scannedCount} 条，新增 ${result.createdCount} 条，推进 ${result.updatedCount} 条，跳过 ${result.skippedCount} 条，失败 ${result.failedCount} 条。`;
  }

  async function retryCollectFromApprovedReviewRows(task: Task) {
    const result = await window.appApi.generateMiaoshouListingEditTable({
      taskId: task.id,
      site: settings?.targetSite,
      shopId: settings?.targetShopId,
      shopName: settings?.targetShopName,
      retryFailedOnly: true,
    });
    return `采集认领失败重试完成：扫描 ${result.scannedCount} 条，新增 ${result.createdCount} 条，推进 ${result.updatedCount} 条，跳过 ${result.skippedCount} 条，失败 ${result.failedCount} 条。`;
  }

  async function publishListingProducts(task: Task) {
    const result = await window.appApi.publishMiaoshouListingProductsByBrowser({
      taskId: task.id,
    });
    return `浏览器保存并发布完成：扫描 ${result.scannedCount} 条，执行 ${result.executedCount} 条，跳过 ${result.skippedCount} 条，失败 ${result.failedCount} 条。结果已写入 AI上架结果表。`;
  }

  async function retryPublishListingProducts(task: Task) {
    const result = await window.appApi.publishMiaoshouListingProductsByBrowser({
      taskId: task.id,
      failedOnly: true,
    });
    return `浏览器发布失败重试完成：扫描 ${result.scannedCount} 条，执行 ${result.executedCount} 条，跳过 ${result.skippedCount} 条，失败 ${result.failedCount} 条。`;
  }

  return (
    <section className="page-section listing-page">
      <PageHeader
        eyebrow="AI Listing"
        title="AI智能上架"
        description="自动模式由 AI比价按钮串起：表一 -> 表二 -> 表三 -> 妙手采集认领 -> 浏览器保存发布。手工模式从表三已审核记录开始继续上架。"
        action={
          <Link className="ghost-button" to="/listing/settings">
            <Settings size={18} />
            AI上架配置
          </Link>
        }
      />

      <div className="admin-page-stack">
        {message ? <p className="inline-notice">{message}</p> : null}
        {activeTask ? (
          <p className="inline-notice">
            当前只允许同时执行一个任务；正在执行「{activeTask.name}」，其他执行按钮会暂时禁用。
          </p>
        ) : null}
        {miaoshouListingApiEnabled ? (
          <p className="success-message">
            自动上架已启用。请到 AI智能比价页点击任务“执行”；AI上架页只保留查询、任务选择和日志查看，手工执行按钮已锁定，避免重复采集或重复发布。
          </p>
        ) : (
          <p className="warning-message">
            当前是手工分段上架模式：先在表三把目标记录改为“已审核”，再用下方按钮从表三继续采集认领、浏览器保存并发布。
          </p>
        )}

        <article className="panel listing-manual-panel">
          <div className="panel-title">
            <div>
              <h3>手工上架控制</h3>
              <p className="helper-text">
                手工执行从表三开始，只读取状态为“已审核”的记录；不会重新跑比价，也不会重新生成表三。
              </p>
            </div>
            <button className="small-button" type="button" disabled={isBusy} onClick={() => runAction(queryShops)}>
              <Store size={16} />
              查询店铺
            </button>
          </div>
          <div className="listing-manual-toolbar">
            <button
              className="primary-button"
              type="button"
              disabled={!selectedTask || isBusy || manualActionsDisabled}
              title={manualActionsDisabled ? getManualDisabledReason() : ''}
              onClick={() => selectedTask && runAction(() => collectFromApprovedReviewRows(selectedTask))}
            >
              <Send size={16} />
              从表三采集认领
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={!selectedTask || isBusy || manualActionsDisabled}
              title={manualActionsDisabled ? getManualDisabledReason() : ''}
              onClick={() => selectedTask && runAction(() => retryCollectFromApprovedReviewRows(selectedTask))}
            >
              <RotateCcw size={16} />
              重试采集认领
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!selectedTask || isBusy || manualActionsDisabled}
              title={manualActionsDisabled ? getManualDisabledReason() : ''}
              onClick={() => selectedTask && runAction(() => publishListingProducts(selectedTask))}
            >
              <PackageCheck size={16} />
              保存并发布
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={!selectedTask || isBusy || manualActionsDisabled}
              title={manualActionsDisabled ? getManualDisabledReason() : ''}
              onClick={() => selectedTask && runAction(() => retryPublishListingProducts(selectedTask))}
            >
              <RotateCcw size={16} />
              重试发布
            </button>
          </div>
          {manualActionsDisabled ? <p className="helper-text">{getManualDisabledReason()}</p> : null}
        </article>

        <article className="panel admin-table-card">
          <div className="panel-title">
            <div className="table-title-group">
              <h3>比价任务列表</h3>
              <span className="badge">{feishuTasks.length} 个飞书任务</span>
            </div>
            <div className="table-toolbar">
              <button className="small-button" type="button" onClick={() => void refreshTasks(selectedTaskId)}>
                <RefreshCw size={16} />
                刷新
              </button>
            </div>
          </div>

          {feishuTasks.length === 0 ? (
            <div className="empty-state">
              <strong>暂无飞书比价任务</strong>
              <p>请先在 AI智能比价 中创建飞书任务。自动模式和手工模式都依赖同一个比价任务配置。</p>
            </div>
          ) : (
            <div className="admin-table-wrap listing-task-table-wrap">
              <table className="admin-table listing-task-table">
                <thead>
                  <tr>
                    <th>任务名称</th>
                    <th>状态</th>
                    <th>输出表</th>
                    <th>成功/失败/总数</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {feishuTasks.map((task) => (
                    <tr key={task.id} className={task.id === selectedTaskId ? 'is-selected' : ''} onClick={() => void selectTask(task.id)}>
                      <td><strong>{task.name}</strong></td>
                      <td><span className={`status-pill status-${task.status}`}>{statusLabels[task.status]}</span></td>
                      <td className="path-cell" title={task.outputBitable?.tableId || ''}>{task.outputBitable?.tableId || '未配置'}</td>
                      <td>{task.successCount}/{task.failedCount}/{task.totalCount}</td>
                      <td>{new Date(task.createdAt).toLocaleString()}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="table-action-group secondary-actions listing-action-group">
                          <button className="text-button" type="button" onClick={() => void selectTask(task.id)}>详情</button>
                          <button className="text-button" type="button" onClick={() => void window.appApi.openPath(task.assetDir)}>资产</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel log-card">
          <div className="panel-title">
            <h3>{selectedTask ? `当前日志：${selectedTask.name}` : '当前日志'}</h3>
            <div className="button-row log-toolbar">
              <button className="small-button" type="button" onClick={() => void refreshTasks(selectedTaskId)} disabled={!selectedTask || isBusy}>
                <RefreshCw size={16} />
                刷新日志
              </button>
            </div>
          </div>

          {selectedTask ? (
            <>
              <div className="run-summary-bar">
                <span title={focusedRun?.name ?? selectedTask.name}>
                  当前执行：{focusedRun?.name ?? '暂无'}
                </span>
                <span>执行次数：{selectedTaskRuns.length}</span>
                <div className="run-summary-actions">
                  <button className="text-button" type="button" onClick={() => void window.appApi.openPath(selectedTask.assetDir)}>
                    <FolderOpen size={14} />
                    任务资产
                  </button>
                  {focusedRun ? (
                    <>
                      <button className="text-button" type="button" onClick={() => void window.appApi.openPath(focusedRun.outputExcelPath)}>
                        <ExternalLink size={14} />
                        输出 Excel
                      </button>
                      <button className="text-button" type="button" onClick={() => void window.appApi.openPath(focusedRun.assetDir)}>
                        <FolderOpen size={14} />
                        执行资产
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="log-list task-log-list">
                {logs.length === 0 ? <p className="muted">该任务还没有执行日志，或还没有选择具体执行记录。</p> : null}
                {logs.map((log) => (
                  <div className={`log-entry ${log.level}`} key={log.id}>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <p>{log.message}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">选择一个比价任务查看自动上架或手工上架的执行日志。</p>
          )}
        </article>
      </div>
    </section>
  );
}
