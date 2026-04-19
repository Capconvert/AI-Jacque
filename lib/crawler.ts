import { load } from 'cheerio';
import { sql } from '@vercel/postgres';

export async function crawlWebsite(clientId: number, baseUrl: string) {
  try {
    const response = await fetch(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await response.text();
    const $ = load(html);

    const pages: { url: string; title: string; content: string }[] = [];
    const seenUrls = new Set<string>();

    // Extract all links
    $('a[href]').each((_, el) => {
      let href = $(el).attr('href');
      if (!href) return;

      if (href.startsWith('http')) {
        if (!href.includes(new URL(baseUrl).hostname)) return;
      } else {
        href = new URL(href, baseUrl).toString();
      }

      if (seenUrls.has(href) || href.includes('#')) return;
      seenUrls.add(href);

      pages.push({ url: href, title: '', content: '' });
    });

    // Crawl each page (limit to 50 pages to stay fast)
    for (const page of pages.slice(0, 50)) {
      try {
        const pageResponse = await fetch(page.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!pageResponse.ok) continue;

        const pageHtml = await pageResponse.text();
        const $page = load(pageHtml);

        page.title = $page('title').text() || $page('h1').first().text();
        page.content = $page('body').text().slice(0, 5000); // Limit content

        // Store in DB
        try {
          await sql`
            INSERT INTO crawled_pages (client_id, url, title, content)
            VALUES (${clientId}, ${page.url}, ${page.title}, ${page.content})
            ON CONFLICT (client_id, url) DO UPDATE SET
              title = ${page.title},
              content = ${page.content},
              crawled_at = CURRENT_TIMESTAMP
          `;
        } catch (e) {
          // Skip duplicate URLs
        }
      } catch (error) {
        console.error(`Failed to crawl ${page.url}:`, error);
      }
    }

    // Update client's last_crawled
    const summary = pages.slice(0, 50).map(p => `${p.title}: ${p.content.slice(0, 200)}`).join('\n---\n');
    await sql`
      UPDATE clients
      SET crawled_content = ${summary}, last_crawled = CURRENT_TIMESTAMP
      WHERE id = ${clientId}
    `;

    return { success: true, pagesCount: Math.min(50, pages.length) };
  } catch (error) {
    console.error('Crawl error:', error);
    return { success: false, error: String(error) };
  }
}
