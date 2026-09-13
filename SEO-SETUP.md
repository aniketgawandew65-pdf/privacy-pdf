# SEO content and release notes

## What this change includes

- Five detailed tool guides: compression, crop, merge, sign and HEIC conversion.
- `/blog`, `/blog/reduce-pdf-for-upload-limit`, `/blog/crop-all-pdf-pages`.
- `/compress-pdf-to-50kb` with the existing target-aware compressor.
- `scripts/build-seo.mjs`, called by `npm run build`, generates static HTML for every declared public route plus article routes. The initial document contains headings, descriptions, shared guide/article content, navigation, canonical URLs and structured data. The existing React application takes over when JavaScript loads; PDF processing still happens in the browser.
- Generated sitemap excludes the duplicate visual editor alias. An explicit redirect preserves that alias.
- A top-level `404.html` and removal of the old catch-all rewrite let Cloudflare Pages return proper missing-page responses.

## Editing articles

Edit `ARTICLES` in `src/seoContent.ts`. Use a unique slug, an accurate title/description, the relevant tool link and useful sections. This is reviewed source content, not an automatic AI publishing service. Do not insert arbitrary HTML into the data: the shared renderer escapes text.

Tool instructions live in `TOOL_GUIDES` in the same file. Keep them consistent with the actual controls and limitations. New static tool routes also need metadata in `src/seoConfig.ts`; the production build fails if a declared route lacks metadata.

## Domain verification

Public nameserver lookup on 11 September 2026 returned `aster.dns-parking.com` and `helios.dns-parking.com`. DNS is at Hostinger, even though the application is on Cloudflare Pages.

Add a separate DNS record at Hostinger (preserve the existing SPF TXT record):

- Type: TXT
- Name: @
- Value: google-site-verification=cBPF9VbIlMX9N16Uc-V5Jw6tFI3LmZE-gGODvyqbU2I
- TTL: provider default

Then click Verify on the 1into1.com Domain property in Google Search Console. Leave the TXT record in place. Submit `https://www.1into1.com/sitemap.xml` after deployment. Request inspection of the home page and priority tool pages; this is not a guarantee of indexing or ranking.

## Deployment

Keep Cloudflare's build command `npm run build` and output folder `dist`. Include `scripts/build-seo.mjs` and `src/seoContent.ts` when committing this change; a commit that omits them will fail. Deploying only the old `vite build` output skips static generation.

Before release: build, inspect static titles/content, then verify a tool URL, a blog URL, the sitemap, and a nonexistent URL on the deployed site. The nonexistent URL should respond 404, and `/visual-editor` should redirect to `/edit-pdf`. Existing offline caching is preserved; a previously cached page may still appear while offline.

## Checks completed locally

- Production build generated 54 pages plus a 404 document.
- All 54 pages had one H1, canonical, description and valid structured-data block; internal links resolved to generated pages. Sitemap contained 53 canonical URLs.
- Blog article navigation, guide FAQ expansion and the 50 KB preset were checked in the browser.
- Mobile and desktop article layouts were visually inspected.

DNS verification, Search Console submission and production HTTP response checks are pending. No SEO deployment was performed in this change.
