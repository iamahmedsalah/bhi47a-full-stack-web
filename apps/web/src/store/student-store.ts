import { create } from 'zustand';

interface StudentState {
  search: string;
  level: string;
  status: string;
  sortBy: string;
  sortOrder: string;
  page: number;
  selectedKeys: string[];
  setFilter: (
    key: 'search' | 'level' | 'status' | 'sortBy' | 'sortOrder' | 'page',
    value: string | number | undefined,
  ) => void;
  setSelectedKeys: (keys: string[]) => void;
  reset: () => void;
}

export const useStudentStore = create<StudentState>((set) => ({
  search: '',
  level: 'all',
  status: 'all',
  sortBy: '',
  sortOrder: 'asc',
  page: 1,
  selectedKeys: [],
  setFilter: (key, value) =>
    set(() => ({
      [key]: value,
      selectedKeys: [], // Reset selections automatically
    })),
  setSelectedKeys: (keys) => set({ selectedKeys: keys }),
  reset: () =>
    set({
      search: '',
      level: 'all',
      status: 'all',
      sortBy: '',
      sortOrder: 'asc',
      page: 1,
      selectedKeys: [],
    }),
}));
