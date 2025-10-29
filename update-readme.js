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
    avatarUrl: data.avatar_url || "",
    location: data.location || "Unknown",
    company: data.company || "Independent",
    twitterUsername: data.twitter_username || "",
    blog: data.blog || "",
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

  // Get top starred repos
  const topStarredRepos = data
    .filter(repo => !repo.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 3);

  return {
    reposList: data,
    topLanguage,
    latestRepoName: latest.name || "-",
    latestRepoStars: latest.stargazers_count || 0,
    topStarredRepos,
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
<p align="center">
  <img src="https://img.shields.io/badge/Node.js-43853d?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/WhatsApp%20Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp Bot" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
</p>
  `.trim();
}

// Card persona/custom status (Card: Current Focus)
// Ini statis tapi tetep ikut dirender otomatis supaya kelihatan hidup
function buildFocusCard() {
  return `
<div align="center">
  <img src="https://raw.githubusercontent.com/saadeghi/saadeghi/master/dino.gif" width="200" />
</div>

### 🌟 Current Focus
<div style="display: flex; justify-content: space-between; margin-top: 20px;">
  <div style="flex: 1; margin: 0 10px; padding: 15px; background-color: #161b22; border-radius: 10px; border: 1px solid #30363d;">
    <h4>🤖 Bots & Automation</h4>
    <p>Building multi-platform chat bots (WhatsApp / Telegram) with self-healing capabilities</p>
  </div>
  <div style="flex: 1; margin: 0 10px; padding: 15px; background-color: #161b22; border-radius: 10px; border: 1px solid #30363d;">
    <h4>🌐 Cloud Infrastructure</h4>
    <p>Developing Cloudflare Workers proxy & tunneling infrastructure for high availability</p>
  </div>
</div>
<div style="display: flex; justify-content: space-between; margin-top: 10px;">
  <div style="flex: 1; margin: 0 10px; padding: 15px; background-color: #161b22; border-radius: 10px; border: 1px solid #30363d;">
    <h4>🛰️ DevOps</h4>
    <p>Automating deployment pipelines with zero-downtime updates and monitoring</p>
  </div>
  <div style="flex: 1; margin: 0 10px; padding: 15px; background-color: #161b22; border-radius: 10px; border: 1px solid #30363d;">
    <h4>💧 UI/UX Design</h4>
    <p>Creating Genshin-inspired interfaces with Furina-themed aesthetics</p>
  </div>
</div>
  `.trim();
}

// Build visitor counter
function buildVisitorCounter() {
  return `
<div align="center">
  <img src="https://profile-counter.glitch.me/{{USERNAME}}/count.svg" alt="Visitor Count" />
</div>
  `.trim();
}

// Build contribution graph
function buildContributionGraph() {
  return `
<div align="center">
  <img src="https://github-readme-activity-graph.vercel.app/graph?username={{USERNAME}}&theme=react-dark&hide_border=true&area=true" alt="Contribution Graph" />
</div>
  `.trim();
}

// Build trophy section
function buildTrophySection() {
  return `
<div align="center">
  <img src="https://github-profile-trophy.vercel.app/?username={{USERNAME}}&theme=darkhub&no-frame=true&margin-w=15" alt="GitHub Trophies" />
</div>
  `.trim();
}

// Build top repositories section
function buildTopReposSection(topStarredRepos) {
  let reposHtml = `
<div align="center">
  <h3>⭐ Most Starred Repositories</h3>
</div>

<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; margin-top: 20px;">
`;

  topStarredRepos.forEach(repo => {
    reposHtml += `
  <div style="width: 300px; padding: 15px; background-color: #161b22; border-radius: 10px; border: 1px solid #30363d;">
    <div style="display: flex; align-items: center; margin-bottom: 10px;">
      <div style="width: 40px; height: 40px; background-color: #21262d; border-radius: 6px; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="24" height="24" fill="#58a6ff">
          <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"></path>
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"></path>
        </svg>
      </div>
      <div>
        <h4 style="margin: 0; font-size: 16px;"><a href="https://github.com/${USERNAME}/${repo.name}" style="color: #58a6ff; text-decoration: none;">${repo.name}</a></h4>
        <p style="margin: 0; color: #8b949e; font-size: 12px;">${repo.language || "Unknown"}</p>
      </div>
    </div>
    <p style="margin: 10px 0; color: #c9d1d9; font-size: 14px;">${repo.description ? (repo.description.length > 80 ? repo.description.substring(0, 80) + "..." : repo.description) : "No description available"}</p>
    <div style="display: flex; justify-content: space-between; color: #8b949e; font-size: 12px;">
      <span>⭐ ${repo.stargazers_count}</span>
      <span>🍴 ${repo.forks_count}</span>
      <span>👁️ ${repo.watchers_count}</span>
    </div>
  </div>
`;
  });

  reposHtml += `</div>`;
  return reposHtml;
}

// =====================
// README TEMPLATE
// =====================

function getTemplate() {
  return `
<div align="center">
  <img src="{{AVATAR_URL}}" alt="Profile Picture" style="width: 150px; border-radius: 50%; border: 5px solid #21262d;" />
</div>

<h1 align="center">Hi, I'm {{NAME}} 👋</h1>

<p align="center">
  <b>Full-Stack Developer & Bot Engineer 🌌</b><br/>
  <i>{{BIO}}</i>
</p>

<p align="center">
  <a href="https://github.com/{{USERNAME}}"><img src="https://img.shields.io/github/followers/{{USERNAME}}?label=Followers&style=social" alt="Followers"></a>
  <a href="https://github.com/{{USERNAME}}"><img src="https://img.shields.io/github/stars/{{USERNAME}}?label=Stars&style=social" alt="Stars"></a>
  {{TWITTER_BADGE}}
  {{BLOG_BADGE}}
</p>

---

<h2 align="center">🔧 Tech Stack & Tools</h2>
<div style="padding: 20px; background-color: #0d1117; border-radius: 10px; border: 1px solid #21262d;">
  {{TECH_BADGES}}
</div>

---

<h2 align="center">📊 GitHub Activity</h2>
<div style="padding: 20px; background-color: #0d1117; border-radius: 10px; border: 1px solid #21262d;">
  <p align="center">
    <img src="https://github-readme-streak-stats.herokuapp.com?user={{USERNAME}}&theme=dark&hide_border=true&background=0D1117&stroke=21262D&ring=58A6FF&fire=FF6B6B&currStreakLabel=58A6FF" alt="GitHub Streak" />
  </p>

  <p align="center">
    <img src="https://github-readme-stats.vercel.app/api?username={{USERNAME}}&show_icons=true&theme=dark&hide_border=true&bg_color=0D1117&title_color=58A6FF&icon_color=58A6FF&text_color=C9D1D9" alt="GitHub Stats" />
  </p>

  <p align="center">
    <img src="https://github-readme-stats.vercel.app/api/top-langs/?username={{USERNAME}}&layout=compact&theme=dark&hide_border=true&bg_color=0D1117&title_color=58A6FF&text_color=C9D1D9" alt="Top Languages" />
  </p>
</div>

---

{{CONTRIBUTION_GRAPH}}

---

{{TROPHY_SECTION}}

---

<h2 align="center">📈 Profile Overview</h2>
<div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; padding: 20px; background-color: #0d1117; border-radius: 10px; border: 1px solid #21262d;">
  <div style="flex: 1; min-width: 200px; padding: 15px; background-color: #161b22; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0; color: #58a6ff;">{{PUBLIC_REPOS}}</h3>
    <p style="margin: 5px 0 0; color: #8b949e;">Public Repos</p>
  </div>
  <div style="flex: 1; min-width: 200px; padding: 15px; background-color: #161b22; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0; color: #58a6ff;">{{FOLLOWERS}}</h3>
    <p style="margin: 5px 0 0; color: #8b949e;">Followers</p>
  </div>
  <div style="flex: 1; min-width: 200px; padding: 15px; background-color: #161b22; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0; color: #58a6ff;">{{TOP_LANGUAGE}}</h3>
    <p style="margin: 5px 0 0; color: #8b949e;">Top Language</p>
  </div>
  <div style="flex: 1; min-width: 200px; padding: 15px; background-color: #161b22; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0; color: #58a6ff;">{{RECENT_COMMITS}}</h3>
    <p style="margin: 5px 0 0; color: #8b949e;">Commits (30 days)</p>
  </div>
</div>

---

<h2 align="center">📦 Latest Repository</h2>
<div style="padding: 20px; background-color: #0d1117; border-radius: 10px; border: 1px solid #21262d;">
  <div style="display: flex; align-items: center; margin-bottom: 15px;">
    <div style="width: 50px; height: 50px; background-color: #21262d; border-radius: 6px; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="30" height="30" fill="#58a6ff">
        <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"></path>
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"></path>
      </svg>
    </div>
    <div>
      <h3 style="margin: 0; font-size: 20px;"><a href="https://github.com/{{USERNAME}}/{{LATEST_REPO_NAME}}" style="color: #58a6ff; text-decoration: none;">{{LATEST_REPO_NAME}}</a></h3>
      <p style="margin: 5px 0; color: #8b949e;">Last updated repository</p>
    </div>
  </div>
  <div style="display: flex; gap: 15px; color: #c9d1d9;">
    <span>⭐ {{LATEST_REPO_STARS}} stars</span>
    <span>🔗 <a href="https://github.com/{{USERNAME}}/{{LATEST_REPO_NAME}}" style="color: #58a6ff;">View Repository</a></span>
  </div>
</div>

---

{{TOP_REPOS_SECTION}}

---

{{FOCUS_CARD}}

---

<div align="center">
  <h3>📊 Weekly Development Breakdown</h3>
  <img src="https://raw.githubusercontent.com/{{USERNAME}}/{{USERNAME}}/output/github-contribution-grid-snake.svg" alt="Snake Animation" />
</div>

---

<div align="center">
  <p>⏳ Last updated: <code>{{LAST_UPDATE}}</code></p>
  <p>Generated automatically with ❤️ • Stay hydrated 💧</p>
</div>

{{VISITOR_COUNTER}}
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

  // Prepare social badges
  const twitterBadge = user.twitterUsername 
    ? `<a href="https://twitter.com/${user.twitterUsername}"><img src="https://img.shields.io/twitter/follow/${user.twitterUsername}?label=Twitter&style=social" alt="Twitter"></a>`
    : '';
    
  const blogBadge = user.blog
    ? `<a href="${user.blog}"><img src="https://img.shields.io/badge/Website-Visit-blue?style=flat-square&logo=google-chrome" alt="Website"></a>`
    : '';

  // render template
  let rendered = getTemplate()
    .replace(/{{NAME}}/g, user.name)
    .replace(/{{BIO}}/g, user.bio || "Passionate developer building amazing things")
    .replace(/{{LAST_UPDATE}}/g, nowWIB())
    .replace(/{{PUBLIC_REPOS}}/g, String(user.publicRepos))
    .replace(/{{FOLLOWERS}}/g, String(user.followers))
    .replace(/{{TOP_LANGUAGE}}/g, repoInfo.topLanguage)
    .replace(/{{RECENT_COMMITS}}/g, String(recentCommits))
    .replace(/{{LATEST_REPO_NAME}}/g, repoInfo.latestRepoName)
    .replace(/{{LATEST_REPO_STARS}}/g, String(repoInfo.latestRepoStars))
    .replace(/{{USERNAME}}/g, USERNAME)
    .replace(/{{AVATAR_URL}}/g, user.avatarUrl)
    .replace(/{{TECH_BADGES}}/g, buildTechBadges())
    .replace(/{{FOCUS_CARD}}/g, buildFocusCard())
    .replace(/{{VISITOR_COUNTER}}/g, buildVisitorCounter())
    .replace(/{{CONTRIBUTION_GRAPH}}/g, buildContributionGraph())
    .replace(/{{TROPHY_SECTION}}/g, buildTrophySection())
    .replace(/{{TOP_REPOS_SECTION}}/g, buildTopReposSection(repoInfo.topStarredRepos))
    .replace(/{{TWITTER_BADGE}}/g, twitterBadge)
    .replace(/{{BLOG_BADGE}}/g, blogBadge);

  // tulis README.md final
  fs.writeFileSync("./README.md", rendered);

  console.log("✅ README.md updated successfully.");
}

main().catch((err) => {
  console.error("❌ Error updating README:", err.message);
  process.exit(1);
});
