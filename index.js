const express = require("express");
const app = express();

// --- CONFIGURATION ---
// Ensure these match your GitHub URLs exactly!
const GAME_REPO = { owner: "Pan-cakse", repo: "SUFFERING" };
const LAUNCHER_REPO = { owner: "Pan-cakse", repo: "SUFFERING-Launcher" };

// --- HELPERS ---
const getOctokit = async () => {
    const { Octokit } = await import("@octokit/rest");
    return new Octokit({ 
        auth: process.env.GH_TOKEN,
        userAgent: 'suffering-distribution-proxy'
    });
};

// --- 1. GAME DOWNLOADS & VERSIONS ---

// Fetches the list of all game versions for your dropdown
app.get("/versions", async (req, res) => {
    try {
        const octokit = await getOctokit();
        const { data: releases } = await octokit.repos.listReleases(GAME_REPO);
        res.json(releases.map(r => ({
            tag: r.tag_name,
            name: r.name,
            published: r.published_at
        })));
    } catch (error) {
        res.status(500).send(`Error fetching versions: ${error.message}`);
    }
});

// Proxies the game zip directly to the launcher
app.get("/download", async (req, res) => {
    const targetOs = (req.query.os || "windows").toLowerCase();
    const requestedTag = req.query.version;
    const searchQuery = `suffering-${targetOs}.zip`;

    try {
        const octokit = await getOctokit();
        let release;

        if (requestedTag) {
            const { data } = await octokit.repos.getReleaseByTag({ ...GAME_REPO, tag: requestedTag });
            release = data;
        } else {
            const { data: releases } = await octokit.repos.listReleases({ ...GAME_REPO, per_page: 1 });
            if (!releases.length) throw new Error("No game releases found.");
            release = releases[0];
        }

        const asset = release.assets.find(a => a.name.toLowerCase().includes(searchQuery));
        if (!asset) return res.status(404).send(`Asset "${searchQuery}" not found.`);

        const response = await octokit.repos.getReleaseAsset({
            ...GAME_REPO,
            asset_id: asset.id,
            headers: { accept: "application/octet-stream" },
        });

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename=${asset.name}`);
        return res.send(Buffer.from(response.data));

    } catch (error) {
        res.status(500).send(`Game Proxy Error: ${error.message}`);
    }
});

// --- 2. LAUNCHER UPDATES ---

// Returns if there is a new launcher version available
app.get("/launcher/check", async (req, res) => {
    const currentVersion = req.query.v; 
    try {
        const octokit = await getOctokit();
        const { data: releases } = await octokit.repos.listReleases({ ...LAUNCHER_REPO, per_page: 1 });
        if (!releases.length) return res.status(404).send("No launcher releases found.");
        
        const latest = releases[0];
        res.json({
            latest_version: latest.tag_name,
            update_available: latest.tag_name !== currentVersion,
            release_notes: latest.body
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Downloads the launcher installer (.msi for Windows, .dmg for Mac)
app.get("/launcher/download", async (req, res) => {
    const platform = (req.query.os || "exe").toLowerCase();
    const extension = platform === "exe" ? ".msi" : ".dmg"; 
    
    try {
        const octokit = await getOctokit();
        const { data: releases } = await octokit.repos.listReleases({ ...LAUNCHER_REPO, per_page: 1 });
        const latest = releases[0];

        const asset = latest.assets.find(a => a.name.endsWith(extension));
        if (!asset) return res.status(404).send(`Launcher installer (${extension}) not found.`);

        const response = await octokit.repos.getReleaseAsset({
            ...LAUNCHER_REPO,
            asset_id: asset.id,
            headers: { accept: "application/octet-stream" },
        });

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename=${asset.name}`);
        return res.send(Buffer.from(response.data));
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// --- 3. CUSTOM ERROR PAGES ---

app.get("/forbidden", (req, res) => {
    res.status(403).send(`
        <body style="background:#000;color:#f44;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
            <div><h1>FORBIDDEN</h1><p>Bro this area is forbidden what are you doing here 😔</p></div>
        </body>
    `);
});

app.use((req, res) => {
    res.status(404).send(`
        <body style="background:#121212;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
            <div><h1>Bro what are you doing here 💀</h1><p>404 - Not Found</p></div>
        </body>
    `);
});

module.exports = app;
