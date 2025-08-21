import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStatusStore = create(
  persist(
    (set) => ({
      // State
      micStatus: 'idle',
      webcamStatus: 'idle',
      identityStatus: 'idle',
      preCheckComplete: false,

      // Actions
      setMicStatus: (status) => set({ micStatus: status }),
      setWebcamStatus: (status) => set({ webcamStatus: status }),
      setIdentityStatus: (status) => set({ identityStatus: status }),
      setPreCheckComplete: (isComplete) => set({ preCheckComplete: isComplete }),

      // Action to reset the status, e.g., when starting a new exam check
      resetPreCheckStatus: () => set({
        micStatus: 'idle',
        webcamStatus: 'idle',
        identityStatus: 'idle',
        preCheckComplete: false,
      }),
    }),
    {
      name: 'pre-check-status-storage', // unique name for localStorage key
    }
  )
);

export default useStatusStore;
