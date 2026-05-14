const express = require("express");
const app = express();

const REPO_OWNER = "Pan-cakse"; 
const REPO_NAME = "SUFFERING"; // Ensure this matches the repo with the Zips!

app.get("/download", async (req, res) => {
    const targetOs = req.query.os || "windows";
    const requestedTag = req.query.version; // The Go launcher will send this
    const searchQuery = `suffering-${targetOs.toLowerCase()}.zip`;

    try {
        const { Octokit } = await import("@octokit/rest");
        const octokit = new Octokit({ 
            auth: process.env.GH_TOKEN,
            userAgent: 'suffering-launcher-go'
        });

        let release;

        if (requestedTag) {
            // 1a. User wants a specific version (Profile selection)
            const { data } = await octokit.repos.getReleaseByTag({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                tag: requestedTag,
            });
            release = data;
        } else {
            // 1b. Default to the most recent release (the "main" button)
            const { data: releases } = await octokit.repos.listReleases({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                per_page: 1,
            });
            if (!releases.length) throw new Error("No releases found.");
            release = releases[0];
        }

        // 2. Find the correct asset (.zip) in that release
        const asset = release.assets.find(a => 
            a.name.toLowerCase().includes(searchQuery)
        );

        if (!asset) {
            return res.status(404).send(`Asset "${searchQuery}" not found in version ${release.tag_name}.`);
        }

        // 3. Fetch the actual file data from GitHub
        const response = await octokit.repos.getReleaseAsset({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            asset_id: asset.id,
            headers: { accept: "application/octet-stream" },
        });

        // 4. Proxy the data back to the Go Launcher
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename=${asset.name}`);
        
        // Octokit returns an ArrayBuffer in this environment, so we wrap it in a Buffer
        return res.send(Buffer.from(response.data));

    } catch (error) {
        console.error(error);
        res.status(500).send(`GitHub Proxy Error: ${error.message}`);
    }
});

// Handy helper for your Go launcher to populate the version dropdown
app.get("/versions", async (req, res) => {
    try {
        const { Octokit } = await import("@octokit/rest");
        const octokit = new Octokit({ auth: process.env.GH_TOKEN });
        const { data: releases } = await octokit.repos.listReleases({
            owner: REPO_OWNER,
            repo: REPO_NAME,
        });

        res.json(releases.map(r => ({
            tag: r.tag_name,
            name: r.name,
            published: r.published_at
        })));
    } catch (error) {
        res.status(500).send(error.message);
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
