const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${BACKEND_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  seed: () => apiFetch('/seed', { method: 'POST' }),
  getDashboard: () => apiFetch('/dashboard'),
  getTrainingPlan: () => apiFetch('/training-plan'),
  getCurrentWeek: () => apiFetch('/training-plan/current'),
  getWeekDetail: (id: string) => apiFetch(`/training-plan/week/${id}`),
  toggleSessionComplete: (weekId: string, sessionIndex: number, completed: boolean) =>
    apiFetch('/training-plan/session/complete', {
      method: 'PATCH',
      body: JSON.stringify({ week_id: weekId, session_index: sessionIndex, completed }),
    }),
  getRuns: () => apiFetch('/runs'),
  getRun: (id: string) => apiFetch(`/runs/${id}`),
  createRun: (run: any) => apiFetch('/runs', { method: 'POST', body: JSON.stringify(run) }),
  analyzeRun: (runId: string) =>
    apiFetch('/ai/analyze-run', { method: 'POST', body: JSON.stringify({ run_id: runId }) }),
  getTests: () => apiFetch('/tests'),
  createTest: (test: any) => apiFetch('/tests', { method: 'POST', body: JSON.stringify(test) }),
  getSupplements: () => apiFetch('/supplements'),
  getExercises: () => apiFetch('/exercises'),
  getProfile: () => apiFetch('/profile'),
  updateProfile: (data: { age?: number; weight_kg?: number }) =>
    apiFetch('/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  getWeeklyHistory: () => apiFetch('/weekly-history'),
  getMedals: () => apiFetch('/medals'),
  getAnalytics: () => apiFetch('/analytics'),
  cleanupRuns: () => apiFetch('/runs/cleanup', { method: 'POST' }),
  getStravaProfile: () => apiFetch('/strava/profile'),
  getStravaActivities: () => apiFetch('/strava/activities'),
  syncStrava: () => apiFetch('/strava/sync', { method: 'POST' }),
  getStravaAuthUrl: () => apiFetch('/strava/auth-url'),
  exchangeStravaCode: (code: string) =>
    apiFetch('/strava/exchange-code', { method: 'POST', body: JSON.stringify({ code }) }),
};
