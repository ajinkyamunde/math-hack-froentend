import { apiClient } from './apiClient';
import { call } from './authService';
import type {
  CompetitionSettings,
  CompetitionSummary,
  DirectQuestionInput,
  HostCompetitionState,
  HostOverview,
  OptionKey,
  Paginated,
  ProgressionMode,
  StudentCompetitionState,
} from '../types';

export interface CompetitionInput {
  name: string;
  description: string;
  durationSeconds: number;
  questionProgressionMode: ProgressionMode;
  settings: CompetitionSettings;
  questionIds?: string[];
  questions?: DirectQuestionInput[];
}

export type HostCommand = 'open' | 'start' | 'pause' | 'resume' | 'publish' | 'release-all' | 'skip' | 'end' | 'cancel';

export interface CompetitionStatusResponse {
  competitionId: string;
  name: string;
  status: string;
  registrationStatus: string;
  startedAt: string | null;
  durationSeconds: number;
  serverNow: string;
}

export interface ExamSessionInfo {
  sessionId: string;
  competitionId: string;
  studentId: string;
  startedAt: string;
  expiresAt: string;
  durationSeconds: number;
  remainingMs: number;
  serverNow: string;
  status: 'ACTIVE' | 'SUBMITTED' | 'EXPIRED' | 'COMPLETED';
  score: number;
}

export interface StartTestResponse {
  session: ExamSessionInfo;
  questions: Array<{
    id: string;
    questionText: string;
    options: string[];
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    points: number;
    timeLimitSeconds: number;
    order: number;
  }>;
  answers: Record<string, { selectedOption: OptionKey | null; submittedAt: string }>;
}

export interface MySessionResponse {
  session: ExamSessionInfo | null;
  competitionStatus: string;
  competitionName?: string;
  durationSeconds?: number;
  isRegistered?: boolean;
  serverNow: string;
  questions?: StartTestResponse['questions'];
  answers?: Record<string, { selectedOption: OptionKey | null; submittedAt: string }>;
}

export const competitionService = {
  list: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
    call(apiClient.get<Paginated<CompetitionSummary>>('/competitions', { params })),
  create: (input: CompetitionInput) =>
    call(apiClient.post<{ competition: HostCompetitionState }>('/competitions', input)).then((r) => r.competition),
  update: (id: string, input: Partial<CompetitionInput>) =>
    call(apiClient.patch<{ competition: HostCompetitionState }>(`/competitions/${id}`, input)).then((r) => r.competition),
  hostState: (id: string) =>
    call(apiClient.get<{ competition: HostCompetitionState }>(`/competitions/${id}`)).then((r) => r.competition),
  studentState: (id: string) =>
    call(apiClient.get<{ competition: StudentCompetitionState }>(`/competitions/${id}/state`)).then((r) => r.competition),
  setQueue: (id: string, questionIds: string[]) =>
    call(apiClient.put<{ competition: HostCompetitionState }>(`/competitions/${id}/queue`, { questionIds })).then((r) => r.competition),
  saveDirectQuestions: (id: string, questions: DirectQuestionInput[]) =>
    call(apiClient.put<{ competition: HostCompetitionState }>(`/competitions/${id}/questions`, { questions })).then((r) => r.competition),
  command: (id: string, command: HostCommand, questionId?: string) =>
    call(apiClient.post<{ competition: HostCompetitionState }>(`/competitions/${id}/${command}`, questionId ? { questionId } : {})).then(
      (r) => r.competition,
    ),
  join: (id: string) =>
    call(apiClient.post<{ competition: StudentCompetitionState }>(`/competitions/${id}/join`)).then((r) => r.competition),
  submitAnswer: (id: string, questionId: string, selectedOption: OptionKey) =>
    call(
      apiClient.post<{ submission: { questionId: string; selectedOption: OptionKey; submittedAt: string; alreadySubmitted: boolean } }>(
        `/competitions/${id}/answers`,
        { questionId, selectedOption },
      ),
    ).then((r) => r.submission),
  overview: () => call(apiClient.get<HostOverview>('/host/overview')),

  // Phase 10 Standardized Endpoints
  openRegistration: (id: string) =>
    call(apiClient.post<{ ok: boolean; status: string; competitionId: string }>(`/competitions/${id}/open-registration`)),
  hostStart: (id: string) =>
    call(apiClient.post<{ ok: boolean; status: string; startedAt: string; durationSeconds: number }>(`/competitions/${id}/start`)),
  status: (id: string) =>
    call(apiClient.get<CompetitionStatusResponse>(`/competitions/${id}/status`)),
  startTest: (id: string) =>
    call(apiClient.post<StartTestResponse>(`/competitions/${id}/start-test`)),
  mySession: (id: string) =>
    call(apiClient.get<MySessionResponse>(`/competitions/${id}/my-session`)),
  questions: (id: string) =>
    call(apiClient.get<{ questions: StartTestResponse['questions'] }>(`/competitions/${id}/questions`)).then((r) => r.questions),
  submit: (id: string, questionId: string, selectedOption: OptionKey | null) =>
    call(
      apiClient.post<{ ok: boolean; questionId: string; selectedOption: OptionKey | null; submittedAt: string; score: number }>(
        `/competitions/${id}/submit`,
        { questionId, selectedOption },
      ),
    ),
  complete: (id: string) =>
    call(apiClient.post<{ ok: boolean; status: string; score: number }>(`/competitions/${id}/complete`)),
};
