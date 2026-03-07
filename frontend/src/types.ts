export interface Run {
  id: string;
  date: string;
  distance_km: number;
  duration_minutes: number;
  avg_pace: string;
  avg_hr?: number;
  max_hr?: number;
  avg_hr_pct?: number;
  max_hr_pct?: number;
  run_type: string;
  notes?: string;
  location?: string;
}

export interface TrainingSession {
  day: string;
  date: string;
  type: string;
  title: string;
  description: string;
  target_distance_km?: number;
  target_pace?: string;
  target_duration_min?: number;
  completed: boolean;
}

export interface TrainingWeek {
  id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  phase: string;
  phase_description: string;
  target_km: number;
  sessions: TrainingSession[];
  notes?: string;
}

export interface WeeklyHistory {
  id: string;
  week_start: string;
  week_end: string;
  total_km: number;
  year: number;
  week_number: number;
}

export interface TestResult {
  id: string;
  date: string;
  test_type: string;
  distance_km: number;
  duration_minutes: number;
  avg_pace: string;
  avg_hr?: number;
  max_hr?: number;
  notes?: string;
}

export interface TestSchedule {
  id: string;
  scheduled_date: string;
  test_type: string;
  description: string;
  completed: boolean;
}

export interface Supplement {
  id: string;
  name: string;
  dosage: string;
  timing: string;
  purpose: string;
  active: boolean;
  category: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  tempo: string;
  rest: string;
  category: string;
  priority: string;
  notes: string;
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  weight_kg: number;
  max_hr: number;
  started_running: string;
  total_km: number;
  race_goal: string;
  race_date: string;
  target_pace: string;
  target_time: string;
  pbs: Record<string, { time: string; date: string; pace: string }>;
  max_weekly_km: number;
  injury: {
    type: string;
    date: string;
    recovery_start: string;
    running_resumed: string;
    status: string;
    details: string;
  };
  mouth_tape: {
    recommendation: string;
    benefits: string;
    protocol: string;
  };
}

export interface AIAnalysis {
  id: string;
  run_id: string;
  analysis: string;
  created_at: string;
}
