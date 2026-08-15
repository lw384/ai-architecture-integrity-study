import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestError, isTransportError, request } from './request';

function createResponse({ status = 200, body = '', statusText = '' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe('request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('serializes query parameters and omits empty values', async () => {
    fetch.mockResolvedValue(createResponse({ body: JSON.stringify({ items: [] }) }));

    await request('/companies', {
      query: {
        page: 1,
        status: '0',
        q: '',
        industry: undefined,
        owner: null,
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/companies?page=1&status=0',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('allows callers to override default headers', async () => {
    fetch.mockResolvedValue(createResponse({ body: JSON.stringify({ ok: true }) }));

    await request('/companies', {
      headers: {
        'Content-Type': 'application/merge-patch+json',
        Authorization: 'Bearer test-token',
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/companies',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/merge-patch+json',
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });

  it('returns parsed JSON for a successful response', async () => {
    fetch.mockResolvedValue(createResponse({ body: JSON.stringify({ id: 'company-1' }) }));

    await expect(request('/companies/company-1')).resolves.toEqual({ id: 'company-1' });
  });

  it('returns null for a successful empty response', async () => {
    fetch.mockResolvedValue(createResponse({ status: 204 }));

    await expect(
      request('/companies/company-1', { method: 'DELETE' }),
    ).resolves.toBeNull();
  });

  it('joins array validation messages in a RequestError', async () => {
    fetch.mockResolvedValue(
      createResponse({
        status: 422,
        body: JSON.stringify({ message: ['Name is required', 'Email is invalid'] }),
      }),
    );

    await expect(request('/companies')).rejects.toMatchObject({
      name: 'RequestError',
      status: 422,
      message: 'Name is required, Email is invalid',
    });
  });

  it('uses statusText when an error response has no message', async () => {
    fetch.mockResolvedValue(
      createResponse({
        status: 404,
        statusText: 'Not Found',
        body: JSON.stringify({}),
      }),
    );

    await expect(request('/companies/missing')).rejects.toMatchObject({
      status: 404,
      message: 'Not Found',
    });
  });

  it('converts a rejected fetch into a network RequestError', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(request('/companies')).rejects.toMatchObject({
      name: 'RequestError',
      status: undefined,
      message: 'Network error, please check your connection and try again.',
    });
  });
});

describe('isTransportError', () => {
  it('classifies network and 5xx failures as transport errors', () => {
    expect(isTransportError(new RequestError('Network error', undefined))).toBe(true);
    expect(isTransportError(new RequestError('Unavailable', 503))).toBe(true);
  });

  it('classifies 4xx failures as business errors', () => {
    expect(isTransportError(new RequestError('Conflict', 409))).toBe(false);
    expect(isTransportError(new RequestError('Invalid input', 422))).toBe(false);
  });
});
