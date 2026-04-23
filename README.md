# Verdant

Verdant turns a learning goal and a deadline into a realistic, calendar-aware study plan.

You tell it what you want to learn ("Korean", "data structures in Python", "fingerstyle guitar") and when you need to be ready. Verdant uses an LLM to design a multi-phase curriculum of lessons, reviews, and milestones, then distributes those sessions into the time windows you actually have free — respecting a daily workload cap and syncing to Google Calendar if you want. As you complete sessions and rate how well they worked (1–5), it learns which slots are effective for you and can reshape the schedule from plain-English edits like *"make this week lighter"* or *"move tomorrow to Thursday night"*.

It is built for learners who want structure without being handed a rigid, one-size-fits-all plan.

## Features

- **LLM-generated plans** — GPT-4o-mini produces a `SproutPlan` of phases and tasks from your goal, deadline, and starter resources. Falls back to a built-in template if no OpenAI key is set.
- **Constraint-aware scheduling** — Sessions are greedily packed into your weekly time windows, clamped to 15–120 min, capped per day.
- **Google Calendar sync** — Optional: every scheduled session is written as a calendar event.
- **Adaptive rescheduling** — Mark a session complete, rate it, miss a day, or reschedule from today; remaining work redistributes.
- **Natural-language edits** — Patch the plan with short phrases instead of drag-and-drop.
- **Slot-effectiveness learning** — Per-weekday-and-time ratings accumulate in your preferences for future planning.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Prisma + SQLite · NextAuth v5 (Google) · OpenAI SDK · Google Calendar API · Zod.

## Example: creating and running a plan

1. Open `http://localhost:3000` and click **Get started** → sign in with Google.
2. Go to **Settings** and set your weekly availability and daily cap, for example:
   ```json
   {
     "Mon": [{ "start": "19:00", "end": "21:00" }],
     "Tue": [{ "start": "19:00", "end": "21:00" }],
     "Wed": [{ "start": "19:00", "end": "21:00" }],
     "Thu": [{ "start": "19:00", "end": "21:00" }],
     "Fri": [{ "start": "19:00", "end": "21:00" }],
     "Sat": [{ "start": "10:00", "end": "12:00" }],
     "Sun": [{ "start": "10:00", "end": "12:00" }]
   }
   ```
   Max minutes/day: `90`. Toggle **Connect Google Calendar** if you want sessions synced.
3. On the dashboard click **New sprout** and submit:
   - Goal: `Data structures in Python`
   - Deadline: `2026-06-15`
   - Resources: `https://leetcode.com/`, `NeetCode 150`
4. Verdant calls the LLM, builds a schedule inside your windows, writes calendar events (if connected), and drops you on the plan page with phases and upcoming sessions.
5. After a session, toggle **Complete** and pick an effectiveness rating 1–5. Effectiveness is stored per time-slot and used to inform future scheduling.
6. Missed a few days? Hit **Reschedule from today**, or type `make this week lighter` / `move tomorrow to Thursday night` into the edit box to patch the plan.

## Running it locally

### Prerequisites

- Node 18+ and npm
- A Google Cloud OAuth client (Web application) with `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Enable the Google Calendar API on the same project if you want calendar sync.
- Optional: an OpenAI API key. Without it, plan generation falls back to a template.

### Setup

```bash
git clone <your-fork-url> verdant
cd verdant
npm install            # runs `prisma generate` via postinstall
cp .env.example .env   # then fill in the values below
npm run db:push        # create the SQLite schema at ./dev.db
npm run dev            # start the Next.js dev server on :3000
```

Fill in `.env`:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="$(openssl rand -base64 32)"
AUTH_URL="http://localhost:3000"
AUTH_GOOGLE_ID="<google-oauth-client-id>"
AUTH_GOOGLE_SECRET="<google-oauth-client-secret>"
OPENAI_API_KEY=""   # optional
```

Then open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server with hot reload |
| `npm run build` | `prisma generate && next build` |
| `npm start` | Run the production build |
| `npm run db:push` | Apply the Prisma schema to the SQLite database |
| `npm run lint` | ESLint |

## Project layout

```
src/
  app/
    page.tsx              # landing
    login/                # Google sign-in
    dashboard/            # active plan + upcoming sessions
    plan/new/             # create-a-sprout form
    plan/[id]/            # plan detail, completions, edits
    settings/             # time windows, daily cap, calendar toggle
    api/
      plans/              # POST create, GET active, PATCH update/reschedule
      preferences/        # GET/PATCH time windows + slot effectiveness
      auth/[...nextauth]/ # NextAuth handler
prisma/
  schema.prisma           # User, LearningPlan, TaskCompletion, UserPreference
```

## Notes

- **No OpenAI key?** `generateSproutPlan()` returns a template sprout with foundation/practice/review/milestone tasks — the rest of the app works unchanged.
- **Calendar sync** requires the Google account to have granted the Calendar scope during sign-in; toggle **Connect Google Calendar** in Settings.
- Data lives in a local SQLite file by default (`dev.db`). Swap `DATABASE_URL` to Postgres for production and re-run `prisma db push` / migrate.
