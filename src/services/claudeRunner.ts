const RUNNER_BASE = import.meta.env.DEV
  ? '/claude-runner'
  : (import.meta.env.VITE_CLAUDE_RUNNER_URL || 'http://localhost:3456');
const RUNNER_API_KEY = import.meta.env.VITE_CLAUDE_RUNNER_API_KEY || '';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (RUNNER_API_KEY) headers['Authorization'] = `Bearer ${RUNNER_API_KEY}`;
  return headers;
}

export interface RunnerTask {
  id: string;
  prompt: string;
  workingDir: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped';
  output: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
}

export interface RunnerTaskStatus {
  id: string;
  status: string;
  done: boolean;
  exitCode: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export async function createRunnerTask(prompt: string, workingDir?: string): Promise<RunnerTask> {
  const body: Record<string, string> = { prompt };
  if (workingDir) body.workingDir = workingDir;

  const res = await fetch(`${RUNNER_BASE}/api/tasks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create runner task: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getRunnerTaskStatus(taskId: string): Promise<RunnerTaskStatus> {
  const res = await fetch(`${RUNNER_BASE}/api/tasks/${taskId}/status`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get task status: ${res.status}`);
  return res.json();
}

export async function getRunnerTask(taskId: string): Promise<RunnerTask> {
  const res = await fetch(`${RUNNER_BASE}/api/tasks/${taskId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get task: ${res.status}`);
  return res.json();
}

export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '');
}
