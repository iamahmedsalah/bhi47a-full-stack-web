import { create } from 'zustand';

interface CourseState {
  search: string;
  activeLevel: string;
  selectedKeys: string[];
  setFilter: (key: 'search' | 'activeLevel', value: string) => void;
  setSelectedKeys: (keys: string[]) => void;
  reset: () => void;
}

export const useCourseStore = create<CourseState>((set) => ({
  search: '',
  activeLevel: 'all',
  selectedKeys: [],
  setFilter: (key, value) =>
    set((state) => ({
      [key]: value,
      selectedKeys: [], // Reset selections automatically
    })),
  setSelectedKeys: (keys) => set({ selectedKeys: keys }),
  reset: () => set({ search: '', activeLevel: 'all', selectedKeys: [] }),
}));
