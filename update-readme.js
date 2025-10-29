const fs = require("fs");
const axios = require("axios");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

// pakai username otomatis dari repo, fallback ke lastsymphony
const USERNAME = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split("/")[0]
  : "lastsymphony";

const API_KEY = process.env.API_KEY;

// timezone lokal (WIB = Asia/Jakarta)
function nowWIB() {
  return dayjs().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss") + " WIB";
}

function authHeader() {
  return API_KEY
    ? { Authorization: `Bearer ${API_KEY}`, "User-Agent": USERNAME }
    : { "User-Agent": USERNAME };
}

// 1. Info user
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

// 2. Info repo: latest repo, top language
async function fetchRepos() {
  const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`;
  const { data } = await axios.get(url, { headers: authHeader() });

  const latest = data[0] || {};

  const langCount = {};
  for (const repo of data) {
    if (!repo.fork && repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  }

  const topLanguage = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)[0] || "Unknown";

  return {
    reposList: data, // kirim full buat dipakai fungsi commit counter
    topLanguage,
    latestRepoName: latest.name || "-",
    latestRepoStars: latest.stargazers_count || 0,
  };
}

// 3. Komputasi commit 30 hari terakhir (lebih akurat)
async function fetchRecentCommitsAccurate(reposList) {
  // batas 30 hari lalu (WIB -> convert ke ISO)
  const sinceISO = dayjs().subtract(30, "day").toISOString();

  let commitTotal = 0;
  const seen = new Set(); // jangan hitung SHA yang duplikat

  // loop repo publik kamu
  for (const repo of reposList) {
    if (repo.fork) continue; // skip fork biar ga noise
    if (repo.private) continue; // gha bakal ada tapi jaga2

    const repoName = repo.name;

    // GET /repos/:owner/:repo/commits?author=:username&since=...
    const commitsUrl = `https://api.github.com/repos/${USERNAME}/${repoName}/commits?author=${USERNAME}&since=${encodeURIComponent(
      sinceISO
    )}&per_page=100`;

    try {
      const { data } = await axios.get(commitsUrl, { headers: authHeader() });

      for (const c of data) {
        if (!c || !c.sha) continue;
        if (!seen.has(c.sha)) {
          seen.add(c.sha);
          commitTotal += 1;
        }
      }
    } catch (err) {
      // repo mungkin gak punya commit kamu sendiri -> 404/empty itu normal
      // kita abaikan error 409 (empty repo) / 404 dsb supaya workflow nggak mati
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

function buildTechBadges() {
  // gaya mirip screenshot kamu: kotak hitam badge per skill
  // (di README final dia bakal nerender jadi baris2)
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

// Template README yang akan dirender
function getTemplate() {
  return `
<h1 align="center">Hi, I'm {{NAME}} 👋</h1>

<p align="center">
  <b>Engineer & maintainer bot/web 🌌</b><br/>
  <i>{{BIO}}</i>
</p>

---

### 🛠 Tech I use
{{TECH_BADGES}}

---

### 📊 GitHub Activity
<p align="center">
  <img src="https://github-readme-streak-stats.herokuapp.com?user={{USERNAME}}&theme=transparent" />
</p>

<p align="center">
  <img src="https://github-readme-stats.vercel.app/api/top-langs/?username={{USERNAME}}&layout=compact&theme=transparent" />
</p>

- ⏳ Last updated: \`{{LAST_UPDATE}}\`
- 🌐 Public repos: **{{PUBLIC_REPOS}}**
- 👥 Followers: **{{FOLLOWERS}}**
- ⭐ Most used language: **{{TOP_LANGUAGE}}**
- 📈 Total commits (last 30 days): **{{RECENT_COMMITS}}**
- 🔭 Latest public repo: **{{LATEST_REPO_NAME}}** (★ {{LATEST_REPO_STARS}})

---

<i>Generated automatically • last sync {{LAST_UPDATE}}</i>
`.trim() + "\n";
}

async function main() {
  console.log(`🚀 Generating README for ${USERNAME}...`);

  const [user, repoInfo] = await Promise.all([
    fetchUser(),
    fetchRepos(),
  ]);

  const recentCommits = await fetchRecentCommitsAccurate(repoInfo.reposList);

  const rendered = getTemplate()
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
    .replace(/{{TECH_BADGES}}/g, buildTechBadges());

  fs.writeFileSync("./README.md", rendered);
  console.log("✅ README.md updated successfully.");
}

main().catch((err) => {
  console.error("❌ Error updating README:", err.message);
  process.exit(1);
});
