import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  listStaff,
  resetStaffPassword,
  updateStaff,
  updateStaffPermissions,
} from './api';
import type { Permission } from '@student-portal/shared';
import type { CreateStaffInput, StaffListParams, StaffProfileInput } from './types';

export const staffKeys = {
  all: ['admin-staff'] as const,
  lists: () => [...staffKeys.all, 'list'] as const,
  list: (params: StaffListParams) => [...staffKeys.lists(), params] as const,
};

export function useStaffList(params: StaffListParams) {
  return useQuery({
    queryKey: staffKeys.list(params),
    queryFn: () => listStaff(params),
    placeholderData: keepPreviousData,
  });
}

export function useStaffMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: staffKeys.all });

  return {
    create: useMutation({ mutationFn: (input: CreateStaffInput) => createStaff(input), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: StaffProfileInput }) => updateStaff(id, input),
      onSuccess: refresh,
    }),
    permissions: useMutation({
      mutationFn: ({ id, permissions }: { id: string; permissions: Permission[] }) =>
        updateStaffPermissions(id, permissions),
      onSuccess: refresh,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
        resetStaffPassword(id, newPassword),
    }),
    deactivate: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) => deactivateStaff(id, reason),
      onSuccess: refresh,
    }),
    activate: useMutation({ mutationFn: (id: string) => activateStaff(id), onSuccess: refresh }),
  };
}
