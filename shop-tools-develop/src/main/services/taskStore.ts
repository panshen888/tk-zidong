import fs from 'node:fs/promises';
import type { AppSettings, Task, TaskLogEntry, TaskRun, TaskStatus } from '../../shared/types';

export type TaskStore = {
  getSettings: () => AppSettings;
  getTasks: () => Task[];
  setTasks: (tasks: Task[]) => void;
  getTask: (taskId: string) => Task | undefined;
  updateTask: (taskId: string, patch: Partial<Task>) => Task;
  getRuns: () => TaskRun[];
  setRuns: (runs: TaskRun[]) => void;
  getRun: (runId: string) => TaskRun | undefined;
  getTaskRuns: (taskId: string) => TaskRun[];
  updateRun: (runId: string, patch: Partial<TaskRun>) => TaskRun;
  appendLog: (runId: string, level: TaskLogEntry['level'], message: string) => TaskLogEntry;
};

export function timestampId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getTaskStatus(successCount: number, failedCount: number): TaskStatus {
  if (successCount > 0 && failedCount > 0) {
    return 'partial_failed';
  }

  if (successCount > 0) {
    return 'success';
  }

  return failedCount > 0 ? 'failed' : 'success';
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
