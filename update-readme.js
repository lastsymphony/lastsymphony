const fs = require("fs");
const axios = require("axios");
const dayjs = require("dayjs");

const USERNAME = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split("/")[0]
  : "lastsymphony";

const API_KEY = process.env.API_KEY;

function authHeader() {
  return API_KEY
    ? { Authorization: `Bearer ${API_KEY}`, "User-Agent": USERNAME }
    : { "User-Agent": USERNAME };
}

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
    topLanguage,
    latestRepoName: latest.name || "-",
    latestRepoStars: latest.stargazers_count || 0,
  };
}

async function fetchRecentCommitsApprox() {
  const url = `https://api.github.com/users/${USERNAME}/events/public?per_page=100`;
  const { data } = await axios.get(url, { headers: authHeader() });

  const cutoff = dayjs().subtract(30, "day");
  let commits = 0;

  for (const ev of data) {
    if (ev.type === "PushEvent" && dayjs(ev.created_at).isAfter(cutoff)) {
      commits += ev.payload.size || 0;
    }
  }

  return commits;
}

function buildTechBadges() {
  return [
    "https://img.shields.io/badge/Node.js-000?style=for-the-badge&logo=node.js",
    "https://img.shields.io/badge/JavaScript-000?style=for-the-badge&logo=javascript",
    "https://img.shields.io/badge/Python-000?style=for-the-badge&logo=python",
    "https://img.shields.io/badge/Cloudflare_Workers-000?style=for-the-badge&logo=cloudflare",
    "https://img.shields.io/badge/WhatsApp_Bot-000?style=for-the-badge&logo=whatsapp"
  ]
    .map(src => `<img src="${src}" />`)
    .join("\n  ");
}

// 👉 Template disimpan langsung di variabel, jadi gak perlu README.template.md
function getTemplate() {
  return `
<h1 align="center">Hi, I'm {{NAME}} 👋</h1>

<p align="center">
  <b>{{TAGLINE}}</b><br/>
  <i>{{BIO}}</i>
</p>

---

### 🔥 Live Stats
- ⏳ Last updated: \`{{LAST_UPDATE}}\`
- 🌐 Public repos: **{{PUBLIC_REPOS}}**
- 👥 Followers: **{{FOLLOWERS}}**
- ⭐ Most used language: **{{TOP_LANGUAGE}}**
- 📈 Total commits (last 30 days): **{{RECENT_COMMITS}}**
- 🔭 Latest public repo: **{{LATEST_REPO_NAME}}** (★ {{LATEST_REPO_STARS}})

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

---

<i>Generated automatically • last sync {{LAST_UPDATE}}</i>
`.trim() + "\n";
}

async function main() {
  console.log(`🚀 Generating README for ${USERNAME}...`);

  const [user, repos, recentCommits] = await Promise.all([
    fetchUser(),
    fetchRepos(),
    fetchRecentCommitsApprox(),
  ]);

  const template = getTemplate();

  const rendered = template
    .replace(/{{NAME}}/g, user.name)
    .replace(/{{TAGLINE}}/g, "Engineer & maintainer bot/web 🌌")
    .replace(/{{BIO}}/g, user.bio || "No bio set")
    .replace(/{{LAST_UPDATE}}/g, dayjs().format("YYYY-MM-DD HH:mm:ss") + " WIB")
    .replace(/{{PUBLIC_REPOS}}/g, String(user.publicRepos))
    .replace(/{{FOLLOWERS}}/g, String(user.followers))
    .replace(/{{TOP_LANGUAGE}}/g, repos.topLanguage)
    .replace(/{{RECENT_COMMITS}}/g, String(recentCommits))
    .replace(/{{LATEST_REPO_NAME}}/g, repos.latestRepoName)
    .replace(/{{LATEST_REPO_STARS}}/g, String(repos.latestRepoStars))
    .replace(/{{USERNAME}}/g, USERNAME)
    .replace(/{{TECH_BADGES}}/g, `<p align="left">\n  ${buildTechBadges()}\n</p>`);

  fs.writeFileSync("./README.md", rendered);
  console.log("✅ README.md updated successfully.");
}

main().catch(err => {
  console.error("❌ Error updating README:", err.message);
  process.exit(1);
});
