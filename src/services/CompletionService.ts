import { useCompletionsStore } from '@/stores/useCompletionsStore';

// Every store action queues its own scheduler call (cancel, settle, rebuild), so this layer never
// adds one: the cancel it used to await ran a second time on every completion.
export const CompletionService = {
  async markDone(mitzvahId: string, date: Date = new Date()): Promise<void> {
    useCompletionsStore.getState().markDone(mitzvahId, date);
  },

  async unmark(mitzvahId: string, date: Date = new Date()): Promise<void> {
    useCompletionsStore.getState().unmark(mitzvahId, date);
  },

  async markSkipped(mitzvahId: string, date: Date = new Date()): Promise<void> {
    useCompletionsStore.getState().markSkipped(mitzvahId, date);
  },

  isDone(mitzvahId: string, date: Date = new Date()): boolean {
    return useCompletionsStore.getState().isDone(mitzvahId, date);
  },

  isSkipped(mitzvahId: string, date: Date = new Date()): boolean {
    return useCompletionsStore.getState().isSkipped(mitzvahId, date);
  },
};
