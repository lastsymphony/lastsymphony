const fs = require("fs");
const axios = require("axios");
const dayjs = require("dayjs");

const USERNAME = "lastsymphony"; // <- GANTI
const API_KEY = process.env.API_KEY; 
// tambahin ke secret repo nanti biar rate limit aman

async function fetchUser() {
  const url = `https://api.github.com/users/${USERNAME}`;
  const { data } = await axios.get(url, {
    headers: authHeader(),
  });
  return {
    name: data.name || USERNAME,
    bio: data.bio || "",
    followers: data.followers || 0,
    publicRepos: data.public_repos || 0,
  };
}

async function fetchRepos() {
  // ambil semua public repos (max 100)
  const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`;
  const { data } = await axios.get(url, {
    headers: authHeader(),
  });

  // repo terbaru = index 0 (karena sort=updated desc)
  const latest = data[0] || {};

  // hitung bahasa populer
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
  // GitHub public events (push events)
  const url = `https://api.github.com/users/${USERNAME}/events/public?per_page=100`;
  const { data } = await axios.get(url, {
    headers: authHeader(),
  });

  const cutoff = dayjs().subtract(30, "day");
  let commits = 0;

  for (const ev of data) {
    if (ev.type === "PushEvent") {
      const created = dayjs(ev.created_at);
      if (created.isAfter(cutoff)) {
        commits += ev.payload.size || 0; // size = commit count in that push
      }
    }
  }

  return commits;
}

function buildTechBadges() {
  // kamu boleh custom di sini atau langsung tulis fix di template dan hapus placeholder
  return [
    "https://img.shields.io/badge/Node.js-000?style=for-the-badge&logo=node.js",
    "https://img.shields.io/badge/JavaScript-000?style=for-the-badge&logo=javascript",
    "https://img.shields.io/badge/Python-000?style=for-the-badge&logo=python",
    "https://img.shields.io/badge/Cloudflare_Workers-000?style=for-the-badge&logo=cloudflare",
    "https://img.shields.io/badge/WhatsApp_Bot-000?style=for-the-badge&logo=whatsapp"
  ]
    .map(
      (src) => `<img src="${src}" />`
    )
    .join("\n  ");
}

function authHeader() {
  // Boleh tanpa token, tapi rate limit kecil.
  return API_KEY
    ? {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": USERNAME,
      }
    : {
        "User-Agent": USERNAME,
      };
}

async function main() {
  console.log("⏳ Generating README...");

  const [user, repos, recentCommits] = await Promise.all([
    fetchUser(),
    fetchRepos(),
    fetchRecentCommitsApprox(),
  ]);

  const template = fs.readFileSync("./README.template.md", "utf8");

  const rendered = template
    .replace(/{{NAME}}/g, user.name)
    .replace(/{{TAGLINE}}/g, "Full-stack automation & bot engineer 🤖")
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
  console.log("✅ README.md updated.");
}

main().catch((err) => {
  console.error("❌ Failed to update README:", err.message);
  process.exit(1);
});
