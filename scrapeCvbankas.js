const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

app.get('/scrape', async (req, res) => {
  const jobTitle = req.query.job;
  const city = req.query.city;

  if (!jobTitle || !city) {
    return res.status(400).json({ success: false, error: 'Missing job or city query parameter' });
  }

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768']
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62');

    const query = `https://www.cvbankas.lt/?keyw=${encodeURIComponent(jobTitle)}&city=${encodeURIComponent(city)}`;
    await page.goto(query, { waitUntil: 'networkidle2', timeout: 30000 });

    // Scraping logic here — same as your current scrape function, adapted for express

    const jobs = await page.evaluate(() => {
      const jobCards = Array.from(document.querySelectorAll('article, .list_article, .list_a, [class*="job-list"], .list_cell'));
      const results = [];

      jobCards.forEach(card => {
        const titleElement = card.querySelector('h3 > a, [class*="title"], [class*="position"], a[class*="list_h"]') || card.querySelector('a');
        const title = titleElement?.innerText?.trim() || titleElement?.textContent?.trim();
        const url = titleElement?.href;
        const company = card.querySelector('.list_logo_txt, .dib, [class*="company"], [class*="employer"]')?.innerText?.trim() || card.querySelector('[class*="company"]')?.textContent?.trim();
        const location = card.querySelector('.list_city, [class*="location"], [class*="city"]')?.innerText?.trim() || card.querySelector('[class*="location"]')?.textContent?.trim();

        if (title && url) {
          results.push({ title, company, location, url });
        }
      });

      return results;
    });

    await browser.close();

    res.json({ success: true, jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

