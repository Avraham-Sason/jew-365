import { nextStreakGoal, streakGoalProgress, STREAK_GOALS } from '../streakGoal';

describe('nextStreakGoal', () => {
  it.each([
    [0, 7],
    [6, 7],
    [7, 30],
    [15, 30],
    [29, 30],
    [30, 100],
    [99, 100],
    [100, 365],
    [364, 365],
    [365, 730],
    [729, 730],
    [730, 1095],
  ])('nextStreakGoal(%i) is %i', (streak, goal) => {
    expect(nextStreakGoal(streak)).toBe(goal);
  });

  it('counts a negative, fractional or non-finite streak as its whole days', () => {
    expect(nextStreakGoal(-3)).toBe(7);
    expect(nextStreakGoal(15.7)).toBe(30);
    expect(nextStreakGoal(NaN)).toBe(7);
    expect(streakGoalProgress(-3)).toBe(0);
  });

  it('lists the goals in ascending order', () => {
    expect([...STREAK_GOALS]).toEqual([7, 30, 100, 365]);
  });
});

describe('streakGoalProgress', () => {
  it.each([
    [0, 0],
    [7, 7 / 30],
    [15, 0.5],
    [30, 0.3],
    [50, 0.5],
    [364, 364 / 365],
    [365, 0.5],
    [400, 400 / 730],
  ])('streakGoalProgress(%i) is %d', (streak, progress) => {
    expect(streakGoalProgress(streak)).toBeCloseTo(progress, 10);
  });

  it('stays inside [0, 1) for every streak up to three years', () => {
    for (let streak = 0; streak <= 1095; streak++) {
      const progress = streakGoalProgress(streak);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThan(1);
    }
  });
});
