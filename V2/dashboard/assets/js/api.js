// KDCN Platform V2 — dashboard API client

const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return window.location.protocol + '//' + host + ':8000';
  }
  return window.location.origin;
})();

// ---------- Token storage ----------
const Session = {
  get accessToken()  { return sessionStorage.getItem('kdcn_at'); },
  set accessToken(v) { v ? sessionStorage.setItem('kdcn_at', v) : sessionStorage.removeItem('kdcn_at'); },
  get refreshToken()  { return sessionStorage.getItem('kdcn_rt'); },
  set refreshToken(v) { v ? sessionStorage.setItem('kdcn_rt', v) : sessionStorage.removeItem('kdcn_rt'); },
  get user() { try { return JSON.parse(sessionStorage.getItem('kdcn_user') || 'null'); } catch { return null; } },
  set user(v) { v ? sessionStorage.setItem('kdcn_user', JSON.stringify(v)) : sessionStorage.removeItem('kdcn_user'); },
  clear() { this.accessToken = null; this.refreshToken = null; this.user = null; },
  has() { return !!(this.accessToken || this.refreshToken); },
};

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function tryRefresh() {
  if (!Session.refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: Session.refreshToken }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || !body.ok) return false;
    Session.accessToken = body.data.access_token;
    Session.refreshToken = body.data.refresh_token;
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(path, options) {
  options = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (Session.accessToken) headers.Authorization = 'Bearer ' + Session.accessToken;

  let res;
  try {
    const fetchOpts = {
      method: options.method || 'GET',
      headers: headers,
    };
    if (options.body !== undefined) fetchOpts.body = JSON.stringify(options.body);
    res = await fetch(API_BASE + path, fetchOpts);
  } catch (err) {
    throw new ApiError('NETWORK_ERROR', 'Cannot reach API at ' + API_BASE, 0);
  }

  if (res.status === 401 && !options._retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const next = Object.assign({}, options, { _retried: true });
      return apiFetch(path, next);
    }
    Session.clear();
    window.location.href = 'login.html';
    throw new ApiError('UNAUTHENTICATED', 'Session expired.', 401);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.ok) {
    const code = (body && body.error && body.error.code) || ('HTTP_' + res.status);
    const msg = (body && body.error && body.error.message) || 'Request failed';
    throw new ApiError(code, msg, res.status);
  }
  return body;
}

// ---------- Toast helper ----------
function toast(message, kind) {
  kind = kind || 'info';
  let el = document.getElementById('kdcn-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kdcn-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast show ' + kind;
  el.textContent = message;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.classList.remove('show'); }, 3200);
}

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formatKsh(minor) {
  if (minor == null) return '—';
  const n = Number(minor) / 100;
  return 'KSh ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
