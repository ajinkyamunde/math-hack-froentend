import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, ErrorAlert } from '../components/common/Alert';
import { DifficultyBadge, StatusBadge } from '../components/common/Badges';
import { Loading } from '../components/common/Loading';
import { Panel } from '../components/common/Panel';
import { AnswerOptions } from '../components/questions/AnswerOptions';
import { CompetitionClock } from '../components/timers/CompetitionClock';
import { useStudentCompetition } from '../features/competition/useStudentCompetition';
import { useNow } from '../hooks/useNow';
import type { OptionKey } from '../types';
import { remainingUntil } from '../utils/serverClock';

function ConnectionIndicator({ state }: { state: 'connecting' | 'online' | 'offline' }) {
  const label = state === 'online' ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Reconnecting… (updating)';
  return (
    <span className={`connection connection--${state === 'online' ? 'online' : 'offline'}`} role="status">
      <span className="dot" aria-hidden="true" /> {label}
    </span>
  );
}

export function CompetitionPage() {
  const { id } = useParams();
  const live = useStudentCompetition(id);
  const { state } = live;
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const paused = state?.status === 'PAUSED';
  const now = useNow(250, Boolean(live.session && state?.status === 'RUNNING'));
  const question = state?.currentQuestion ?? null;
  const submission = question && state?.mySubmission?.questionId === question.id ? state.mySubmission : null;

  // A new question clears the previous selection.
  useEffect(() => setSelected(null), [question?.id]);

  async function handleNextQuestion() {
    setLoadingNext(true);
    try {
      await live.fetchNextQuestion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoadingNext(false);
    }
  }

  if (live.loading) return <Loading label="Entering the arena…" />;

  if (live.error?.code === 'PARTICIPANT_REMOVED' || live.error?.message?.includes('removed by the host')) {
    return (
      <Panel holo title="Access Removed">
        <Alert tone="error" title="Access Revoked">
          Your access to this competition has been removed by the host.
        </Alert>
        <div style={{ marginTop: 20 }}>
          <Link className="btn btn--gold" to="/student">Back to dashboard</Link>
        </div>
      </Panel>
    );
  }

  if (!state) return <ErrorAlert error={live.error} title="Competition unavailable" />;

  const competitionLeft = paused ? state.remainingMs : remainingUntil(state.endsAt, undefined, now);
  const locked = Boolean(submission) || paused || live.submitting;

  if (!state.joined) {
    return (
      <Panel holo title={state.name}>
        <p className="muted">You have not joined this competition yet.</p>
        <ErrorAlert error={live.error} />
        {['WAITING', 'RUNNING', 'PAUSED'].includes(state.status) ? (
          <button type="button" className="btn btn--gold" onClick={() => void live.join()}>Join competition</button>
        ) : (
          <Link className="btn" to="/student">Back to dashboard</Link>
        )}
      </Panel>
    );
  }

  return (
    <div className="stack arena-stack">
      <header className="arena-header">
        <div className="arena-header__main">
          <div className="arena-header__info">
            <span className="eyebrow" style={{ fontSize: '0.72rem', letterSpacing: '0.12em' }}>Live arena</span>
            <h1 className="arena-header__title">{state.name}</h1>
          </div>
          <div className="arena-header__meta">
            <StatusBadge status={state.status} />
            <ConnectionIndicator state={live.connection} />
          </div>
        </div>
        {live.session && (
          <div className="arena-header__clock">
            <CompetitionClock remainingMs={competitionLeft} paused={paused} />
          </div>
        )}
      </header>

      {/* Participant has registered, but test has not been started yet */}
      {!live.session && !live.examCompleted && state.status !== 'COMPLETED' && state.status !== 'CANCELLED' && (
        <>
          {state.status === 'WAITING' ? (
            <Panel holo title="Ready to Compete">
              <h2>Assemble and stand by</h2>
              <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '1.05rem' }}>
                You are registered for this competition. The <strong>Start Test</strong> button will automatically unlock the moment the host starts the competition.
              </p>
              <button
                type="button"
                className="btn btn--gold"
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
                title="Waiting for host to start competition"
              >
                Start Test (Waiting for host)
              </button>
            </Panel>
          ) : (
            <Panel holo title="Competition is Live!">
              <h2>Host has activated the competition</h2>
              <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '1.05rem' }}>
                The competition is live! Click below to start your test. Your individual countdown timer will begin counting down the moment you start.
              </p>
              {live.error && <ErrorAlert error={live.error} />}
              <button
                type="button"
                className="btn btn--gold btn--block"
                style={{ padding: '14px 24px', fontSize: '1.15rem', fontWeight: 700 }}
                onClick={() => void live.startTest()}
                disabled={live.startingTest}
              >
                {live.startingTest ? 'Initializing your exam session…' : 'Start Test →'}
              </button>
            </Panel>
          )}
        </>
      )}

      {paused && <Alert tone="warning" title="Competition paused">The clock is frozen. Answers open again when the host resumes.</Alert>}

      {/* Active Exam Session with Questions */}
      {live.session && !live.examCompleted && (
        <>
          {question ? (
            <form
              ref={formRef}
              className="panel panel--holo question-card mh-animate-in"
              onSubmit={(event) => {
                event.preventDefault();
                if (selected && !locked) void live.submit(question.id, selected);
              }}
              aria-labelledby="question-heading"
            >
              <div className="row row--between" style={{ alignItems: 'center' }}>
                <h2 id="question-heading" style={{ margin: 0, fontSize: 'clamp(1.1rem, 3.5vw, 1.45rem)' }}>
                  Question {state.questionNumber ?? ''}{state.totalQuestions ? ` of ${state.totalQuestions}` : ''}
                </h2>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <DifficultyBadge difficulty={question.difficulty} />
                </div>
              </div>
              <p className="question-text">{question.questionText}</p>
              <AnswerOptions
                name={`q-${question.id}`}
                options={question.options}
                selected={submission?.selectedOption ?? selected}
                onSelect={setSelected}
                locked={locked}
              />
              {live.submitError && <Alert tone="error">{live.submitError}</Alert>}
              <div className="submit-bar">
                {submission ? (
                  <div className="stack" style={{ gap: 12 }}>
                    <Alert tone="success" title="Answer locked">
                      Your answer ({submission.selectedOption}) is permanently locked.
                    </Alert>
                    <div className="row" style={{ gap: 10 }}>
                      <button
                        type="button"
                        className="btn btn--gold btn--block btn--next-question"
                        onClick={handleNextQuestion}
                        disabled={loadingNext}
                      >
                        {loadingNext ? (
                          <span className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                            <span className="spinner" aria-hidden="true" />
                            <span>Fetching next question…</span>
                          </span>
                        ) : state.questionNumber === state.totalQuestions ? (
                          'Review / Next Question'
                        ) : (
                          'NEXT QUESTION →'
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => void live.completeTest()}
                      >
                        Finish Test
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="submit" className="btn btn--gold btn--block" disabled={!selected || locked}>
                    {live.submitting ? 'Locking answer…' : selected ? `Submit & lock answer (${selected})` : 'Select an answer'}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <Panel holo>
              <h2>All questions answered!</h2>
              <p className="muted" style={{ margin: '0 0 16px 0' }}>
                You have answered all available questions. You may submit your test now or wait for the timer to expire.
              </p>
              <button
                type="button"
                className="btn btn--gold"
                onClick={() => void live.completeTest()}
              >
                Submit & Finish Exam
              </button>
            </Panel>
          )}
        </>
      )}

      {(live.examCompleted || state.status === 'COMPLETED' || state.status === 'CANCELLED') && (
        <Panel holo title={state.status === 'CANCELLED' ? 'Competition cancelled' : 'Competition complete'}>
          <h2>Test Completed</h2>
          <p className="muted" style={{ margin: '0 0 16px 0' }}>
            Your responses have been successfully recorded and scored.
          </p>
          {state.status === 'COMPLETED' || (live.examCompleted && state.status !== 'CANCELLED') ? (
            <Link className="btn btn--gold" to={`/student/competitions/${state.id}/leaderboard`}>See your results</Link>
          ) : (
            <Link className="btn" to="/student">Back to dashboard</Link>
          )}
        </Panel>
      )}
    </div>
  );
}
