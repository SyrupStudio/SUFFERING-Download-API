const express = require("express");
const app = express();

// Ensure these match your GitHub URL exactly
const REPO_OWNER = "Pan-cakse"; 
const REPO_NAME = "SUFFERING"; // Change this if the repo with zips is just "suffering"

app.get("/download", async (req, res) => {
    const targetOs = req.query.os || "windows";
    const searchQuery = `suffering-${targetOs}.zip`;

    try {
        const { Octokit } = await import("@octokit/rest");
        const octokit = new Octokit({ 
            auth: process.env.GH_TOKEN,
            userAgent: 'suffering-proxy-v1'
        });

        // 1. Get releases and find the right one
        const { data: releases } = await octokit.repos.listReleases({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            per_page: 1
        });

        if (!releases.length) return res.status(404).send("No releases found.");
        const release = releases[0];

        // 2. Find the asset
        const asset = release.assets.find(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (!asset) return res.status(404).send(`Asset ${searchQuery} not found.`);

        // 3. Request the actual binary data
        const response = await octokit.repos.getReleaseAsset({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            asset_id: asset.id,
            headers: { accept: "application/octet-stream" }
        });

        // 4. Send the data back as a file download
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename=${asset.name}`);
        
        // Use Buffer.from because Octokit returns the data as an ArrayBuffer in this environment
        return res.send(Buffer.from(response.data));

    } catch (error) {
        console.error(error);
        res.status(500).send(`Proxy Error: ${error.message}`);
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
