import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  adminMobileSidebarOpen: boolean;
  studentMobileSidebarOpen: boolean;
  setStudentMobileSidebarOpen: (open: boolean) => void;
  setAdminMobileSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  adminMobileSidebarOpen: false,
  studentMobileSidebarOpen: false,
  setStudentMobileSidebarOpen: (open: boolean) => set({ studentMobileSidebarOpen: open }),
  setAdminMobileSidebarOpen: (open) => set({ adminMobileSidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
