import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ComplaintDraft {
  requesterName: string;
  studentCode: string;
  contactPhone: string;
  nationalId: string;
  contactEmail: string;
  type: string;
  department: string;
  title: string;
  description: string;
}

interface ComplaintState {
  // Student form draft (persisted in localStorage)
  draft: ComplaintDraft;
  updateDraft: (fields: Partial<ComplaintDraft>) => void;
  resetDraft: () => void;

  // Admin page filters & selections
  adminFilters: {
    search: string;
    status: string;
    type: string;
    priority: string;
    assignedGroup: string;
    assignedStaffId: string;
    dateFrom: string;
    dateTo: string;
  };
  selectedTicketIds: string[];
  setAdminFilter: (key: string, value: string) => void;
  setSelectedTicketIds: (ids: string[]) => void;
  resetAdminFilters: () => void;
}

const initialDraft: ComplaintDraft = {
  requesterName: '',
  studentCode: '',
  contactPhone: '',
  nationalId: '',
  contactEmail: '',
  type: 'complaint',
  department: 'student_affairs',
  title: '',
  description: '',
};

const initialAdminFilters = {
  search: '',
  status: 'all',
  type: 'all',
  priority: 'all',
  assignedGroup: 'all',
  assignedStaffId: 'all',
  dateFrom: '',
  dateTo: '',
};

export const useComplaintStore = create<ComplaintState>()(
  persist(
    (set) => ({
      draft: initialDraft,
      updateDraft: (fields) =>
        set((state) => ({ draft: { ...state.draft, ...fields } })),
      resetDraft: () => set({ draft: initialDraft }),

      adminFilters: initialAdminFilters,
      selectedTicketIds: [],
      setAdminFilter: (key, value) =>
        set((state) => ({
          adminFilters: { ...state.adminFilters, [key]: value },
          selectedTicketIds: [], // Reset selections when filters change
        })),
      setSelectedTicketIds: (ids) => set({ selectedTicketIds: ids }),
      resetAdminFilters: () =>
        set({ adminFilters: initialAdminFilters, selectedTicketIds: [] }),
    }),
    {
      name: 'student-complaints-draft',
      partialize: (state) => ({ draft: state.draft }), // Only persist the form draft
    }
  )
);
