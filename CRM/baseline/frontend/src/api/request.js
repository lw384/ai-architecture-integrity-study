const BASE = '/api';

export async function request(path, opts = {}) {
  const response = await fetch(BASE + path, {
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