import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  deleteStaff,
  getStaffCourses,
  getStaffSchedules,
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
  courses: (doctorId: string) => [...staffKeys.all, 'courses', doctorId] as const,
  schedules: (staffId: string) => [...staffKeys.all, 'schedules', staffId] as const,
};

export function useStaffList(params: StaffListParams) {
  return useQuery({
    queryKey: staffKeys.list(params),
    queryFn: () => listStaff(params),
    placeholderData: keepPreviousData,
  });
}

export function useStaffCourses(staffId: string | null | undefined) {
  return useQuery({
    queryKey: staffKeys.courses(staffId ?? ''),
    queryFn: () => (staffId ? getStaffCourses(staffId) : Promise.resolve([])),
    enabled: Boolean(staffId),
    staleTime: 0,
  });
}

export function useStaffSchedules(staffId: string | null | undefined) {
  return useQuery({
    queryKey: staffKeys.schedules(staffId ?? ''),
    queryFn: () => (staffId ? getStaffSchedules(staffId) : Promise.resolve([])),
    enabled: Boolean(staffId),
    staleTime: 60 * 1000,
  });
}

export function useStaffMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['staff-course-choices'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-form-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-options-for-courses'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-staff-list'] });
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    void queryClient.invalidateQueries({ queryKey: ['course-schedules'] });
  };

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
    delete: useMutation({ mutationFn: (id: string) => deleteStaff(id), onSuccess: refresh }),
  };
}
