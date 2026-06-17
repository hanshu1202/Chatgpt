const { chromium } = require("playwright");
const fs = require("fs");

const START_URL = process.env.START_URL;
const MAX_CHAPTERS = parseInt(process.env.MAX_CHAPTERS || "1000");

if (!START_URL) {
    throw new Error("START_URL missing");
}

(async () => {
    const browser = await chromium.launch({
        headless: true
    });

    const context = await browser.newContext({
        viewport: {
            width: 1920,
            height: 1080
        },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    });

    // ===== COOKIE FIX =====
    const rawCookies = JSON.parse(process.env.TOMATO_COOKIES || "[]");

    const cookies = rawCookies
        .filter(c => c.name && c.value)
        .map(c => ({
            name: c.name,
            value: c.value,
            domain: ".tomatomtl.com",
            path: "/",
            secure: true,
            httpOnly: !!c.httpOnly
        }));

    console.log(`Loaded ${cookies.length} cookies`);

    await context.addCookies(cookies);
    // ======================

    const page = await context.newPage();

    const chapters = [];
    const visited = new Set();

    let currentUrl = START_URL;

    for (let i = 0; i < MAX_CHAPTERS; i++) {

        if (!currentUrl || visited.has(currentUrl))
            break;

        visited.add(currentUrl);

        console.log("Opening:", currentUrl);

        await page.goto(currentUrl, {
            waitUntil: "networkidle",
            timeout: 120000
        });

        await page.screenshot({
            path: `debug-${i}.png`,
            fullPage: true
        });

        await page.waitForSelector(
            "#chapter_content span.kxa",
            {
                timeout: 60000
            }
        );

        const title = await page.evaluate(() => {
            return (
                document.querySelector("h1")?.textContent?.trim() ||
                document.title
            );
        });

        const content = await page.$$eval(
            "#chapter_content span.kxa",
            spans =>
                spans
                    .map(
                        s =>
                            s.getAttribute("transtext") ||
                            s.textContent ||
                            ""
                    )
                    .join("\n\n")
        );

        console.log("Saved:", title);

        chapters.push(
`============================================================
${title}
============================================================

${content}
`
        );

        const nextUrl = await page.evaluate(() => {
            const btn = document.querySelector(
                "a.nav-button.next"
            );

            return btn ? btn.href : null;
        });

        if (!nextUrl) {
            console.log("No next chapter found.");
            break;
        }

        currentUrl = nextUrl;

        await page.waitForTimeout(
            1500 + Math.floor(Math.random() * 2500)
        );
    }

    fs.writeFileSync(
        "novel.txt",
        chapters.join("\n\n\n"),
        "utf8"
    );

    await browser.close();

    console.log(
        `Finished. Saved ${chapters.length} chapter(s).`
    );
})();
