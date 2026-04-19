# AI Jacque - Setup Instructions

## Step 1: Vercel Database Setup

1. Go to your Vercel Dashboard
2. Click "Storage" → "Create Database" → Select "Postgres"
3. Copy the full connection string (starts with `postgresql://`)
4. Add to `.env.local`:
   ```
   POSTGRES_URL=postgresql://user:password@host/dbname
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   ```

## Step 2: Initialize Database

```bash
npm run dev
```

Then in another terminal:
```bash
curl http://localhost:3000/api/init -X POST
```

You should see: `{"success":true,"message":"Database initialized"}`

## Step 3: Upload 60 Clients

1. Format your client list as CSV: `ClientName,https://website.com`
2. Go to http://localhost:3000/admin
3. Paste your CSV (one client per line)
4. Click "Upload Clients"

## Step 4: Crawl Websites

1. Return to http://localhost:3000
2. Click "Crawl All Clients" button
3. Wait for completion (5-10 minutes for 60 sites)

## Step 5: Test & Train

1. Select a client from dropdown
2. Ask a test question
3. Review AI Jacque's response
4. Refine system prompt in `/lib/ai-jacque.ts` if needed
5. Repeat until satisfied

## Step 6: Deploy to Vercel

```bash
git init
git add .
git commit -m "Initial AI Jacque setup"
git branch -M main
git remote add origin https://github.com/yourusername/ai-jacque.git
git push -u origin main
```

Then connect to Vercel:
1. Visit https://vercel.com/new
2. Import your GitHub repo
3. Add env vars (`POSTGRES_URL`, `ANTHROPIC_API_KEY`)
4. Deploy

## Step 7: Enable Weekly Crawling

Vercel will automatically run `/api/crawl` weekly (Sundays at midnight UTC) based on `vercel.json` configuration.

## Troubleshooting

**Database connection fails:**
- Verify `POSTGRES_URL` is correct and starts with `postgresql://`

**Crawling is slow:**
- It crawls up to 50 pages per site. This is intentional to balance comprehensiveness with speed.

**AI responses don't mention client info:**
- Make sure crawl completed successfully
- Check that client has `last_crawled` timestamp in database

**How to view conversation history:**
```bash
# In Vercel Postgres console
SELECT client_id, question, answer FROM conversations ORDER BY created_at DESC LIMIT 20;
```

## Training Phase Checklist

- [ ] All 60 clients uploaded
- [ ] All clients crawled (check ✓ mark next to names)
- [ ] Test 10-15 different questions across different clients
- [ ] Review responses for accuracy and tone
- [ ] Adjust system prompt if needed
- [ ] Deploy to Vercel
- [ ] Share dashboard with team
