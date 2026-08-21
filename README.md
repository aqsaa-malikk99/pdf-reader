# PDF Commenter

A PDF viewer you can highlight text and add comments in — fully offline for
personal use, with an optional "Share" button to send a link to someone
else (e.g. a supervisor) so they can view the same PDF and add their own
comments back.

## Running it locally

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL. Everything here — opening a
PDF, highlighting text, adding comments, exporting an annotated PDF — works
fully offline. PDFs and comments are saved in your browser's local storage,
so closing the tab and reopening the app later keeps your recent documents
and comments.

- **Highlight**: select any text in the PDF, pick a color, optionally add a
  comment, and save.
- **Comment pin**: click "Add Comment" in the toolbar, then click anywhere
  on the page to drop a note that isn't tied to specific text.
- **Edit / delete**: click a comment in the right-hand sidebar to edit it,
  or the ✕ to delete it. Clicking a highlight or pin on the page jumps to
  it in the sidebar.
- **Export**: "Export PDF" downloads a copy of the PDF with your highlights
  drawn in and a "Comments" page listing every note, so it can be opened in
  any PDF reader.

## Sharing with someone else (e.g. your supervisor)

The "Share" button uploads the PDF and comments to temporary cloud storage
and gives you a link. Anyone who opens that link sees the same PDF and can
add their own comments — additions from either side sync automatically
(polls every ~8 seconds).

**This requires the app to be deployed somewhere public** (it won't work
against `localhost`, since your supervisor can't reach your machine).

### Deploying (free, via Vercel)

1. Create a free account at [vercel.com](https://vercel.com) if you don't
   have one.
2. From this project folder, run `npx vercel` and follow the prompts (or
   connect the folder/repo from the Vercel dashboard). This gives you a
   public URL like `https://pdf-commenter-yourname.vercel.app`.
3. In the Vercel dashboard for the project, go to **Storage → Create
   Database → Blob** and connect it to the project. This is what backs the
   "temporary cloud storage" for shared PDFs and comments (free tier is
   plenty for this use case) — Vercel wires up the required
   `BLOB_READ_WRITE_TOKEN` environment variable automatically.
4. Redeploy (`npx vercel --prod`) so the new environment variable takes
   effect.

After that, open the deployed URL instead of `localhost` and the Share
button will work end to end.

**Note:** shared uploads are capped by the serverless request size limit
(a few MB). For very large PDFs, use Export instead and send the file
directly.

## Tech notes

- React + Vite + TypeScript.
- PDF rendering/text selection via `pdfjs-dist`; exporting annotated PDFs
  via `pdf-lib`.
- Local persistence via IndexedDB (`idb-keyval`).
- Sharing uses two small serverless functions in `api/share` backed by
  Vercel Blob storage — no accounts or API keys needed beyond connecting
  the free Blob store in step 3 above.
