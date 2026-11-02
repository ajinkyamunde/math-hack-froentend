# MathHack — Frontend Application

Modern React single-page application for the MathHack real-time mathematical MCQ competition platform. Built with **React 19**, **Vite**, **TypeScript**, and **Server-Sent Events (SSE)**.

---

## Features

- **Marvel Comics Themed UI:** Immersive, high-contrast, responsive interface with comic panels, custom badges, and live feedback.
- **Individual Participant Exam Flow:**
  - Dynamic "Start Test" unlock when host activates competition.
  - Independent client-side countdown timer derived from authoritative server timestamp.
  - Secure answer locking (submitted answers are instantly locked and protected against duplication).
- **Native Server-Sent Events (SSE):** Seamless real-time state synchronization via browser `EventSource` with zero polling during active test.
- **Smart Fallback Polling:** Automatic fallback polling only if SSE connection drops while waiting for host unlock; stops permanently once unlocked.
- **Host Dashboard & Controls:**
  - Bulk question editor with difficulty, points, and time limit management.
  - Live participant management, participant deletion/restoration, and Excel export.
  - Host password reset modal.
- **Student Analytics & Results:** Visual breakdown of attempted, correct, incorrect, and unanswered questions upon competition completion.

---

## Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Start the backend Worker locally first (`npm run dev` in the backend repo, port 8787). The Vite dev server
proxies `/api` there, so no configuration is needed. To proxy somewhere else:

```bash
MATHHACK_BACKEND_URL=https://mathhack-api.your-subdomain.workers.dev npm run dev
```

### 3. Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

---

## Available Scripts

- `npm run dev`: Launch Vite development server with Hot Module Replacement (HMR).
- `npm run build`: Compile TypeScript and build production bundle to `dist/`.
- `npm run preview`: Preview production build locally.
- `npm run typecheck`: Check TypeScript types across the codebase.
- `npm run lint`: Run ESLint checks.
- `npm test`: Run unit and component tests with Vitest.
- `npm run test:e2e`: Run end-to-end browser tests with Playwright.

---

## Deployment

The backend is a Cloudflare Worker. The browser always calls `/api` on the frontend's own origin and the
hosting layer forwards it to the Worker, so the session cookie stays first-party (important on iOS Safari).

### Vercel
Edit `vercel.json` and replace `mathhack-api.YOUR-SUBDOMAIN.workers.dev` with your Worker's address, then
connect the repository to Vercel. No environment variables are needed. Set the Worker's `FRONTEND_URL` to
your Vercel site's address.

### Docker
```bash
docker build -t mathhack-frontend .
docker run -p 80:80 -e API_ORIGIN=https://mathhack-api.your-subdomain.workers.dev mathhack-frontend
```

### How the game works
1. Students register and join a competition once the host opens registration.
2. When the host starts the competition, every Start Test button unlocks at once.
3. Each student clicks Start Test when ready and gets their own timer (the competition's duration).
4. Answers lock as soon as they are submitted.
5. A student's test ends when they press Submit & Finish or their timer runs out; their results are shown right away.
6. The host ends the competition when everyone is done; that also stops anyone still answering.
