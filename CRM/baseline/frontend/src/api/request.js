const BASE = '/api';

export async function request(path, opts = {}) {
  const response = await fetch(buildUrl(path, opts.query), {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    ...opts,
  });

  if (!response.ok) {
    let message = `${response.status}`;

    try {
      const payload = await response.json();
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Keep the status code when the server does not return JSON.
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function buildUrl(path, query) {
  if (!query) {
    return BASE + path;
  }

  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const serializedQuery = searchParams.toString();

  return serializedQuery ? `${BASE}${path}?${serializedQuery}` : BASE + path;
}