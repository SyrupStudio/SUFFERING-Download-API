const express = require("express");
const app = express();

const REPO_OWNER = "Pan-cakse"; 
const REPO_NAME = "suffering-api";

app.get("/download", async (req, res) => {
    const targetOs = req.query.os || "windows";
    const searchQuery = `suffering-${targetOs}.zip`;

    try {
        const { Octokit } = await import("@octokit/rest");
        const octokit = new Octokit({ 
            auth: process.env.GH_TOKEN,
            userAgent: 'suffering-launcher-v1' // GitHub MANDATES a User-Agent
        });

        // 1. Get the latest release
        const { data: release } = await octokit.repos.getLatestRelease({
            owner: REPO_OWNER,
            repo: REPO_NAME,
        });

        // 2. Find the asset (Case-insensitive fix)
        const asset = release.assets.find(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (!asset) return res.status(404).send(`Asset "${searchQuery}" not found in latest release.`);

        // 3. Get the Download URL instead of the raw data
        // This is more reliable for Vercel's memory limits
        const { url } = await octokit.repos.getReleaseAsset({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            asset_id: asset.id,
            headers: { accept: "application/octet-stream" },
            request: { redirect: 'manual' } // We want the URL, not the file content yet
        });

        // 4. Redirect the user to the secure GitHub AWS link
        // GitHub will provide a temporary signed URL that works even for private repos
        return res.redirect(url);

    } catch (error) {
        console.error(error);
        res.status(500).send(`GitHub API Error: ${error.message}`);
    }
});

// Specific Forbidden Route
app.get("/forbidden", (req, res) => {
    res.status(403).send(`
        <html>
            <head><title>403 - Forbidden</title></head>
            <body style="background-color: #000; color: #ff4444; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Courier New', Courier, monospace; text-align: center;">
                <div style="border: 2px solid #ff4444; padding: 40px; border-radius: 10px; background: rgba(255, 0, 0, 0.1);">
                    <h1 style="font-size: 2.5rem; margin-bottom: 10px;">FORBIDDEN</h1>
                    <p style="font-size: 1.5rem;">Bro this area is forbidden what are you doing here 😔</p>
                </div>
            </body>
        </html>
    `);
});

// This matches any URL that wasn't caught by the routes above
app.use((req, res) => {
    res.status(404).send(`
        <html>
            <head><title>404 - Bro?</title></head>
            <body style="background-color: #121212; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; text-align: center;">
                <div>
                    <h1 style="font-size: 3rem;">Bro what are you doing here 💀</h1>
                    <p style="color: #888;">This page doesn't exist. Go back to the launcher.</p>
                </div>
            </body>
        </html>
    `);
});

module.exports = app;
