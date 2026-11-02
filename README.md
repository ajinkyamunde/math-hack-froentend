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

Copy the example environment file:

```bash
cp .env.example .env
```

Configure `VITE_API_URL` to point to your backend API server (e.g. `http://localhost:4000` or production Render backend URL).

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

### Vercel Deployment
This repository includes a production `vercel.json` with single-page application rewrites and `/api/*` proxy rules.
Simply connect this repository to Vercel and set `VITE_API_URL` in your environment variables.

### Docker Deployment
A production `Dockerfile` and `nginx.conf` are included for containerized hosting.
```bash
docker build -t mathhack-frontend .
docker run -p 80:80 mathhack-frontend
```
