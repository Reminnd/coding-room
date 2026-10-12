import { useEffect, useState } from 'react';
import { api } from '../api';
import { workbenchApi } from '../workbench-api';
import { ErrorNotice } from './Primitives';

export function ExecutionContext({ projectId, taskId, runId, path }: { projectId: string; taskId: string; runId: string | null; path: string | null }) {
  const [branch, setBranch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function read() {
    setError(null);
    try { setBranch((await workbenchApi.changes(projectId, taskId)).branch); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  useEffect(() => { setBranch(null); if (path) void read(); }, [projectId, taskId, runId, path]);
  if (!path || !runId) return <small>尚未准备执行目录</small>;
  return <details><summary>执行分支 · {branch ?? (error ? '读取失败' : '读取中…')}</summary><p className="path-text">{path}</p><ErrorNotice error={error} /><div className="inline-options"><button onClick={() => void api.openVscode(projectId, runId).catch((error: Error) => setError(error.message))}>打开执行目录</button><button onClick={() => void read()}>刷新分支</button></div></details>;
}
