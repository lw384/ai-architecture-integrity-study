const API_BASE_PATH = '/api';

// Thrown by request() for both network failures (status undefined) and non-2xx
// HTTP responses (status set). isTransportError() below is the single source of
// truth for "infra-level failure the global interceptor should toast" vs.
// "business error the calling page should handle and display itself".
export class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

// Network failures (fetch itself rejected, no HTTP response at all) and 5xx
// server errors aren't meaningful to a specific page/action, so the global
// interceptor (see App.jsx) shows a generic toast for these. Every other
// status (400/401/403/404/409/422/...) is treated as a business error and
// left to the calling component to interpret and display.
export function isTransportError(error) {
  return !error?.status || error.status >= 500;
}

function buildUrl(path, query) {
  const url = new URL(`${API_BASE_PATH}${path}`, window.location.origin);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  return `${url.pathname}${url.search}`;
}

// vite.config.js proxies /api/* to CRM_BASELINE_API_ORIGIN (backend mounts everything
// under app.setGlobalPrefix('api')), so callers pass paths like '/companies' and this
// prepends the /api prefix + serializes the `query` object as a querystring.
export async function request(path, { query, headers, ...options } = {}) {
  let response;

  try {
    response = await fetch(buildUrl(path, query), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  } catch {
    throw new RequestError('Network error, please check your connection and try again.', undefined);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || response.statusText || 'Request failed';
    throw new RequestError(Array.isArray(message) ? message.join(', ') : message, response.status);
  }

  return data;
}
