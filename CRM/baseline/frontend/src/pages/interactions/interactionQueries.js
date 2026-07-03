import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { customerKeys } from '../customers/customerQueries';
import { interactionApi } from './interactionApi';

export const interactionKeys = {
  byCustomer: (customerId) => ['interactions', 'customer', customerId],
};

export function useInteractionsByCustomerQuery(customerId) {
  return useQuery({
    queryKey: interactionKeys.byCustomer(customerId),
    queryFn: () => interactionApi.list(customerId),
    enabled: Boolean(customerId),
  });
}

export function useCreateInteractionMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => interactionApi.create(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interactionKeys.byCustomer(customerId),
      });
      queryClient.invalidateQueries({
        queryKey: customerKeys.detail(customerId),
      });
      queryClient.invalidateQueries({
        queryKey: customerKeys.lists(),
      });
    },
  });
}