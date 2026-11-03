
Run `npm ci` once and sign in with `gh auth login` if needed. Start the local editor with `node scripts/editor-server.mjs`, then open http://127.0.0.1:4173/.

Edit words directly on the page. The title field changes only the browser tab title, not the page text. **markdown** opens a small syntax reference; **outlines** shows the editable text regions. **Save & push** saves a version and pushes it to `main`; **versions** restores an earlier version without deleting history.

Toggle the star beside **versions** to name the next saved version. **text color** at the bottom right applies a preset or custom color to selected text; colors are stored in the page Markdown and appear on the published site.

The **settings → site** controls enable the numeric view count, last-updated date, Melbourne/local clocks, visitor theme toggle, back-to-top button, and Spotify listening card. The site uses its built-in favicon; no external favicon is needed. The site information appears as a vertical module list in the top-right corner.

To set up the aggregate view count, sign in to Cloudflare once and deploy the included counter:

```sh
npx wrangler@4 login
npx wrangler@4 deploy --config workers/view-counter/wrangler.toml
```

The counter and Spotify relay share the deployed Worker at `https://mrrp-view-counter.salvalichubizenquiries.workers.dev/` and are configured in `site-settings.json`. It uses a Durable Object for atomic increments and latest-track state; only authenticated DiscSpot publishes can update track status. The site reader has no secret. If you redeploy to another Cloudflare account, update both endpoint URLs and the Worker secret.

Unpushed page edits and settings are saved in this browser as you type. If the site was pushed elsewhere since that draft, the editor keeps the newer site and offers the draft separately for recovery. Dropped or pasted images, audio, and video are stored as separate media files, not embedded in Markdown. Hover media and use its gutter bin to remove it; unused uploaded files are cleaned up on **save & push**. Draw a **region** to place a fitted image, video, or ASCII block. In **settings → misc**, set the floating text; it drifts slowly behind the page.

The Spotify card is pinned to the bottom-right corner and stays there while scrolling. Its public status endpoint is `https://mrrp-view-counter.salvalichubizenquiries.workers.dev/now-playing`. Configure the matching push key in DiscSpot → Settings → Connections; the app sends only current track metadata, not lyrics, to the authenticated relay. The local endpoint at `http://127.0.0.1:4175/now-playing` is for testing on the same Mac, not for GitHub Pages.

GitHub Actions publishes the clean page at https://herdesiress.github.io/mrrp/. The editor is not included in the Pages build. To build that public copy locally, run `npm ci && node scripts/build.mjs`; the output is in `dist/`.
