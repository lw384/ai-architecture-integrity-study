import { request } from '../../api/request';

export const interactionApi = {
  list: (customerId) => request(`/customers/${customerId}/interactions`),
  create: (customerId, data) =>
    request(`/customers/${customerId}/interactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};