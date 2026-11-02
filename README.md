# Personal site

Run `npm ci` once and sign in with `gh auth login` if needed. Start the local editor with `node scripts/editor-server.mjs`, then open http://127.0.0.1:4173/.

Edit words directly on the page. The title field changes only the browser tab title, not the page text. **markdown** opens a small syntax reference; **outlines** shows the editable text regions. **Save & push** saves a version and pushes it to `main`; **versions** restores an earlier version without deleting history.

GitHub Actions publishes the clean page at https://herdesiress.github.io/mrrp/. The editor is not included in the Pages build. To build that public copy locally, run `npm ci && node scripts/build.mjs`; the output is in `dist/`.
