const express = require("express");
const app = express();

// --- CONFIGURATION ---
const GAME_REPO = { owner: "Pan-cakse", repo: "suffering" };
const LAUNCHER_REPO = { owner: "Pan-cakse", repo: "SUFFERING-Launcher" };

// --- HELPERS ---
const getOctokit = async () => {
    const { Octokit } = await import("@octokit/rest");
    return new Octokit({ 
        auth: process.env.GH_TOKEN,
        userAgent: 'suffering-distribution-proxy'
    });
};

// --- SWAGGER JSON SPECIFICATION ---
const swaggerDocument = {
    openapi: "3.0.0",
    info: {
        title: "SUFFERING Distribution API",
        version: "1.0.0",
        description: "API for managing launcher updates and private game downloads bridged securely from GitHub."
    },
    paths: {
        "/versions": {
            get: {
                summary: "Get available game versions",
                description: "Returns a list of all compiled game release tags for profile configuration.",
                responses: { 200: { description: "Success" } }
            }
        },
        "/download": {
            get: {
                summary: "Download game bundle",
                description: "Proxies binary zip files directly from the private GitHub repository based on selected OS.",
                parameters: [
                    { name: "os", in: "query", schema: { type: "string", default: "windows" }, description: "Target operating system (windows, linux, macos)" },
                    { name: "version", in: "query", schema: { type: "string" }, description: "Specific release tag name (Defaults to latest if omitted)" }
                ],
                responses: { 200: { description: "Returns file application/octet-stream" } }
            }
        },
        "/launcher/check": {
            get: {
                summary: "Check for launcher updates",
                description: "Compares current client version tag against the latest automated compilation.",
                parameters: [
                    { name: "v", in: "query", required: true, schema: { type: "string" }, description: "Current launcher commit/version hash" }
                ],
                responses: { 200: { description: "Success JSON payload detailing update status" } }
            }
        },
        "/launcher/download": {
            get: {
                summary: "Download launcher installer",
                description: "Proxies the latest installer file (.msi or .dmg) depending on platform selection.",
                parameters: [
                    { name: "os", in: "query", schema: { type: "string", default: "exe" }, description: "Set 'exe' for Windows installer (.msi) or 'dmg' for macOS" }
                ],
                responses: { 200: { description: "Returns installer file application/octet-stream" } }
            }
        }
    }
};

// --- SWAGGER UI ROUTE ---
app.get("/docs", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>SUFFERING API Docs</title>
            <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.css" />
            <style>
                html { box-sizing: border-box; overflow: -srv-hidden; }
                body { margin:0; background: #fafafa; }
            </style>
        </head>
        <body>
            <div id="swagger-ui"></div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-bundle.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-standalone-preset.js"></script>
            <script>
                window.onload = function() {
                    const ui = SwaggerUIBundle({
                        spec: ${JSON.stringify(swaggerDocument)},
                        dom_id: '#swagger-ui',
                        deepLinking: true,
                        presets: [
                            SwaggerUIBundle.presets.apis,
                            SwaggerUIStandalonePreset
                        ],
                        plugins: [
                            SwaggerUIBundle.plugins.DownloadUrl
                        ],
                        layout: "BaseLayout"
                    });
                    window.ui = ui;
                };
            </script>
        </body>
        </html>
    `);
});

// --- 1. GAME DOWNLOADS & VERSIONS ---

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

app.get("/launcher/versions", async (req, res) => {
    try {
        const octokit = await getOctokit();
        const { data: releases } = await octokit.repos.listReleases(LAUNCHER_REPO);
        res.json(releases.map(r => ({
            tag: r.tag_name,
            name: r.name,
            published: r.published_at
        })));
    } catch (error) {
        res.status(500).send(`Error fetching versions: ${error.message}`);
    }
});

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
