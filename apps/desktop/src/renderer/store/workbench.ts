import { create } from 'zustand';
import type { SirenPattern } from '@cortex/vehicle-meta';

export interface ChevronDraft {
  name: string;
  width: number;
  height: number;
  updatedAt: string;
}

interface WorkbenchDraftState {
  pulse: SirenPattern | null;
  pulseUpdatedAt: string | null;
  chevron: ChevronDraft | null;
  setPulse: (pattern: SirenPattern) => void;
  setChevron: (draft: ChevronDraft) => void;
  clearPulse: () => void;
  clearChevron: () => void;
}

export const useWorkbenchDraftStore = create<WorkbenchDraftState>((set) => ({
  pulse: null,
  pulseUpdatedAt: null,
  chevron: null,
  setPulse: (pulse) => set({ pulse, pulseUpdatedAt: new Date().toISOString() }),
  setChevron: (chevron) => set({ chevron }),
  clearPulse: () => set({ pulse: null, pulseUpdatedAt: null }),
  clearChevron: () => set({ chevron: null }),
}));
