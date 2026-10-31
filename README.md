# Claude Starry

[中文](README.zh-CN.md)

> Disabled Claude accounts have not disappeared. They no longer respond, but they still leave an afterlight.

Claude Starry is an unofficial, community-made memorial for disabled Claude accounts. It renders a shared galaxy with Three.js, where visitors can leave an alias, a date, and an optional memory as a star.

[Live experience](https://claudestarry.pages.dev/) · [GitHub](https://github.com/wavever/claudestarry) · [X @HtWavever](https://x.com/HtWavever) · [Deployment guide](docs/deployment.md) · [MIT License](LICENSE)

## Demo

The original recording is split into two players to fit GitHub's upload limit; all animations and original video quality are preserved.

Part 1

https://github.com/user-attachments/assets/58bb6f66-f6b6-43dc-9756-63772fdd78cd

Part 2

https://github.com/user-attachments/assets/c42fdcf6-5597-49c3-bc30-a5bdb104863f

[Download the full original recording](docs/demo.mp4)

Add the first account, watch its meteor arrive, and open the star card.

## Highlights

- Particle-text entry, nebula, orbit controls, and continuous zoom.
- New shared records arrive as meteors and synchronize with other open sessions.
- Star records can be viewed, copied or downloaded as images, and shared to X by the visitor.
- An alias and disabled date are required; registration date and memory are optional.
- Chinese and English UI: the browser language is used first, manual selection is saved locally, and `?locale=zh-CN` or `?locale=en` temporarily selects a locale.
- Respects the operating system’s reduced-motion preference.

## Run locally

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4317/>. Without the public Supabase build variables, the app remains browser-local and does not upload existing local records later.

```sh
npm test
npm run build
```

## Deploy your own shared galaxy

1. Create a Supabase project and apply every SQL migration in `supabase/migrations/` in filename order.
2. Copy `.env.example` to `.env.production.local` and set your public Supabase URL, anonymous key, and site URL.
3. Configure the Cloudflare Pages Worker’s server-only secrets and its exact `ALLOWED_ORIGINS` list.
4. Keep the Cloudflare Pages project connected to this GitHub repository; pushes to `main` will run the configured Pages build and publish `dist/` automatically.

The [deployment guide](docs/deployment.md) covers the database, Worker secrets, origin configuration, and verification checklist. Never expose a service-role key or IP hash salt to the browser.

## Public records and project notes

Shared records are public. Use an alias and never submit passwords or other sensitive information. To request removal from this project, open an issue and include the star catalog number.

Coordinates and `AL` catalog numbers are fictional. Historical background lights are an aggregate representation of public totals, not per-account identities or stories. The visible “recorded” counter only includes stars added to this site. See [src/baseline.js](src/baseline.js) for the data basis and [development notes](docs/development-notes.md) for earlier implementation notes.

This project is not affiliated with or endorsed by Anthropic.

## License

The project code is released under the [MIT License](LICENSE). Dependencies retain their own licenses.
