import { useCallback, useEffect, useRef, useState } from 'react';
import { competitionService, type ExamSessionInfo, type StartTestResponse } from '../../services/competitionService';
import { toApiError, ApiError } from '../../services/apiClient';
import type { LeaderboardEntry, OptionKey, PublicQuestion, StudentCompetitionState } from '../../types';
import { syncServerClock } from '../../utils/serverClock';
import { useCompetitionSocket, type ConnectionState } from './useCompetitionSocket';

export interface ClosedQuestion {
  questionId: string;
  correctOption?: OptionKey;
  explanation?: string | null;
  reason?: string;
}

type Submission = StudentCompetitionState['mySubmission'];

export function useStudentCompetition(competitionId: string | undefined) {
  const [state, setState] = useState<StudentCompetitionState | null>(null);
  const [session, setSession] = useState<ExamSessionInfo | null>(null);
  const [examQuestions, setExamQuestions] = useState<StartTestResponse['questions']>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, { selectedOption: OptionKey | null; submittedAt: string }>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingTest, setStartingTest] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lastClosed] = useState<ClosedQuestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [examCompleted, setExamCompleted] = useState(false);
  const [effectiveConnection, setEffectiveConnection] = useState<ConnectionState>('connecting');
  const lastHttpSuccessRef = useRef<number>(Date.now());

  /** Builds composite StudentCompetitionState from individual session + general state */
  const computeCompositeState = useCallback(
    (
      baseState: StudentCompetitionState,
      currentSession: ExamSessionInfo | null,
      questions: StartTestResponse['questions'],
      answers: Record<string, { selectedOption: OptionKey | null; submittedAt: string }>,
      qIndex: number,
    ): StudentCompetitionState => {
      if (!currentSession || questions.length === 0) {
        return baseState;
      }

      const activeQ = questions[qIndex] ?? null;
      const existingAns = activeQ ? answers[activeQ.id] : null;

      const publicQ: PublicQuestion | null = activeQ
        ? {
            id: activeQ.id,
            questionText: activeQ.questionText,
            options: activeQ.options,
            difficulty: activeQ.difficulty,
            timeLimitSeconds: activeQ.timeLimitSeconds,
            points: activeQ.points,
            deadline: currentSession.expiresAt,
            remainingMs: Math.max(0, new Date(currentSession.expiresAt).getTime() - Date.now()),
          }
        : null;

      const mySubmission: Submission = existingAns
        ? {
            questionId: activeQ!.id,
            selectedOption: existingAns.selectedOption,
            submittedAt: existingAns.submittedAt,
          }
        : null;

      const remainingMs = Math.max(0, new Date(currentSession.expiresAt).getTime() - Date.now());

      return {
        ...baseState,
        status: currentSession.status === 'ACTIVE' ? 'RUNNING' : baseState.status,
        currentQuestion: publicQ,
        questionNumber: activeQ ? qIndex + 1 : null,
        totalQuestions: questions.length,
        remainingMs,
        endsAt: currentSession.expiresAt,
        mySubmission,
        waitingForHost: false,
      };
    },
    [],
  );

  const applyState = useCallback((next: StudentCompetitionState) => {
    syncServerClock(next.serverNow);
    lastHttpSuccessRef.current = Date.now();
    setEffectiveConnection('online');
    setState((previous) => {
      if (previous?.mySubmission && previous.currentQuestion && next.currentQuestion?.id !== previous.currentQuestion.id) {
        return {
          ...next,
          currentQuestion: previous.currentQuestion,
          questionNumber: previous.questionNumber,
          mySubmission: previous.mySubmission,
          joined: previous?.joined || next.joined,
        };
      }
      const keepSubmission: Submission =
        next.mySubmission ?? (previous?.mySubmission && previous.mySubmission.questionId === next.currentQuestion?.id ? previous.mySubmission : null);
      return { ...next, joined: previous?.joined || next.joined, mySubmission: keepSubmission };
    });
  }, []);

  const fetchState = useCallback(async () => {
    if (!competitionId) return;
    try {
      const [fresh, mySessionData] = await Promise.all([
        competitionService.studentState(competitionId).catch(() => null),
        competitionService.mySession(competitionId).catch(() => null),
      ]);

      if (fresh) {
        syncServerClock(fresh.serverNow);
        lastHttpSuccessRef.current = Date.now();
        setEffectiveConnection('online');
        setError(null);

        if (mySessionData?.session) {
          const sess = mySessionData.session;
          const qs = mySessionData.questions ?? [];
          const ans = mySessionData.answers ?? {};
          setSession(sess);
          setExamQuestions(qs);
          setExamAnswers(ans);
          if (sess.status === 'COMPLETED' || sess.status === 'EXPIRED') {
            setExamCompleted(true);
          }

          // Pick the first unanswered question or 0
          let firstUnanswered = qs.findIndex((q) => !ans[q.id]);
          if (firstUnanswered === -1) firstUnanswered = Math.max(0, qs.length - 1);
          setCurrentQuestionIndex(firstUnanswered);

          setState(computeCompositeState(fresh, sess, qs, ans, firstUnanswered));
        } else {
          setState(fresh);
        }
      }
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === 'PARTICIPANT_REMOVED' || apiErr.message.includes('removed by the host')) {
        setState(null);
        setSession(null);
      } else if (Date.now() - lastHttpSuccessRef.current > 12000) {
        setEffectiveConnection('offline');
      }
      setError(apiErr);
    } finally {
      setLoading(false);
    }
  }, [competitionId, computeCompositeState]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  // Connect to SSE event stream
  const rawSseConnection = useCompetitionSocket<StudentCompetitionState>(
    competitionId,
    Boolean(state?.joined),
    {
      'competition:state': (payload: StudentCompetitionState) => {
        if (!session) applyState(payload);
      },
      'competition:started': () => {
        setState((prev) => (prev ? { ...prev, status: 'RUNNING' } : prev));
      },
      'competition:paused': () => {
        setState((prev) => (prev ? { ...prev, status: 'PAUSED' } : prev));
      },
      'competition:resumed': () => {
        setState((prev) => (prev ? { ...prev, status: 'RUNNING' } : prev));
      },
      'competition:completed': () => {
        setState((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
      },
      'participant:removed': (payload: { competitionId: string; message: string }) => {
        if (payload.competitionId === competitionId) {
          setError(new ApiError(payload.message || 'Your access to this competition has been removed by the host.', 403, 'PARTICIPANT_REMOVED'));
          setState(null);
          setSession(null);
        }
      },
      'leaderboard:updated': (payload: { entries: LeaderboardEntry[] }) => setLeaderboard(payload.entries),
    } as unknown as Record<string, (payload: never) => void>,
    (initialData: { status?: string }) => {
      if (initialData?.status === 'ACTIVE' || initialData?.status === 'RUNNING') {
        setState((prev) => (prev ? { ...prev, status: 'RUNNING' } : prev));
      }
    },
    (err) => setError(toApiError(err)),
  );

  useEffect(() => {
    if (rawSseConnection === 'online') {
      setEffectiveConnection('online');
    } else if (Date.now() - lastHttpSuccessRef.current < 12000) {
      setEffectiveConnection('online');
    } else {
      setEffectiveConnection('offline');
    }
  }, [rawSseConnection]);

  const join = useCallback(async () => {
    if (!competitionId) return;
    try {
      const joined = await competitionService.join(competitionId);
      setState(joined);
      syncServerClock(joined.serverNow);
      lastHttpSuccessRef.current = Date.now();
      setEffectiveConnection('online');
      setError(null);
    } catch (err) {
      setError(toApiError(err));
    }
  }, [competitionId]);

  // Individual Participant Start Test
  const startTest = useCallback(async () => {
    if (!competitionId) return;
    setStartingTest(true);
    setError(null);
    try {
      const data = await competitionService.startTest(competitionId);
      syncServerClock(data.session.serverNow);
      setSession(data.session);
      setExamQuestions(data.questions);
      setExamAnswers(data.answers);
      setCurrentQuestionIndex(0);

      if (state) {
        setState(computeCompositeState(state, data.session, data.questions, data.answers, 0));
      }
      lastHttpSuccessRef.current = Date.now();
      setEffectiveConnection('online');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setStartingTest(false);
    }
  }, [competitionId, state, computeCompositeState]);

  // Individual Participant Submit Answer
  const submit = useCallback(
    async (questionId: string, option: OptionKey) => {
      if (!competitionId) return;
      setSubmitting(true);
      setSubmitError(null);
      const submissionRecord = { questionId, selectedOption: option, submittedAt: new Date().toISOString() };

      // Optimistic lock
      setExamAnswers((prev) => ({ ...prev, [questionId]: submissionRecord }));
      setState((prev) => (prev ? { ...prev, mySubmission: submissionRecord } : prev));

      try {
        await competitionService.submit(competitionId, questionId, option);
        lastHttpSuccessRef.current = Date.now();
        setEffectiveConnection('online');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ALREADY_SUBMITTED') || msg.includes('already submitted')) {
          setSubmitError(null);
        } else {
          setSubmitError(msg || 'Your answer could not be submitted.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [competitionId],
  );

  // Advance to next question
  const fetchNextQuestion = useCallback(async () => {
    if (examQuestions.length > 0 && session) {
      const nextIndex = currentQuestionIndex + 1;
      if (nextIndex < examQuestions.length) {
        setCurrentQuestionIndex(nextIndex);
        if (state) {
          setState(computeCompositeState(state, session, examQuestions, examAnswers, nextIndex));
        }
        return;
      }
    }

    // If beyond questions, try to refresh or complete
    if (competitionId) {
      try {
        const fresh = await competitionService.studentState(competitionId);
        syncServerClock(fresh.serverNow);
        setState(fresh);
      } catch {
        // ignore
      }
    }
  }, [competitionId, examQuestions, session, currentQuestionIndex, state, examAnswers, computeCompositeState]);

  const completeTest = useCallback(async () => {
    if (!competitionId) return;
    try {
      await competitionService.complete(competitionId);
      setExamCompleted(true);
      if (state) {
        setState({ ...state, status: 'COMPLETED' });
      }
    } catch (err) {
      setError(toApiError(err));
    }
  }, [competitionId, state]);

  return {
    state,
    session,
    error,
    loading,
    startingTest,
    connection: effectiveConnection,
    leaderboard,
    lastClosed,
    submitting,
    submitError,
    examCompleted,
    currentQuestionIndex,
    totalExamQuestions: examQuestions.length,
    join,
    startTest,
    submit,
    completeTest,
    fetchNextQuestion,
    refresh: fetchState,
  };
}
