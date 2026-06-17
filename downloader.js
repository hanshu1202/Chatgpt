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

    const page = await context.newPage();

    const chapters = [];
    const visited = new Set();

    let currentUrl = START_URL;

    for (let i = 0; i < MAX_CHAPTERS; i++) {

        if (!currentUrl || visited.has(currentUrl))
            break;

        visited.add(currentUrl);

        console.log(`\nOpening: ${currentUrl}`);

        try {
            await page.goto(currentUrl, {
                waitUntil: "load",
                timeout: 120000
            });
        } catch (err) {
            console.log("Navigation warning:", err.message);
        }

        await page.waitForTimeout(20000);

        await page.screenshot({
            path: `debug-${i}.png`,
            fullPage: true
        });

        fs.writeFileSync(
            `debug-${i}.html`,
            await page.content(),
            "utf8"
        );

        console.log("Waiting for chapter content...");

        try {
            await page.waitForFunction(() => {
                const content =
                    document.querySelector("#chapter_content");

                if (!content)
                    return false;

                if (
                    content.querySelector(".placeholder")
                )
                    return false;

                return (
                    content.innerText.trim().length > 500
                );
            }, {
                timeout: 120000
            });
        } catch (err) {

            console.log("Content never loaded");

            const title = await page.title();

            fs.writeFileSync(
                "FAILED.txt",
                `
URL:
${currentUrl}

TITLE:
${title}

REASON:
Chapter content did not load within timeout.
`,
                "utf8"
            );

            await page.screenshot({
                path: "failed.png",
                fullPage: true
            });

            fs.writeFileSync(
                "failed.html",
                await page.content(),
                "utf8"
            );

            await browser.close();
            process.exit(1);
        }

        const title = await page.evaluate(() => {
            return (
                document.querySelector("h1")
                    ?.textContent
                    ?.trim() ||
                document.title
            );
        });

        const content = await page.evaluate(() => {
            const spans = document.querySelectorAll(
                "#chapter_content span.kxa"
            );

            if (spans.length > 0) {
                return [...spans]
                    .map(
                        s =>
                            s.getAttribute("transtext") ||
                            s.textContent ||
                            ""
                    )
                    .join("\n\n");
            }

            const contentDiv =
                document.querySelector(
                    "#chapter_content"
                );

            return contentDiv
                ? contentDiv.innerText
                : "";
        });

        console.log(
            `Content length: ${content.length}`
        );

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

            return btn
                ? btn.href
                : null;
        });

        console.log("Next URL:", nextUrl);

        if (!nextUrl) {
            console.log(
                "No next chapter found."
            );
            break;
        }

        currentUrl = nextUrl;

        await page.waitForTimeout(
            2000 +
            Math.floor(
                Math.random() * 3000
            )
        );
    }

    fs.writeFileSync(
        "novel.txt",
        chapters.join("\n\n\n"),
        "utf8"
    );

    console.log(
        `Saved ${chapters.length} chapters`
    );

    await browser.close();
})();
