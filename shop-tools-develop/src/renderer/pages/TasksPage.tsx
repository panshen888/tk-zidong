import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FilePlus2, FolderOpen, ListTree, MonitorUp, Play, RefreshCw, SlidersHorizontal, Square, Trash2, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import type { AppSettings, FeishuBitableConfig, Task, TaskInputSource, TaskLogEntry, TaskRun, TaskStatus } from '../../shared/types';

const statusLabels: Record<TaskStatus, string> = {
  pending: '待开始',
  running: '运行中',
  skipped: '已跳过',
  success: '成功',
  partial_failed: '部分失败',
  failed: '失败',
  cancelled: '已取消',
};

export function TasksPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskRuns, setSelectedTaskRuns] = useState<TaskRun[]>([]);
  const [focusedRun, setFocusedRun] = useState<TaskRun | null>(null);
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [runModalTask, setRunModalTask] = useState<Task | null>(null);
  const [modalRuns, setModalRuns] = useState<TaskRun[]>([]);
  const [modalLogs, setModalLogs] = useState<TaskLogEntry[]>([]);
  const [modalFocusedRunId, setModalFocusedRunId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [inputSource, setInputSource] = useState<TaskInputSource>('feishuBitable');
  const [inputExcelPath, setInputExcelPath] = useState('');
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [inputBitable, setInputBitable] = useState<FeishuBitableConfig>({ appToken: '', tableId: '', viewId: '' });
  const [outputBitable, setOutputBitable] = useState<FeishuBitableConfig>({ appToken: '', tableId: '', viewId: '' });
  const [reviewBitable, setReviewBitable] = useState<FeishuBitableConfig>({ appToken: '', tableId: '', viewId: '' });
  const [candidateLimit, setCandidateLimit] = useState(50);
  const [acceptedCandidateLimit, setAcceptedCandidateLimit] = useState(3);
  const [sourcingMode, setSourcingMode] = useState<AppSettings['sourcingMode']>('fast');
  const [loginBrowserMessage, setLoginBrowserMessage] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isEnsuringTables, setIsEnsuringTables] = useState(false);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, tasks]);
  const activeTask = useMemo(
    () => tasks.find((task) => task.status === 'running' || (Boolean(task.currentRunId) && task.status === 'pending')) ?? null,
    [tasks],
  );
  const hasRealtimeTask = useMemo(() => tasks.some((task) => task.realtimeEnabled), [tasks]);

  const loadTaskRuns = useCallback(async (taskId: string) => {
    const runs = await window.appApi.listTaskRuns(taskId);
    setSelectedTaskRuns(runs);
    const nextFocusedRun = runs.find((run) => run.status === 'running') ?? runs[0] ?? null;
    setFocusedRun(nextFocusedRun);
    setLogs(nextFocusedRun ? await window.appApi.getRunLogEntries(nextFocusedRun.id) : []);
  }, []);

  const refreshRunModal = useCallback(
    async (task: Task) => {
      const runs = await window.appApi.listTaskRuns(task.id);
      setModalRuns(runs);
      const nextFocusedRunId = modalFocusedRunId && runs.some((run) => run.id === modalFocusedRunId)
        ? modalFocusedRunId
        : runs[0]?.id ?? null;
      setModalFocusedRunId(nextFocusedRunId);
      setModalLogs(nextFocusedRunId ? await window.appApi.getRunLogEntries(nextFocusedRunId) : []);
    },
    [modalFocusedRunId],
  );

  const refreshTasks = useCallback(
    async (preferredTaskId?: string) => {
      const taskList = await window.appApi.listTasks();
      setTasks(taskList);
      const nextSelectedTaskId = preferredTaskId && taskList.some((task) => task.id === preferredTaskId)
        ? preferredTaskId
        : selectedTaskId && taskList.some((task) => task.id === selectedTaskId)
          ? selectedTaskId
          : taskList[0]?.id ?? null;
      setSelectedTaskId(nextSelectedTaskId);
      if (nextSelectedTaskId) {
        await loadTaskRuns(nextSelectedTaskId);
      } else {
        setSelectedTaskRuns([]);
        setFocusedRun(null);
        setLogs([]);
      }
    },
    [loadTaskRuns, selectedTaskId],
  );

  useEffect(() => {
    void Promise.all([window.appApi.getSettings(), window.appApi.listTasks()]).then(async ([appSettings, taskList]) => {
      setSettings(appSettings);
      setCandidateLimit(appSettings.candidateLimit);
      setAcceptedCandidateLimit(appSettings.acceptedCandidateLimit);
      setSourcingMode(appSettings.sourcingMode);
      setFeishuAppId(appSettings.feishuAppId);
      setFeishuAppSecret(appSettings.feishuAppSecret);
      setInputBitable(appSettings.priceInputBitable.tableId ? appSettings.priceInputBitable : appSettings.lastFeishuInputBitable);
      setOutputBitable(appSettings.priceOutputBitable.tableId ? appSettings.priceOutputBitable : appSettings.lastFeishuOutputBitable);
      setReviewBitable(appSettings.priceReviewBitable);
      setTasks(taskList);
      const firstTaskId = taskList[0]?.id ?? null;
      setSelectedTaskId(firstTaskId);
      if (firstTaskId) {
        await loadTaskRuns(firstTaskId);
      }
    });
  }, [loadTaskRuns]);

  useEffect(() => {
    if (!activeTask && !hasRealtimeTask) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshTasks(selectedTaskId ?? undefined);
      if (runModalTask) {
        void refreshRunModal(runModalTask);
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeTask, hasRealtimeTask, refreshRunModal, refreshTasks, runModalTask, selectedTaskId]);

  async function chooseExcelFile() {
    const filePath = await window.appApi.selectExcelFile();
    if (filePath) {
      setInputExcelPath(filePath);
    }
  }

  async function openLoginBrowser() {
    try {
      const nextSettings = await window.appApi.openLoginBrowser();
      setSettings(nextSettings);
      setLoginBrowserMessage('登录浏览器已打开。请在该窗口完成 1688、郑和数据、妙手登录后再执行任务。');
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '打开登录浏览器失败');
    }
  }

  async function createFeishuTaskTables() {
    if (!settings) {
      return;
    }

    const appToken = inputBitable.appToken.trim() || outputBitable.appToken.trim() || reviewBitable.appToken.trim();
    if (!feishuAppId.trim() || !feishuAppSecret.trim() || !appToken) {
      setLoginBrowserMessage('请先填写飞书 app_id、app_secret，并至少填写一个 app_token。');
      return;
    }

    setIsEnsuringTables(true);
    try {
      await window.appApi.saveSettings({
        ...settings,
        feishuAppId,
        feishuAppSecret,
        priceInputBitable: { ...inputBitable, appToken: inputBitable.appToken || appToken },
        priceOutputBitable: { ...outputBitable, appToken: outputBitable.appToken || appToken },
        priceReviewBitable: { ...reviewBitable, appToken: reviewBitable.appToken || appToken },
      });
      const result = await window.appApi.ensurePriceComparisonTables();
      setInputBitable(result.inputBitable);
      setOutputBitable(result.outputBitable);
      setReviewBitable(result.reviewBitable);
      const nextSettings = await window.appApi.getSettings();
      setSettings(nextSettings);
      setLoginBrowserMessage('飞书三表已创建或补齐：输入表、输出货源表、待人工核实上架表。');
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '创建飞书三表失败，请检查飞书应用权限和 app_token。');
    } finally {
      setIsEnsuringTables(false);
    }
  }

  function openCreateModal(source: TaskInputSource) {
    setInputSource(source);
    setInputExcelPath('');
    setFeishuAppId(settings?.feishuAppId ?? '');
    setFeishuAppSecret(settings?.feishuAppSecret ?? '');
    setInputBitable(settings?.priceInputBitable.tableId ? settings.priceInputBitable : settings?.lastFeishuInputBitable ?? { appToken: '', tableId: '', viewId: '' });
    setOutputBitable(settings?.priceOutputBitable.tableId ? settings.priceOutputBitable : settings?.lastFeishuOutputBitable ?? { appToken: '', tableId: '', viewId: '' });
    setReviewBitable(settings?.priceReviewBitable ?? { appToken: '', tableId: '', viewId: '' });
    setCandidateLimit(settings?.candidateLimit ?? 50);
    setAcceptedCandidateLimit(settings?.acceptedCandidateLimit ?? 3);
    setSourcingMode(settings?.sourcingMode ?? 'fast');
    setIsCreateModalOpen(true);
  }

  async function createTask() {
    if (inputSource === 'excel' && !inputExcelPath.trim()) {
      return;
    }
    if (
      inputSource === 'feishuBitable' &&
      (!feishuAppId.trim() || !feishuAppSecret.trim() || !inputBitable.appToken.trim() || !outputBitable.appToken.trim())
    ) {
      setLoginBrowserMessage('请先填写飞书 app_id、app_secret，并粘贴输入/输出多维表格链接');
      return;
    }

    setIsCreatingTask(true);
    try {
      const task = await window.appApi.createTask({
        inputSource,
        inputExcelPath: inputSource === 'excel' ? inputExcelPath : undefined,
        inputBitable: inputSource === 'feishuBitable' ? inputBitable : undefined,
        outputBitable: inputSource === 'feishuBitable' ? outputBitable : undefined,
        reviewBitable: inputSource === 'feishuBitable' ? reviewBitable : undefined,
        feishuAppId: inputSource === 'feishuBitable' ? feishuAppId : undefined,
        feishuAppSecret: inputSource === 'feishuBitable' ? feishuAppSecret : undefined,
        candidateLimit,
        acceptedCandidateLimit,
        sourcingMode,
        parseDetail: true,
        outputDir: settings?.defaultAssetDir,
      });

      setInputExcelPath('');
      setIsCreateModalOpen(false);
      setLoginBrowserMessage('');
      const nextSettings = await window.appApi.getSettings();
      setSettings(nextSettings);
      setFeishuAppId(nextSettings.feishuAppId);
      setFeishuAppSecret(nextSettings.feishuAppSecret);
      setReviewBitable(nextSettings.priceReviewBitable);
      await refreshTasks(task.id);
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '创建任务失败，请检查飞书配置和表格权限');
    } finally {
      setIsCreatingTask(false);
    }
  }

  async function startTask(taskId: string) {
    if (activeTask && activeTask.id !== taskId) {
      setLoginBrowserMessage(`任务「${activeTask.name}」正在执行，请先等待完成或中断后再启动其他任务。`);
      return;
    }

    try {
      await window.appApi.startTask(taskId);
      setLoginBrowserMessage('');
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '已有任务正在执行，请稍后再试。');
    }
    await refreshTasks(taskId);
  }

  async function cancelTask(taskId: string) {
    await window.appApi.cancelTask(taskId);
    await refreshTasks(taskId);
  }

  async function startRealtimeTask(taskId: string) {
    try {
      await window.appApi.startRealtimeTask(taskId);
      setLoginBrowserMessage('持续执行已启动：系统会按 AI比价配置间隔，每次领取 1 行空状态/「待处理」/「待核实」记录，并跳过已完成。');
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '持续执行启动失败，请检查配置。');
    }
    await refreshTasks(taskId);
  }

  async function retryFailedTask(taskId: string) {
    if (activeTask && activeTask.id !== taskId) {
      setLoginBrowserMessage(`任务「${activeTask.name}」正在执行，请先等待完成或中断后再重跑失败。`);
      return;
    }

    try {
      await window.appApi.retryFailedTask(taskId);
      setLoginBrowserMessage('已启动重跑失败：只处理状态为「失败」的记录。');
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '重跑失败启动失败。');
    }
    await refreshTasks(taskId);
  }

  async function stopRealtimeTask(taskId: string) {
    try {
      await window.appApi.stopRealtimeTask(taskId);
      setLoginBrowserMessage('持续执行已停止。');
    } catch (error) {
      setLoginBrowserMessage(error instanceof Error ? error.message : '持续执行停止失败。');
    }
    await refreshTasks(taskId);
  }

  async function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
    await loadTaskRuns(taskId);
  }

  async function deleteTask(task: Task) {
    const confirmed = window.confirm(`确定删除任务「${task.name}」吗？这会同时删除该任务的全部执行日志、输入、输出和资产。`);
    if (!confirmed) {
      return;
    }

    const nextTasks = await window.appApi.deleteTask(task.id);
    setTasks(nextTasks);
    if (selectedTaskId === task.id) {
      const nextTaskId = nextTasks[0]?.id ?? null;
      setSelectedTaskId(nextTaskId);
      if (nextTaskId) {
        await loadTaskRuns(nextTaskId);
      } else {
        setSelectedTaskRuns([]);
        setFocusedRun(null);
        setLogs([]);
      }
    }
    if (runModalTask?.id === task.id) {
      closeRunModal();
    }
  }

  async function clearAllTasks() {
    if (tasks.length === 0) {
      return;
    }

    const confirmed = window.confirm('确定清除全部任务吗？这会删除所有任务、执行日志、输入、输出和资产目录。');
    if (!confirmed) {
      return;
    }

    const nextTasks = await window.appApi.clearTasks();
    setTasks(nextTasks);
    setSelectedTaskId(null);
    setSelectedTaskRuns([]);
    setFocusedRun(null);
    setLogs([]);
    closeRunModal();
  }

  async function openRunModal(task: Task) {
    setRunModalTask(task);
    setModalFocusedRunId(null);
    await refreshRunModal(task);
  }

  function closeRunModal() {
    setRunModalTask(null);
    setModalRuns([]);
    setModalLogs([]);
    setModalFocusedRunId(null);
  }

  async function selectModalRun(run: TaskRun) {
    setModalFocusedRunId(run.id);
    setModalLogs(await window.appApi.getRunLogEntries(run.id));
  }

  async function deleteRun(run: TaskRun) {
    const confirmed = window.confirm(`确定删除执行日志「${run.name}」吗？这会删除该条日志相关的输入、输出、日志和资产。`);
    if (!confirmed) {
      return;
    }

    const nextRuns = await window.appApi.deleteTaskRun(run.id);
    setModalRuns(nextRuns);
    await refreshTasks(run.taskId);
    const nextFocusedRunId = nextRuns[0]?.id ?? null;
    setModalFocusedRunId(nextFocusedRunId);
    setModalLogs(nextFocusedRunId ? await window.appApi.getRunLogEntries(nextFocusedRunId) : []);
  }

  return (
    <section className="page-section tasks-page">
      <PageHeader
        eyebrow="AI Price Compare"
        title="AI智能比价"
        description="上传已选品商品的 Excel，用 AI 对比原图与 1688 货源图片相似度，并在高相似候选中筛出低价可用商品。每次执行都会生成独立日志，并关联输出 Excel 与资产目录。"
        action={
          <Link className="ghost-button" to="/tasks/settings">
            <SlidersHorizontal size={18} />
            AI比价配置
          </Link>
        }
      />

      <div className="admin-page-stack">
        {loginBrowserMessage ? <p className="inline-notice">{loginBrowserMessage}</p> : null}
        {activeTask ? (
          <p className="inline-notice">
            当前只允许同时执行一个任务；正在执行「{activeTask.name}」，其他任务会暂时禁用执行按钮。
          </p>
        ) : null}

        <div className="task-create-toolbar">
          <button className="login-browser-button" type="button" onClick={() => void openLoginBrowser()}>
            <MonitorUp size={14} />
            打开登录浏览器
          </button>
          <button className="primary-button" type="button" onClick={() => openCreateModal('feishuBitable')}>
            <FilePlus2 size={14} />
            新建飞书表格任务
          </button>
          <button className="ghost-button" type="button" onClick={() => openCreateModal('excel')}>
            <FilePlus2 size={14} />
            新建本地任务
          </button>
        </div>

        <article className="panel admin-table-card">
          <div className="panel-title">
            <div className="table-title-group">
              <h3>任务列表</h3>
              <span className="badge">{tasks.length} 个任务</span>
            </div>
            <div className="table-toolbar">
              <button className="small-button" type="button" onClick={() => void refreshTasks(selectedTaskId ?? undefined)}>
                <RefreshCw size={16} />
                刷新
              </button>
              <button className="small-danger-button" type="button" onClick={() => void clearAllTasks()} disabled={tasks.length === 0}>
                <Trash2 size={16} />
                清除全部任务
              </button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state">
              <strong>暂无任务</strong>
              <p>先打开登录浏览器完成账号登录，再新建飞书表格任务或本地任务。</p>
            </div>
          ) : (
            <div className="admin-table-wrap task-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>任务名称</th>
                    <th>状态</th>
                    <th>输入文件</th>
                    <th>候选/采纳</th>
                    <th>成功/失败/总数</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className={task.id === selectedTaskId ? 'is-selected' : ''} onClick={() => void selectTask(task.id)}>
                      <td>
                        <strong>{task.name}</strong>
                      </td>
                      <td>
                        <span className={`status-pill status-${task.status}`}>{statusLabels[task.status]}</span>
                      </td>
                      <td className="path-cell" title={task.inputExcelPath}>
                        {task.inputSource === 'feishuBitable' ? '飞书多维表格' : task.inputExcelPath}
                      </td>
                      <td>{task.sourcingMode === 'fast' ? '快速' : '精准'} {task.candidateLimit}/{task.acceptedCandidateLimit}</td>
                      <td>{task.successCount}/{task.failedCount}/{task.totalCount}</td>
                      <td>{new Date(task.createdAt).toLocaleString()}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="table-action-row">
                          <div className="table-action-group primary-actions">
                            <button
                              className="text-button action-strong"
                              type="button"
                              onClick={() => void startTask(task.id)}
                              disabled={task.status === 'running' || Boolean(activeTask && activeTask.id !== task.id)}
                            >
                              执行
                            </button>
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => void retryFailedTask(task.id)}
                              disabled={task.status === 'running' || Boolean(activeTask && activeTask.id !== task.id)}
                            >
                              重跑失败
                            </button>
                            {task.realtimeEnabled ? (
                              <button className="text-danger-button" type="button" onClick={() => void stopRealtimeTask(task.id)}>停止持续</button>
                            ) : (
                              <button className="text-button" type="button" onClick={() => void startRealtimeTask(task.id)}>持续执行</button>
                            )}
                            {task.status === 'running' ? (
                              <button className="text-danger-button" type="button" onClick={() => void cancelTask(task.id)}>中断</button>
                            ) : null}
                          </div>
                          <div className="table-action-group secondary-actions">
                            <button className="text-button" type="button" onClick={() => void selectTask(task.id)}>详情</button>
                            <button className="text-button" type="button" onClick={() => void window.appApi.openPath(task.assetDir)}>资产</button>
                            <button className="text-button" type="button" onClick={() => void openRunModal(task)}>日志</button>
                            <button className="text-danger-button" type="button" onClick={() => void deleteTask(task)}>删除</button>
                          </div>
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
            {selectedTask ? (
              <div className="button-row log-toolbar">
                <button
                  className="small-button"
                  type="button"
                  onClick={() => void startTask(selectedTask.id)}
                  disabled={selectedTask.status === 'running' || Boolean(activeTask && activeTask.id !== selectedTask.id)}
                >
                  <Play size={16} />
                  执行
                </button>
                <button
                  className="small-button"
                  type="button"
                  onClick={() => void retryFailedTask(selectedTask.id)}
                  disabled={selectedTask.status === 'running' || Boolean(activeTask && activeTask.id !== selectedTask.id)}
                >
                  <RefreshCw size={16} />
                  重跑失败
                </button>
                {selectedTask.status === 'running' ? (
                  <button className="small-danger-button" type="button" onClick={() => void cancelTask(selectedTask.id)}>
                    <Square size={16} />
                    中断
                  </button>
                ) : null}
                {selectedTask.realtimeEnabled ? (
                  <button className="small-danger-button" type="button" onClick={() => void stopRealtimeTask(selectedTask.id)}>
                    <Square size={16} />
                    停止持续
                  </button>
                ) : (
                  <button className="small-button" type="button" onClick={() => void startRealtimeTask(selectedTask.id)}>
                    <RefreshCw size={16} />
                    持续执行
                  </button>
                )}
                <button className="small-button" type="button" onClick={() => void openRunModal(selectedTask)}>
                  <ListTree size={16} />
                  日志列表
                </button>
              </div>
            ) : null}
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
                {logs.length === 0 ? <p className="muted">该任务还没有执行日志。点击“执行”开始一次采集。</p> : null}
                {logs.map((log) => (
                  <div className={`log-entry ${log.level}`} key={log.id}>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <p>{log.message}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">选择一个任务查看正在执行或最新一次执行日志。</p>
          )}
        </article>
      </div>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCreateModalOpen(false)}>
          <section className="modal-card create-task-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Create</span>
                <h3 id="create-task-title">{inputSource === 'feishuBitable' ? '新建飞书表格任务' : '新建本地任务'}</h3>
              </div>
              <button className="icon-button" type="button" aria-label="关闭" onClick={() => setIsCreateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className={`create-task-grid ${inputSource === 'excel' ? 'local-task-grid' : 'feishu-task-grid'}`}>
              <div className="create-task-main">
                {inputSource === 'excel' ? (
                  <SectionCard title="本地 Excel 来源" description="选择本机选品表，系统会按状态列扫描并回写结果。">
                    <label className="field">
                      <span>Excel 文件</span>
                      <div className="file-picker">
                        <input readOnly value={inputExcelPath} placeholder="选择 .xlsx / .xls 文件" />
                        <button type="button" onClick={() => void chooseExcelFile()}>选择</button>
                      </div>
                    </label>
                    <p className="helper-text">本地任务会自动补第一列「状态」，持续执行处理空状态/「待处理」/「待核实」记录。</p>
                  </SectionCard>
                ) : (
                  <>
                    <SectionCard title="飞书应用凭证" description="默认读取 AI比价配置，也可以在这里临时覆盖。">
                      <div className="settings-form-grid">
                        <label className="field">
                          <span>飞书 app_id</span>
                          <input value={feishuAppId} onChange={(event) => setFeishuAppId(event.target.value)} placeholder="cli_..." />
                        </label>
                        <label className="field">
                          <span>飞书 app_secret</span>
                          <input
                            type="password"
                            value={feishuAppSecret}
                            onChange={(event) => setFeishuAppSecret(event.target.value)}
                            placeholder="应用凭证中的 App Secret"
                          />
                        </label>
                      </div>
                    </SectionCard>
                    <SectionCard title="输入 / 输出 / 待人工核实多维表格">
                      <div className="create-table-toolbar">
                        <div>
                          <strong>第一次接入新飞书表格时使用</strong>
                          <p>仅在飞书多维表格里还没有三张表时点击；已有表格时直接粘贴链接创建任务。</p>
                        </div>
                        <button className="small-button" type="button" onClick={() => void createFeishuTaskTables()} disabled={isEnsuringTables}>
                          {isEnsuringTables ? '创建中...' : '创建新飞书任务表格'}
                        </button>
                      </div>
                      <div className="bitable-pair-grid">
                        <BitableFields
                          title="输入表"
                          value={inputBitable}
                          onChange={(value) => {
                            setInputBitable(value);
                            if (!outputBitable.appToken.trim() && value.appToken.trim()) {
                              setOutputBitable((current) => ({ ...current, appToken: value.appToken }));
                            }
                            if (!reviewBitable.appToken.trim() && value.appToken.trim()) {
                              setReviewBitable((current) => ({ ...current, appToken: value.appToken }));
                            }
                          }}
                        />
                        <BitableFields
                          title="输出货源表"
                          value={outputBitable}
                          onChange={(value) => {
                            setOutputBitable(value);
                            if (!reviewBitable.appToken.trim() && value.appToken.trim()) {
                              setReviewBitable((current) => ({ ...current, appToken: value.appToken }));
                            }
                          }}
                        />
                        <BitableFields
                          title="待人工核实上架表"
                          value={reviewBitable}
                          onChange={setReviewBitable}
                        />
                      </div>
                    </SectionCard>
                  </>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setIsCreateModalOpen(false)}>取消</button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void createTask()}
                  disabled={
                    isCreatingTask ||
                    (inputSource === 'excel'
                      ? !inputExcelPath.trim()
                      : !feishuAppId.trim() || !feishuAppSecret.trim() || !inputBitable.appToken.trim() || !outputBitable.appToken.trim())
                }
              >
                {isCreatingTask ? '创建中...' : '创建任务'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {runModalTask ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeRunModal}>
          <section className="modal-card wide-modal" role="dialog" aria-modal="true" aria-labelledby="run-list-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Runs</span>
                <h3 id="run-list-title">{runModalTask.name} 的日志列表</h3>
              </div>
              <button className="icon-button" type="button" aria-label="关闭" onClick={closeRunModal}>
                <X size={18} />
              </button>
            </div>

            <div className="run-modal-grid">
              <div className="admin-table-wrap compact-table-wrap">
                <table className="admin-table compact-table">
                  <thead>
                    <tr><th>执行日志</th><th>状态</th><th>成功/失败/总数</th><th>时间</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {modalRuns.map((run) => (
                      <tr key={run.id} className={run.id === modalFocusedRunId ? 'is-selected' : ''} onClick={() => void selectModalRun(run)}>
                        <td><strong>{run.name}</strong></td>
                        <td><span className={`status-pill status-${run.status}`}>{statusLabels[run.status]}</span></td>
                        <td>{run.successCount}/{run.failedCount}/{run.totalCount}</td>
                        <td>{new Date(run.createdAt).toLocaleString()}</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="table-action-row">
                            <button className="text-button" type="button" onClick={() => void selectModalRun(run)}>详情</button>
                            <button className="text-button" type="button" onClick={() => void window.appApi.openPath(run.assetDir)}>资产</button>
                            <button className="text-button" type="button" onClick={() => void window.appApi.openPath(run.outputExcelPath)}>输出</button>
                            <button className="text-danger-button" type="button" onClick={() => void deleteRun(run)} disabled={run.status === 'running'}>删除</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="log-list modal-log-list">
                {modalLogs.length === 0 ? <p className="muted">暂无日志详情。</p> : null}
                {modalLogs.map((log) => (
                  <div className={`log-entry ${log.level}`} key={log.id}>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <p>{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

type BitableFieldsProps = {
  title: string;
  value: FeishuBitableConfig;
  onChange: (value: FeishuBitableConfig) => void;
};

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="create-section-card">
      <div className="create-section-title">
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function BitableFields({ title, value, onChange }: BitableFieldsProps) {
  function updateBitable(patch: Partial<FeishuBitableConfig>) {
    onChange({ ...value, ...patch });
  }

  function fillFromUrl(rawUrl: string) {
    const parsed = parseFeishuBitableUrl(rawUrl);
    if (parsed) {
      onChange({
        appToken: parsed.appToken || value.appToken,
        tableId: parsed.tableId || value.tableId,
        viewId: parsed.viewId || value.viewId,
      });
    }
  }

  return (
    <div className="settings-form-grid bitable-fields">
      <label className="field span-2">
        <span className="bitable-link-label">{title} 链接</span>
        <input
          onChange={(event) => fillFromUrl(event.target.value)}
          placeholder="粘贴飞书多维表格链接，自动拆出 app_token / table_id / view_id；可只填 app_token 自动建表"
        />
      </label>
      <label className="field">
        <span>{title} app_token</span>
        <input value={value.appToken} onChange={(event) => updateBitable({ appToken: event.target.value })} placeholder="bascn..." />
      </label>
      <label className="field">
        <span>{title} table_id</span>
        <input value={value.tableId} onChange={(event) => updateBitable({ tableId: event.target.value })} placeholder="tbl...（可空，自动创建）" />
      </label>
      <label className="field">
        <span>{title} view_id</span>
        <input value={value.viewId} onChange={(event) => updateBitable({ viewId: event.target.value })} placeholder="vew...（可空）" />
      </label>
    </div>
  );
}

function parseFeishuBitableUrl(rawUrl: string): Partial<FeishuBitableConfig> | null {
  const text = rawUrl.trim();
  if (!text) {
    return null;
  }

  const appToken = text.match(/(?:\/base\/|\/wiki\/|app_token=)([A-Za-z0-9]+)/)?.[1] ?? '';
  const tableId =
    text.match(/(?:[?&]table=|[?&]table_id=|\/table\/)(tbl[A-Za-z0-9]+)/)?.[1] ??
    text.match(/\b(tbl[A-Za-z0-9]+)\b/)?.[1] ??
    '';
  const viewId =
    text.match(/(?:[?&]view=|[?&]view_id=|\/view\/)(vew[A-Za-z0-9]+)/)?.[1] ??
    text.match(/\b(vew[A-Za-z0-9]+)\b/)?.[1] ??
    '';

  if (!appToken && !tableId && !viewId) {
    return null;
  }

  return { appToken, tableId, viewId };
}
