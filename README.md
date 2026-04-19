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

## Key Files

- `/app/page.tsx` - Main dashboard
- `/app/admin/page.tsx` - Bulk upload clients
- `/app/api/ask/route.ts` - Question handler
- `/app/api/crawl/route.ts` - Website crawler
- `/lib/ai-jacque.ts` - Claude AI integration
- `/lib/crawler.ts` - Web scraping logic
