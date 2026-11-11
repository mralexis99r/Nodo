export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Nodo-Client': 'web', ...options.headers },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({ error: 'SERVER_ERROR' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && path !== '/me')
      window.dispatchEvent(new Event('nodo-session-expired'));
    throw Object.assign(new Error(payload.error || 'SERVER_ERROR'), { details: payload });
  }
  return payload;
}
export const validUrl = (value) => {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
export function provider(value) {
  try {
    const host = new URL(value).hostname;
    if (host === 'figma.com' || host.endsWith('.figma.com'))
      return { name: 'Figma', icon: 'figma', color: 'purple' };
    if (host.endsWith('.atlassian.net')) return { name: 'Jira', icon: 'jira', color: 'blue' };
    if (host === 'dev.azure.com' || host.endsWith('.visualstudio.com'))
      return { name: 'Azure DevOps', icon: 'azure', color: 'blue' };
    return { name: host, icon: 'globe', color: 'gray' };
  } catch {
    return { name: '', icon: 'globe', color: 'gray' };
  }
}
