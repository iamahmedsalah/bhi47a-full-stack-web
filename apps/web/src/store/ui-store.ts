import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  adminMobileSidebarOpen: boolean;
  setAdminMobileSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  adminMobileSidebarOpen: false,
  setAdminMobileSidebarOpen: (open) => set({ adminMobileSidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
