const GAME_REPO = { owner: "SyrupStudio", repo: "SUFFERING" }
const LAUNCHER_REPO = { owner: "Pan-cakse", repo: "SUFFERING-Launcher" }

const getOctokit = async () => {
    const { Octokit } = await import("@octokit/rest")
    return new Octokit({
        auth: Netlify.env.get('GH_TOKEN'),
        userAgent: 'suffering-distribution-proxy'
    })
}

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
}

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>SUFFERING API Docs</title>
    <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.css" />
    <style>
        html { box-sizing: border-box; overflow: -moz-hidden-unscrollable; }
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
</html>`

export default async (req) => {
    const url = new URL(req.url)
    const path = url.pathname
    const params = url.searchParams

    try {
        if (path === '/docs') {
            return new Response(swaggerHtml, { headers: { 'Content-Type': 'text/html' } })
        }

        if (path === '/versions') {
            const octokit = await getOctokit()
            const { data: releases } = await octokit.repos.listReleases(GAME_REPO)
            return Response.json(releases.map(r => ({
                tag: r.tag_name,
                name: r.name,
                published: r.published_at
            })))
        }

        if (path === '/launcher/versions') {
            const octokit = await getOctokit()
            const { data: releases } = await octokit.repos.listReleases(LAUNCHER_REPO)
            return Response.json(releases.map(r => ({
                tag: r.tag_name,
                name: r.name,
                published: r.published_at
            })))
        }

        if (path === '/download') {
            const targetOs = (params.get('os') || 'windows').toLowerCase()
            const requestedTag = params.get('version')
            const searchQuery = `suffering-${targetOs}.zip`

            const octokit = await getOctokit()
            let release

            if (requestedTag) {
                const { data } = await octokit.repos.getReleaseByTag({ ...GAME_REPO, tag: requestedTag })
                release = data
            } else {
                const { data: releases } = await octokit.repos.listReleases({ ...GAME_REPO, per_page: 1 })
                if (!releases.length) return new Response('No game releases found.', { status: 404 })
                release = releases[0]
            }

            const asset = release.assets.find(a => a.name.toLowerCase().includes(searchQuery))
            if (!asset) return new Response(`Asset "${searchQuery}" not found.`, { status: 404 })

            const response = await octokit.repos.getReleaseAsset({
                ...GAME_REPO,
                asset_id: asset.id,
                headers: { accept: 'application/octet-stream' },
            })

            return new Response(Buffer.from(response.data), {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename=${asset.name}`
                }
            })
        }

        if (path === '/launcher/check') {
            const currentVersion = params.get('v')
            const octokit = await getOctokit()
            const { data: releases } = await octokit.repos.listReleases({ ...LAUNCHER_REPO, per_page: 1 })
            if (!releases.length) return new Response('No launcher releases found.', { status: 404 })

            const latest = releases[0]
            return Response.json({
                latest_version: latest.tag_name,
                update_available: latest.tag_name !== currentVersion,
                release_notes: latest.body
            })
        }

        if (path === '/launcher/download') {
            const platform = (params.get('os') || 'exe').toLowerCase()
            const extension = platform === 'exe' ? '.msi' : '.dmg'

            const octokit = await getOctokit()
            const { data: releases } = await octokit.repos.listReleases({ ...LAUNCHER_REPO, per_page: 1 })
            if (!releases.length) return new Response('No launcher releases found.', { status: 404 })
            const latest = releases[0]

            const asset = latest.assets.find(a => a.name.endsWith(extension))
            if (!asset) return new Response(`Launcher installer (${extension}) not found.`, { status: 404 })

            const response = await octokit.repos.getReleaseAsset({
                ...LAUNCHER_REPO,
                asset_id: asset.id,
                headers: { accept: 'application/octet-stream' },
            })

            return new Response(Buffer.from(response.data), {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename=${asset.name}`
                }
            })
        }

        if (path === '/forbidden') {
            return new Response(`
                <body style="background:#000;color:#f44;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
                    <div><h1>FORBIDDEN</h1><p>Bro this area is forbidden what are you doing here \u{1F614}</p></div>
                </body>
            `, { status: 403, headers: { 'Content-Type': 'text/html' } })
        }

        return new Response(`
            <body style="background:#121212;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
                <div><h1>Bro what are you doing here \u{1F480}</h1><p>404 - Not Found</p></div>
            </body>
        `, { status: 404, headers: { 'Content-Type': 'text/html' } })

    } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 })
    }
}

export const config = {
    path: '/*'
}
