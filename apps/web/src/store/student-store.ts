import { create } from 'zustand';

interface StudentState {
  search: string;
  level: string;
  status: string;
  page: number;
  selectedKeys: string[];
  setFilter: (key: 'search' | 'level' | 'status' | 'page', value: string | number) => void;
  setSelectedKeys: (keys: string[]) => void;
  reset: () => void;
}

export const useStudentStore = create<StudentState>((set) => ({
  search: '',
  level: 'all',
  status: 'all',
  page: 1,
  selectedKeys: [],
  setFilter: (key, value) =>
    set((state) => ({
      [key]: value,
      selectedKeys: [], // Reset selections automatically
    })),
  setSelectedKeys: (keys) => set({ selectedKeys: keys }),
  reset: () => set({ search: '', level: 'all', status: 'all', page: 1, selectedKeys: [] }),
}));
