# AI Jacque - Search Marketing Assistant

AI version of Jacque to answer client questions using their website context.

## Setup

1. **Create Vercel Postgres Database**
   - Go to Vercel Dashboard → Storage → Create Postgres
   - Copy the connection string

2. **Set Environment Variables** in `.env.local`:
   ```
   POSTGRES_URL=your_vercel_postgres_url
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Initialize Database**
   ```
   curl http://localhost:3000/api/init -X POST
   ```

4. **Upload Clients**
   - Go to `/admin`
   - Paste CSV: `Client Name,https://website.com` (one per line)
   - Click Upload

5. **Crawl All Clients**
   - On main page, click "Crawl All Clients"
   - Wait for crawl to complete

6. **Start Using**
   - Select a client
   - Ask questions
   - AI Jacque responds with client-aware answers

## Development

```bash
npm run dev
```

Open http://localhost:3000

## Kanban Board (`/pm/kanban`)

Internal task board for Capconvert employees. Drag-and-drop across **To Do → Doing → Done** columns. Every task create / update / move / complete posts a notification to Slack `#comms`.

### One-time setup

1. **Initialize the kanban schema** (creates `kanban_boards`, `kanban_tasks`, `kanban_task_activities` tables plus a default "Capconvert Ops" board):
   ```
   curl http://localhost:3000/api/kanban/init -X POST
   ```

2. **Hook up the Slack webhook for `#comms`:**
   - In Slack, click the workspace name → **Tools & settings** → **Manage apps**
   - Search for **Incoming Webhooks** → **Add to Slack**
   - Pick channel **#comms** → **Add Incoming Webhooks integration**
   - Copy the webhook URL
   - Add to `.env.local`:
     ```
     SLACK_COMMS_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
     NEXT_PUBLIC_APP_URL=https://capconvert.com  # for task deep-links; use http://localhost:3000 locally
     ```
   - Restart the dev server / redeploy.

   Slack failures never block a task write — they log a warning and continue.

### Keyboard shortcuts

- `N` — new task (quick-add modal)
- `Esc` — close drawer / modal

## Key Files

- `/app/page.tsx` - Main dashboard
- `/app/admin/page.tsx` - Bulk upload clients
- `/app/api/ask/route.ts` - Question handler
- `/app/api/crawl/route.ts` - Website crawler
- `/lib/ai-jacque.ts` - Claude AI integration
- `/lib/crawler.ts` - Web scraping logic
- `/app/pm/kanban/page.tsx` - Kanban board UI
- `/app/api/kanban/*` - Kanban CRUD + reorder endpoints
- `/lib/slack.ts`, `/lib/slack-messages.ts` - Slack webhook + Block Kit formatters
