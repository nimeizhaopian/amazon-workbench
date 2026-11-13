export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-AW-Client': 'workbench', ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请重试');
  return data as T;
}
