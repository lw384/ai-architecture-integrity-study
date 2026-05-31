import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { contactApi } from './contactApi';

export const contactKeys = {
  byCustomer: (customerId) => ['contacts', 'customer', customerId],
  detail: (contactId) => ['contacts', 'detail', contactId],
};

export function useContactsByCustomerQuery(customerId) {
  return useQuery({
    queryKey: contactKeys.byCustomer(customerId),
    queryFn: () => contactApi.list(customerId),
    enabled: Boolean(customerId),
  });
}

export function useCreateContactMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => contactApi.create(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactKeys.byCustomer(customerId),
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
        queryKey: contactKeys.byCustomer(customerId),
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
        queryKey: contactKeys.byCustomer(customerId),
      });
    },
  });
}