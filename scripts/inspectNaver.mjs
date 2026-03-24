import * as cheerio from "cheerio";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/inspectNaver.mjs <url>");
  process.exit(1);
}

const res = await fetch(url, {
  headers: {
    "user-agent": "Mozilla/5.0",
  },
});
const html = await res.text();
const $ = cheerio.load(html);

const checks = [
  "div.se-main-container",
  "div#postViewArea",
  "div#postArea",
  "div.post_ct",
  "article",
  "div[id*='post']",
  "div[id*='content']",
  "main",
  "section",
  "iframe#mainFrame",
];

console.log("status", res.status, "len", html.length);
for (const selector of checks) {
  console.log(selector, $(selector).length);
}
console.log("title", $("title").first().text().slice(0, 120));
console.log("bodyTextLen", $("body").text().replace(/\s+/g, " ").trim().length);
