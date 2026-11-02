# Personal site

Run `npm ci` once, then `node scripts/editor-server.mjs`; open `http://127.0.0.1:4173/`.

Edit the Markdown; the site preview updates as you type. Drop media where you want it or use the tools at the left. **Save & push** saves the page, creates a Git version, and pushes it to `main`. The local server asks GitHub CLI for credentials; no token is put in the browser. Sign in once with `gh auth login` if needed. A failed push is shown in the editor; the local edit remains saved so you can retry.

Use **versions** to restore a previous saved page and media set. Restore makes a new version and pushes it; it does not erase the later history.

GitHub Actions builds a separate public site from the Markdown and `public/site.css`; the editor is not part of the Pages artifact. `npm ci && node scripts/build.mjs` builds the public copy locally into `dist/`.

The expected public address is https://herdesiress.github.io/mrrp/. GitHub Pages must be enabled for this private repository and set to **GitHub Actions** in **Settings → Pages** before that address works.
