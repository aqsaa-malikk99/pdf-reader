<div align="center">

# 📄 PDF Commenter

**Read, highlight, and discuss PDFs — privately on your device, or together with a reviewer.**

Built for the feedback loop between someone writing and someone reviewing:
a student and a supervisor, a writer and an editor, a candidate and a hiring panel.

[Getting started](#getting-started) · [Features](#features) · [Sharing](#sharing-a-document-for-review) · [Deployment](#deployment) · [Architecture](#architecture)

</div>

---

## Why this exists

Emailing `thesis_v4_FINAL_comments_JS.pdf` back and forth loses track of who said
what, when. Most alternatives want you to upload your document to someone else's
cloud before you can even read it.

PDF Commenter opens your PDF **locally in the browser** — the file never leaves
your machine until you explicitly choose to share it. When you do want feedback,
one button produces a link. Your reviewer opens it, comments in place, and their
notes flow back to you with names and timestamps attached.

---

## Features

### Reading & annotating
- **Real text selection** — select across words and lines the way you'd expect, then highlight.
- **Highlights that stay legible** — rendered with multiply blending, so the ink reads as a solid marker instead of a washed-out film over the text.
- **Comment pins** — drop a note anywhere on a page, not just on text.
- **Eight-colour palette**, with your colour chosen for you (see below).
- **Page panel** — collapsible sidebar with page thumbnails, jump to any page, plus the PDF's table of contents when it has one.
- Zoom, click-to-jump page indicator, and `⌘ +` / `⌘ −` shortcuts.

### Collaboration
- **Automatic per-person colours** — every contributor in a document gets a *different* highlight colour automatically, so you can tell at a glance whose marks are whose. No one has to pick.
- **Threaded replies** — reply to any comment to hold an actual conversation.
- **Timestamps** — relative (`5m ago`) at a glance, exact on hover.
- **Resolve / reopen** — tick off feedback you've addressed without deleting the history.
- **Search & filter** — find any comment by text or author; filter to *Open* or *Mine*.
- **Attribution you can trust** — with Google sign-in, identities are verified server-side.

### Ownership & export
- You can edit or delete **your own** comments; other people's are read-only to you.
- **Export an annotated PDF** with highlights baked in and a full comments appendix — including replies and timestamps — readable in any PDF viewer.
- **Works offline.** Documents and comments live in your browser's IndexedDB.

---

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`) and sign in.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the unit tests |
| `npm run lint` | Lint the source |

### Signing in

You need an identity so comments can be attributed. Sign in with:

- **Email + password** — enter your email; if it's new you'll set a password, if it's registered you'll be asked for it. Works out of the box, no external setup.
- **Google** — appears once you've configured a client ID ([below](#enabling-google-sign-in)), and gives verified identity.

Either way you stay signed in on that device (session persists in `localStorage`) until you sign out.

---

## Sharing a document for review

1. Open your PDF and add any comments you want.
2. Click **Share** → **Create share link**.
3. Send the link to your reviewer (there's an *Open in email app* shortcut).
4. They open it, sign in, and comment. Comments sync both ways every few seconds.

> **Requires deployment.** Share links point at a running server, so this works
> once the app is deployed — not against `localhost`, which your reviewer can't
> reach. See [Deployment](#deployment).

**Access model, stated plainly:** anyone holding a share link can read the
document and add comments — the link *is* the credential, which is what makes it
easy to send to someone without making them sign up. Google sign-in prevents
someone from *posting under another signed-in person's name*, but it does not
gate access. Don't share links to material you wouldn't want forwarded.

**Size:** PDFs upload directly from your browser to Blob storage, not through
a serverless function body, so there's no meaningful size limit for normal
documents (tens of MB is fine).

---

## Deployment

The app is a static front-end plus two small serverless functions, designed for
Vercel's free tier.

### 1. Deploy

```bash
npx vercel
```

Follow the prompts (or import the repo from the Vercel dashboard). You'll get a
URL like `https://pdf-reader-yourname.vercel.app`.

### 2. Add Blob storage

Shared PDFs and comments are stored in Vercel Blob.

In your project dashboard → **Storage** → **Create Database** → **Blob**, then
connect it to the project. Vercel sets `BLOB_READ_WRITE_TOKEN` automatically.

### 3. Add an auth secret

Email/password accounts need a signing secret for session tokens:

```bash
npx vercel env add AUTH_SECRET production
npx vercel env add AUTH_SECRET preview
npx vercel env add AUTH_SECRET development
```

Use a long random value, e.g. `openssl rand -hex 32`.

### 4. Enabling Google Sign-In (optional)

Skip this and email/password sign-in is used instead.

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** of type *Web application*.
2. Under **Authorised JavaScript origins**, add your deployed URL (and `http://localhost:5173` for local testing).
3. Copy the client ID and set it as **two** environment variables in Vercel:

   | Variable | Used by | Purpose |
   | --- | --- | --- |
   | `VITE_GOOGLE_CLIENT_ID` | Browser | Renders the Google button |
   | `GOOGLE_CLIENT_ID` | Server | Verifies ID tokens |

   Both take the same value. The server one is what makes attribution
   trustworthy — without it, tokens aren't verified.

4. Redeploy so the variables take effect:

   ```bash
   npx vercel --prod
   ```

For local development, run `npx vercel env pull .env.local` to pull down
whatever you've set above (or create `.env.local` by hand with the same
variables).

---

## Architecture

```
src/
  components/     UI — Viewer, PdfPage, PageNav, Sidebar, SignIn, AnnotationPopup
  lib/
    pdfjs.ts      PDF.js worker wiring
    outline.ts    Table-of-contents extraction (pdf.js getOutline)
    exportPdf.ts  Bakes highlights + comment appendix via pdf-lib
    merge.ts      Conflict-free annotation merging  ← unit tested
    colors.ts     Per-document colour assignment    ← unit tested
    auth.ts       Session handling — Google Identity Services + email/password
    share.ts      Direct-to-Blob upload, share create/read/sync
    storage.ts    IndexedDB persistence
    migrate.ts    Forward-compatibility for older saved annotations
api/
  share/          Create share links; read/sync share records
  auth/           check-email, signup, login
  blob-upload.ts  Authorizes direct browser → Blob uploads
  _auth.ts        Bearer token verification — Google ID tokens + our own session tokens
  _users.ts       Password hashing (scrypt) and account storage
  _shareStore.ts  Append-only revision storage for share records (see below)
  _shared.ts      Server-side merge, mirroring lib/merge.ts
```

**Stack:** React · TypeScript · Vite · pdfjs-dist · pdf-lib · idb-keyval · Vercel Blob · jose

### How concurrent editing is handled

Two people commenting at once is the normal case, so writes are reconciled
**per annotation** rather than per document. Each annotation carries an
`updatedAt`; on conflict the newer one wins, replies from both sides are unioned,
and deletions are tombstones so they propagate instead of being resurrected by
the next merge.

The naive alternative — whoever saves last replaces the whole list — silently
destroys the other person's comments. The merge logic is unit-tested against
exactly that scenario.

### Why share data is append-only

A share record isn't stored as one file that gets overwritten. Vercel Blob's
public URLs are served through a CDN that can take anywhere from a few seconds
to (with default caching) a month to reflect an overwrite at an existing URL —
which meant a freshly-posted reply could be invisible on refresh. Every edit
instead writes a brand-new file (`shares/<id>/rev/<timestamp>-<random>.json`);
reads list that folder and take the newest one. A URL nobody has requested
before can't be served stale, since there's nothing cached for it yet. Old
revisions are pruned in the background once they're a minute old.

### Accounts

Email/password accounts are stored in the same Blob store as everything else
(a second, access-controlled store is more setup than this project asks of
you). The path is an HMAC of the email keyed by a server-only secret, so a
record is unguessable without that secret even on a public store, and the
password itself is scrypt-hashed underneath. Sessions are self-issued JWTs
signed with the same secret.

---

## Privacy

- PDFs opened locally stay in your browser (IndexedDB) and are never uploaded.
- Nothing is transmitted until you press **Share**.
- Shared documents live in your own Vercel Blob store, under your account.
- Passwords are never stored in plain text (scrypt-hashed) and account
  records aren't guessable from someone's email alone (see [Accounts](#accounts)).

---

## Licence

MIT
