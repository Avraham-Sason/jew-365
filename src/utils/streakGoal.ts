export const STREAK_GOALS = [7, 30, 100, 365] as const;

const YEAR = 365;

const wholeDays = (streak: number) => (Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0);

export function nextStreakGoal(streak: number): number {
  const days = wholeDays(streak);
  return STREAK_GOALS.find((goal) => goal > days) ?? (Math.floor(days / YEAR) + 1) * YEAR;
}

export function streakGoalProgress(streak: number): number {
  const days = wholeDays(streak);
  return days / nextStreakGoal(days);
}
