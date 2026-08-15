import { request } from './request';

// Test-only URLs must not enter the production endpoint inventory.
request('/intentionally-missing-test-route');
