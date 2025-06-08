const puppeteer = require('puppeteer');
const fs = require('fs');
    
async function scrapeCvbankas(jobTitle, city) {
    console.log(`📊 Starting new search for job: ${jobTitle} in ${city}`);
    
    // Launch browser with additional debug options
const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', // or wherever Chrome is installed
    args: ['--window-size=1366,768', '--disable-features=site-per-process'],
    userDataDir: 'C:/Users/YourUsername/puppeteer_cache'
});
    
    const page = await browser.newPage();
    
    // Set a unique user agent to avoid caching
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62');
    
    // Enable console logging from the browser
    page.on('console', msg => console.log('Browser console:', msg.text()));

    // Clear browser cache before navigating
    await page.setCacheEnabled(false);
    
    const query = `https://www.cvbankas.lt/?keyw=${encodeURIComponent(jobTitle)}&city=${encodeURIComponent(city)}`;
    console.log('Opening page: ', query);
    
    // Navigate to the page and wait for network to be idle
    await page.goto(query, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for the page to load and be ready
    await page.waitForSelector('body', { visible: true, timeout: 15000 });
    console.log('Page loaded');

    try {
        // Check for the "Sutinku" button (cookie consent)
        console.log('Waiting for cookie consent dialog...');
        
        // Wait for the cookie consent dialog to appear (adjust selector if needed)
        await page.waitForSelector('#cookieConsentModal, .fc-consent-root, .fc-dialog, .fc-dialog-container', { 
            visible: true, 
            timeout: 15000 
        }).catch(e => console.log('No cookie consent dialog found or timed out waiting for it'));
        
        console.log('Cookie dialog found or timed out, looking for accept button');
        
        // Try multiple possible selectors for the accept button
        const possibleSelectors = [
            'p.fc-button-label',
            '.fc-primary-button',
            '.fc-button-primary',
            'button.fc-cta-consent',
            'button.fc-button',
            'button[aria-label="consent"]',
            'button:contains("Sutinku")',
            '.fc-button:contains("Sutinku")'
        ];
        
        for (const selector of possibleSelectors) {
            try {
                const buttonExists = await page.$(selector);
                if (buttonExists) {
                    console.log(`Found button with selector: ${selector}`);
                    await page.click(selector);
                    console.log('Clicked accept button');
                    break;
                }
            } catch (err) {
                console.log(`Selector ${selector} not found or not clickable`);
            }
        }
    } catch (error) {
        console.log('Cookie consent handling error:', error.message);
    }

    // Use a simple Promise-based timeout that works in all Puppeteer versions
    console.log('Waiting for page to settle...');
    await page.waitForSelector('.list_article, article', { timeout: 10000 })
        .catch(e => console.log('Timeout waiting for job listings, will try to continue anyway'));

    // Wait a bit longer to ensure all content is fully loaded
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Now scrape the job listings
    console.log('Scraping job listings...');
    
    // First check if we have job listings on the page
    const hasJobListings = await page.evaluate(() => {
        // Check for any articles or job listings
        const jobCards = document.querySelectorAll('article, .list_article, .list_a, [class*="job-list"], [class*="list_"]');
        console.log('Found potential job cards:', jobCards.length);
        
        // Debug what we found
        if (jobCards.length > 0) {
            console.log('First element class:', jobCards[0].className);
            console.log('First element HTML:', jobCards[0].outerHTML.slice(0, 200) + '...');
        }
        
        return jobCards.length;
    });
    
    console.log(`Found ${hasJobListings} potential job elements on page`);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'cvbankas-debug.png' });
    console.log('Saved debug screenshot to cvbankas-debug.png');
     
    // Now try to extract the job listings with more flexible selectors
    const jobs = await page.evaluate(() => {
        // Try different selectors that might contain job listings
        const jobCards = Array.from(document.querySelectorAll('article, .list_article, .list_a, [class*="job-list"], .list_cell'));
        console.log(`Trying to extract data from ${jobCards.length} elements`);
        
        const results = [];
        
        jobCards.forEach((card, index) => {
            try {
                // Try multiple possible selectors for each field
                const titleElement = 
                    card.querySelector('h3 > a, [class*="title"], [class*="position"], a[class*="list_h"]') || 
                    card.querySelector('a');
                    
                const title = titleElement?.innerText?.trim() || titleElement?.textContent?.trim();
                const url = titleElement?.href;
                
                const company = 
                    card.querySelector('.list_logo_txt, .dib, [class*="company"], [class*="employer"]')?.innerText?.trim() ||
                    card.querySelector('[class*="company"]')?.textContent?.trim();
                    
                const location = 
                    card.querySelector('.list_city, [class*="location"], [class*="city"]')?.innerText?.trim() ||
                    card.querySelector('[class*="location"]')?.textContent?.trim();
                
                console.log(`Job ${index}: Title=${title}, Company=${company}, Location=${location}, URL=${url}`);
                
                if (title && url) {
                    results.push({ 
                        title, 
                        company, 
                        location, 
                        url,
                        timestamp: new Date().toISOString() // Add timestamp for debugging
                    });
                }
            } catch (err) {
                console.log(`Error processing job card ${index}:`, err);
            }
        });
        
        return results;
    });

    // Add search metadata to help debug
    const searchMetadata = {
        searchQuery: {
            jobTitle,
            city
        },
        timestamp: new Date().toISOString(),
        resultsCount: jobs.length
    };

    // Write results with metadata
    fs.writeFileSync('cvbankas_jobs.json', JSON.stringify({
        metadata: searchMetadata,
        jobs: jobs
    }, null, 2));
    
    console.log(`✅ Išsaugota ${jobs.length} darbo skelbimų.`);

    await browser.close();
    return jobs;
}

// Allow command-line usage
const [,, jobTitle, city, timestamp] = process.argv;
if (!jobTitle || !city) {
    console.error("Naudojimas: node scrapeCvbankas.js 'programuotojas' 'Vilnius'");
    process.exit(1);
}

console.log(`Job search initiated at ${new Date().toISOString()} with timestamp ${timestamp || 'none'}`);
scrapeCvbankas(jobTitle, city);