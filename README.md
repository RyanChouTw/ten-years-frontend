# ten-years (front-end)

Static frontend for https://hypertec.tw/ten-years — an AI mirror quiz.

This repo is submoduled into `hypertec-site` at `public/ten-years/` and
served directly by Cloudflare Workers + Assets.

## Layout

```
/
├── index.html          ← single-page app, all stages via JS view switching
├── assets/
│   ├── app.js          ← state machine + API calls
│   └── style.css       ← dark theme
└── README.md
```

## Local dev

Start the backend first (see `../back-end/`), then serve static:

```bash
cd front-end
python3 -m http.server 8080
# visit http://localhost:8080/
```

`app.js` auto-detects `localhost` and points to `http://localhost:3001`
for backend. In production it calls `https://api.hypertec.tw`.

## Deploy

This repo is pulled as a git submodule into `hypertec-site/public/ten-years/`.
Committing here + pushing + bumping the submodule ref in `hypertec-site`
triggers the Cloudflare deploy.
