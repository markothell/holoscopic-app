const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STORAGE_KEY = 'hs_platform_user';

// Reads the bearer token from the stored session rather than taking it as an
// argument. The backend's requireAdmin now demands a verified token — the old
// `x-user-id` header was settable by anyone with curl — and reading it here
// means the existing call sites did not have to change.
function storedToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || session.expiresAt <= Date.now()) return null;
    return session.token as string;
  } catch {
    return null;
  }
}

function signOutAndRedirect() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  if (window.location.pathname !== '/login') window.location.href = '/login';
}

export async function apiFetch(
  path: string,
  // `userId` is still accepted so existing call sites compile unchanged, but
  // it is deliberately unused: identity comes from the signed token now, and
  // honouring a caller-supplied id would reopen the hole this closed.
  options: { method?: string; userId?: string; body?: string } = {}
) {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const token = storedToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { method, headers, body });

  // An expired or revoked token should return the operator to the login form
  // rather than surfacing "Forbidden" from behind a UI that still looks
  // signed in.
  if (res.status === 401 || res.status === 403) {
    signOutAndRedirect();
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Sends a memorial's subject photo to this app's own /api/memorial-photo,
// which stores it in Vercel Blob and hands back the public URL. Separate from
// apiFetch because it posts multipart to Next rather than JSON to the backend
// — but it reads the same session, so an operator whose token expired mid-edit
// lands on the login form here too rather than getting a bare 401.
export async function uploadMemorialPhoto(
  file: Blob,
  { instanceId, slug, filename }: { instanceId: string; slug: string; filename: string },
): Promise<string> {
  const token = storedToken();
  if (!token) {
    signOutAndRedirect();
    throw new Error('Your session has expired. Please sign in again.');
  }

  const form = new FormData();
  form.append('file', file, filename);
  form.append('instanceId', instanceId);
  form.append('slug', slug);

  // No Content-Type header: the browser has to set it, boundary and all.
  const res = await fetch('/api/memorial-photo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 401 || res.status === 403) {
    signOutAndRedirect();
    throw new Error('Your session has expired. Please sign in again.');
  }

  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url as string;
}
