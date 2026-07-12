import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import { companyApi } from '../../api/companyApi';

export const companyKeys = {
    all: ['companies'],
    lists: () => [...companyKeys.all, 'list'],
    list: (companyId, query) => [...companyKeys.lists(), companyId, query],
    details: () => [...companyKeys.all, 'detail'],
    detail: (id) => [...companyKeys.details(), id],
};

export function useCompanyList(companyId, query) {
    return useQuery({
        queryKey: companyKeys.list(companyId, query),
        queryFn: () => companyApi.list(companyId, query),
        enabled: Boolean(companyId),
    });
}

export function useCompany(id) {
    return useQuery({
        queryKey: companyKeys.detail(id),
        queryFn: () => companyApi.get(id),
        enabled: Boolean(id),
    });
}

export function useCreateCompany() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => companyApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: companyKeys.lists(),
            });
        },
    });
}

export function useUpdateCompany(companyId) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => companyApi.update(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: companyKeys.lists(companyId),
            });
            queryClient.invalidateQueries({
                queryKey: companyKeys.detail(variables.id),
            });
        },
    });
}

export function useDeleteCompany(companyId) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => companyApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: companyKeys.lists(companyId),
            });
        },
    });
}