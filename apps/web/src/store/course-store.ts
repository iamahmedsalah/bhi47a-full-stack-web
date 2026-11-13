import { create } from 'zustand';

interface CourseState {
  search: string;
  activeLevel: string;
  activeSemester: string;
  selectedKeys: string[];
  setFilter: (
    key: 'search' | 'activeLevel' | 'activeSemester',
    value: string,
  ) => void;
  setSelectedKeys: (keys: string[]) => void;
  reset: () => void;
}

export const useCourseStore = create<CourseState>((set) => ({
  search: '',
  activeLevel: 'all',
  activeSemester: 'all',
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
      activeLevel: 'all',
      activeSemester: 'all',
      selectedKeys: [],
    }),
}));
