const fs = require("fs");
const axios = require("axios");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

// =====================
// CONFIG / ENV
// =====================

// Username ambil otomatis dari GITHUB_REPOSITORY (ex: "lastsymphony/lastsymphony")
// fallback -> "lastsymphony"
const USERNAME = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split("/")[0]
  : "lastsymphony";

// Token secret dari GitHub Actions secret: API_KEY
const API_KEY = process.env.API_KEY;

// WIB formatter
function nowWIB() {
  return (
    dayjs().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss") + " WIB"
  );
}

// Header buat request GitHub API
function authHeader() {
  return API_KEY
    ? {
        Authorization: `Bearer ${API_KEY}`,
        "User-Agent": USERNAME,
      }
    : {
        "User-Agent": USERNAME,
      };
}

// =====================
// FETCHERS (GitHub API)
// =====================

// Ambil data user GitHub
async function fetchUser() {
  const url = `https://api.github.com/users/${USERNAME}`;
  const { data } = await axios.get(url, { headers: authHeader() });
  return {
    name: data.name || USERNAME,
    bio: data.bio || "",
    followers: data.followers || 0,
    publicRepos: data.public_repos || 0,
  };
}

// Ambil daftar repo publik user
// - Dapetin bahasa dominan
// - Dapetin repo terbaru
async function fetchRepos() {
  const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`;
  const { data } = await axios.get(url, { headers: authHeader() });

  const latest = data[0] || {};

  // hitung bahasa paling sering muncul di repo non-fork
  const langCount = {};
  for (const repo of data) {
    if (repo.fork) continue;
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  }

  const topLanguage =
    Object.entries(langCount)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang)[0] || "Unknown";

  return {
    reposList: data,
    topLanguage,
    latestRepoName: latest.name || "-",
    latestRepoStars: latest.stargazers_count || 0,
  };
}

// Hitung total commit 30 hari terakhir, cross-repo publik milik kamu
// Cara kerja:
// - loop semua repo publik milikmu (non-fork)
// - call /repos/:owner/:repo/commits?author=:username&since=...&per_page=100
// - totalin SHA unik
async function fetchRecentCommitsAccurate(reposList) {
  const sinceISO = dayjs().subtract(30, "day").toISOString();
  let commitTotal = 0;
  const seen = new Set();

  for (const repo of reposList) {
    if (repo.fork) continue;
    if (repo.private) continue;

    const repoName = repo.name;
    const commitsUrl = `https://api.github.com/repos/${USERNAME}/${repoName}/commits?author=${USERNAME}&since=${encodeURIComponent(
      sinceISO
    )}&per_page=100`;

    try {
      const { data } = await axios.get(commitsUrl, {
        headers: authHeader(),
      });

      for (const c of data) {
        if (!c || !c.sha) continue;
        if (!seen.has(c.sha)) {
          seen.add(c.sha);
          commitTotal += 1;
        }
      }
    } catch (err) {
      // 404 / 409 / empty repo -> aman, skip aja
      if (
        err.response &&
        [404, 409].includes(err.response.status)
      ) {
        continue;
      } else {
        console.log(
          `⚠️  gagal ambil commits untuk ${repoName}: ${err.message}`
        );
      }
    }
  }

  return commitTotal;
}

// =====================
// VIEW PARTS / CARDS
// =====================

// Badge skillset (Card: Tech I use)
function buildTechBadges() {
  // badge style dark kotak -> mirip screenshot kamu
  // pakai shields.io
  return `
<p align="left">
  <img src="https://img.shields.io/badge/Node.js-000?style=for-the-badge&logo=node.js&logoColor=00ff00" />
  <img src="https://img.shields.io/badge/JavaScript-000?style=for-the-badge&logo=javascript&logoColor=ffdf00" />
  <img src="https://img.shields.io/badge/Python-000?style=for-the-badge&logo=python&logoColor=00a3e8" />
  <img src="https://img.shields.io/badge/Cloudflare%20Workers-000?style=for-the-badge&logo=cloudflare" />
  <img src="https://img.shields.io/badge/WhatsApp%20Bot-000?style=for-the-badge&logo=whatsapp&logoColor=25D366" />
</p>
  `.trim();
}

// Card persona/custom status (Card: Current Focus)
// Ini statis tapi tetep ikut dirender otomatis supaya kelihatan hidup
function buildFocusCard() {
  return `
<div style="border:1px solid #3a3a3a; border-radius:8px; padding:16px; background:#0d1117;">
  <ul>
    <li>🤖 Maintaining multi-platform chat bots (WhatsApp / Telegram)</li>
    <li>🌐 Building Cloudflare Workers proxy & tunneling infra</li>
    <li>🛰 Automating deployment / self-heal services (no manual babysit)</li>
    <li>💧 Genshin aesthetics / Furina-themed UI</li>
  </ul>
</div>
  `.trim();
}

// =====================
// README TEMPLATE
// =====================

function getTemplate() {
  return `
<h1 align="center">Hi, I'm {{NAME}} 👋</h1>

<p align="center">
  <b>Engineer & maintainer bot/web 🌌</b><br/>
  <i>{{BIO}}</i>
</p>

---

<h2>🔗 Tech I use</h2>
<div style="border:1px solid #3a3a3a; border-radius:8px; padding:16px; background:#0d1117;">
  {{TECH_BADGES}}
</div>

---

<h2>📊 GitHub Activity</h2>
<div style="border:1px solid #3a3a3a; border-radius:8px; padding:16px; background:#0d1117;">
  <p align="center">
    <img src="https://github-readme-streak-stats.herokuapp.com?user={{USERNAME}}&theme=transparent" />
  </p>

  <p align="center">
    <img src="https://github-readme-stats.vercel.app/api/top-langs/?username={{USERNAME}}&layout=compact&theme=transparent" />
  </p>
</div>

---

<h2>📚 Profile Overview</h2>
<div style="border:1px solid #3a3a3a; border-radius:8px; padding:16px; background:#0d1117;">
  <ul>
    <li>🌐 <b>Public repos:</b> {{PUBLIC_REPOS}}</li>
    <li>👥 <b>Followers:</b> {{FOLLOWERS}}</li>
    <li>⭐ <b>Most used language:</b> {{TOP_LANGUAGE}}</li>
    <li>📈 <b>Total commits (last 30 days):</b> {{RECENT_COMMITS}}</li>
  </ul>
</div>

---

<h2>🛰 Latest Public Repo</h2>
<div style="border:1px solid #3a3a3a; border-radius:8px; padding:16px; background:#0d1117;">
  <p>
    <b>📦 Repo:</b> <code>{{LATEST_REPO_NAME}}</code><br/>
    <b>⭐ Stars:</b> {{LATEST_REPO_STARS}}<br/>
    <b>🔗 URL:</b> https://github.com/{{USERNAME}}/{{LATEST_REPO_NAME}}
  </p>
</div>

---

<h2>🚀 Current Focus</h2>
{{FOCUS_CARD}}

---

<p align="center">
  <sub>⏳ Last updated: <code>{{LAST_UPDATE}}</code></sub>
</p>

<p align="center">
  <sub>Generated automatically • stay hydrated 💧</sub>
</p>
`.trim() + "\n";
}

// =====================
// MAIN BUILD PIPELINE
// =====================

async function main() {
  console.log(`🚀 Generating README for ${USERNAME}...`);

  // fetch paralel dulu yg bisa barengan
  const [user, repoInfo] = await Promise.all([fetchUser(), fetchRepos()]);

  // hitung commit terakhir (ini butuh reposList)
  const recentCommits = await fetchRecentCommitsAccurate(repoInfo.reposList);

  // render template
  let rendered = getTemplate()
    .replace(/{{NAME}}/g, user.name)
    .replace(/{{BIO}}/g, user.bio || "No bio set")
    .replace(/{{LAST_UPDATE}}/g, nowWIB())
    .replace(/{{PUBLIC_REPOS}}/g, String(user.publicRepos))
    .replace(/{{FOLLOWERS}}/g, String(user.followers))
    .replace(/{{TOP_LANGUAGE}}/g, repoInfo.topLanguage)
    .replace(/{{RECENT_COMMITS}}/g, String(recentCommits))
    .replace(/{{LATEST_REPO_NAME}}/g, repoInfo.latestRepoName)
    .replace(/{{LATEST_REPO_STARS}}/g, String(repoInfo.latestRepoStars))
    .replace(/{{USERNAME}}/g, USERNAME)
    .replace(/{{TECH_BADGES}}/g, buildTechBadges())
    .replace(/{{FOCUS_CARD}}/g, buildFocusCard());

  // tulis README.md final
  fs.writeFileSync("./README.md", rendered);

  console.log("✅ README.md updated successfully.");
}

main().catch((err) => {
  console.error("❌ Error updating README:", err.message);
  process.exit(1);
});
