import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { contactApi } from './contactApi';

export const contactKeys = {
  lists: (customerId) => ['contacts', 'customer', customerId, 'list'],
  byCustomer: (customerId) => ['contacts', 'customer', customerId],
  list: (customerId, query) => ['contacts', 'customer', customerId, 'list', query],
  detail: (contactId) => ['contacts', 'detail', contactId],
};

export function useContactsByCustomerQuery(customerId, query) {
  return useQuery({
    queryKey: contactKeys.list(customerId, query),
    queryFn: () => contactApi.list(customerId, query),
    enabled: Boolean(customerId),
  });
}

export function useCreateContactMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => contactApi.create(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactKeys.lists(customerId),
      });
    },
  });
}

export function useUpdateContactMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => contactApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: contactKeys.lists(customerId),
      });
      queryClient.invalidateQueries({
        queryKey: contactKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteContactMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: contactApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactKeys.lists(customerId),
      });
    },
  });
}