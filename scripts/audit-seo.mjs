import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTs(path) {
  const source = await readFile(
    new URL(path, import.meta.url),
    'utf8'
  );

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return import(
    'data:text/javascript;base64,' +
    Buffer.from(outputText).toString('base64')
  );
}

const {
  TOOLS_METADATA,
  SEO_ALIASES,
  SEO_LASTMOD,
  SEO_PRIORITY_PATHS,
} = await loadTs('../src/seoConfig.ts');

const {
  ARTICLES,
  TOOL_GUIDES,
  blogMeta,
  renderGuide,
  renderBlog,
} = await loadTs('../src/seoContent.ts');

const origin = 'https://www.1into1.com';
const dist = new URL('../dist/', import.meta.url);

const app = await readFile(
  new URL('../src/App.tsx', import.meta.url),
  'utf8'
);

const privatePaths =
  new Set(['/admin']);

const routes = [
  ...app.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g),
]
  .map(match => match[1])
  .filter(
    route =>
      !route.includes('*') &&
      !route.includes(':') &&
      !privatePaths.has(route)
  );

const articlePaths =
  ARTICLES.map(article => `/blog/${article.slug}`);

const allPaths = [
  ...new Set([
    ...routes,
    ...articlePaths,
  ]),
];

const aliases = SEO_ALIASES || {};

const canonicalPaths =
  allPaths.filter(path => !aliases[path]);

const errors = [];

function fail(message) {
  errors.push(message);
}

function metaFor(path) {
  return blogMeta(path) || TOOLS_METADATA[path];
}


// Metadata coverage
for (const path of allPaths) {
  if (!metaFor(path)) {
    fail(`Missing SEO metadata: ${path}`);
  }
}

for (const path of Object.keys(TOOLS_METADATA)) {
  if (!allPaths.includes(path)) {
    fail(`SEO metadata exists for non-route: ${path}`);
  }
}


// Priority crawl targets must be real canonical routes with substantive guide content.
for (const path of SEO_PRIORITY_PATHS || []) {
  if (!allPaths.includes(path)) {
    fail(`Priority SEO path is not a route: ${path}`);
    continue;
  }

  if (aliases[path]) {
    fail(`Priority SEO path must be canonical, not an alias: ${path}`);
  }

  if (!metaFor(path)) {
    fail(`Priority SEO path is missing metadata: ${path}`);
  }

  if (!TOOL_GUIDES[path]) {
    fail(`Priority SEO path is missing a guide: ${path}`);
  }
}


// Supported sitemap lastmod values must be real canonical routes and ISO dates.
for (const [path, value] of Object.entries(SEO_LASTMOD || {})) {
  if (!allPaths.includes(path)) {
    fail(`lastmod exists for non-route: ${path}`);
  }

  if (aliases[path]) {
    fail(`lastmod must be attached to the canonical route, not alias: ${path}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`Invalid lastmod date for ${path}: ${value}`);
  }
}


// Research/editorial integrity checks.
const articleSlugs = new Set();

for (const article of ARTICLES) {
  if (articleSlugs.has(article.slug)) {
    fail(`Duplicate article slug: ${article.slug}`);
  }
  articleSlugs.add(article.slug);

  if (article.comparison?.length) {
    if (!article.published || !article.updated) {
      fail(`Research article is missing published/updated dates: ${article.slug}`);
    }

    if (!article.methodology) {
      fail(`Research article is missing methodology: ${article.slug}`);
    }

    if (!article.sources?.length) {
      fail(`Research article is missing official sources: ${article.slug}`);
    }

    if (!article.datasetUrl) {
      fail(`Research article is missing downloadable data: ${article.slug}`);
    }

    for (const row of article.comparison) {
      const validSource =
        row.sourceUrl.startsWith('/') ||
        row.sourceUrl.startsWith('https://');

      if (!validSource) {
        fail(`Research comparison has invalid source URL: ${article.slug} -> ${row.service}`);
      }
    }

    for (const source of article.sources || []) {
      const validSource =
        source.url.startsWith('/') ||
        source.url.startsWith('https://');

      if (!validSource) {
        fail(`Research article has invalid source URL: ${article.slug} -> ${source.label}`);
      }
    }
  }
}


// Article taxonomy and canonical CTA targets.
for (const article of ARTICLES) {
  if (!article.category?.trim()) {
    fail(`Article is missing category: ${article.slug}`);
  }

  if (!allPaths.includes(article.tool)) {
    fail(`Article tool target is not a route: ${article.slug} -> ${article.tool}`);
  } else if (aliases[article.tool]) {
    fail(`Article tool target must be canonical, not an alias: ${article.slug} -> ${article.tool}`);
  }
}


// Duplicate canonical titles/descriptions
const titles = new Map();
const descriptions = new Map();

for (const path of canonicalPaths) {
  const meta = metaFor(path);

  if (!meta) continue;

  if (titles.has(meta.title)) {
    fail(
      `Duplicate title: ${titles.get(meta.title)} and ${path}`
    );
  } else {
    titles.set(meta.title, path);
  }

  if (descriptions.has(meta.description)) {
    fail(
      `Duplicate description: ${descriptions.get(meta.description)} and ${path}`
    );
  } else {
    descriptions.set(meta.description, path);
  }
}


// Internal links in rendered guides/blogs.
// Declared research downloads are static assets, not application routes.
const researchAssetPaths =
  ARTICLES
    .map(article => article.datasetUrl)
    .filter(
      (path) =>
        typeof path === 'string' &&
        path.startsWith('/')
    );

const validPaths =
  new Set([
    ...allPaths,
    ...researchAssetPaths,
  ]);

function checkLinks(source, html) {
  const links = [
    ...html.matchAll(/href="(\/[^"#?]*)/g),
  ].map(match => match[1]);

  for (const target of links) {
    if (!validPaths.has(target)) {
      fail(
        `Broken internal link: ${source} -> ${target}`
      );
      continue;
    }

    if (aliases[target]) {
      fail(
        `Internal link must use canonical route: ${source} -> ${target} (canonical: ${aliases[target]})`
      );
    }
  }
}

for (const path of allPaths) {
  const html =
    blogMeta(path)
      ? renderBlog(path)
      : renderGuide(path);

  if (html) {
    checkLinks(path, html);
  }
}


// Generated page checks
function fileFor(path) {
  return path === '/'
    ? 'index.html'
    : `${path.slice(1)}.html`;
}

for (const path of allPaths) {
  let html;

  try {
    html = await readFile(
      new URL(fileFor(path), dist),
      'utf8'
    );
  } catch {
    fail(`Missing generated HTML: ${path}`);
    continue;
  }

  const expectedCanonical =
    origin +
    (
      aliases[path] ||
      (path === '/' ? '' : path)
    );

  const canonical =
    html.match(
      /<link rel="canonical" href="([^"]+)"\s*\/?>/
    );

  if (
    !canonical ||
    canonical[1] !== expectedCanonical
  ) {
    fail(
      `Canonical mismatch: ${path}`
    );
  }

  const titles =
    html.match(/<title>[\s\S]*?<\/title>/g) || [];

  if (titles.length !== 1) {
    fail(
      `${path}: expected 1 title, found ${titles.length}`
    );
  }

  const descriptions =
    html.match(
      /<meta name="description" content="[^"]*"\s*\/?>/g
    ) || [];

  if (descriptions.length !== 1) {
    fail(
      `${path}: expected 1 description, found ${descriptions.length}`
    );
  }

  const h1s =
    html.match(/<h1\b/g) || [];

  if (h1s.length !== 1) {
    fail(
      `${path}: expected 1 H1, found ${h1s.length}`
    );
  }

  const schema =
    html.match(
      /<script id="schema-org-ld" type="application\/ld\+json">([\s\S]*?)<\/script>/
    );

  if (!schema) {
    fail(`Missing JSON-LD: ${path}`);
  } else {
    try {
      JSON.parse(schema[1]);
    } catch {
      fail(`Invalid JSON-LD: ${path}`);
    }
  }
}


// Research pages must render their comparison, sources and dated Article schema.
for (const article of ARTICLES.filter(article => article.comparison?.length)) {
  const path = '/blog/' + article.slug;
  const html = await readFile(
    new URL(fileFor(path), dist),
    'utf8'
  );

  if (!html.includes('class="research-table"')) {
    fail(`${path}: research comparison table did not render.`);
  }

  if (!html.includes('class="research-sources"')) {
    fail(`${path}: research source list did not render.`);
  }

  if (
    article.datasetUrl &&
    !html.includes(`href="${article.datasetUrl}"`)
  ) {
    fail(`${path}: research dataset link did not render.`);
  }

  if (article.datasetUrl?.startsWith('/')) {
    try {
      await readFile(
        new URL(article.datasetUrl.slice(1), dist),
        'utf8'
      );
    } catch {
      fail(`${path}: downloadable research dataset is missing from dist.`);
    }
  }

  const schemaMatch =
    html.match(
      /<script id="schema-org-ld" type="application\/ld\+json">([\s\S]*?)<\/script>/
    );

  if (!schemaMatch) {
    fail(`${path}: missing Article schema.`);
  } else {
    try {
      const schema = JSON.parse(schemaMatch[1]);
      const articleNode =
        schema['@graph']?.find(
          node => node['@type'] === 'Article'
        );

      if (!articleNode?.datePublished || !articleNode?.dateModified) {
        fail(`${path}: Article schema is missing published/modified dates.`);
      }

      if (!Array.isArray(articleNode?.citation) || !articleNode.citation.length) {
        fail(`${path}: Article schema is missing source citations.`);
      }
    } catch {
      fail(`${path}: invalid research Article schema.`);
    }
  }
}


// Priority pages must expose useful static HTML before React executes.
for (const path of SEO_PRIORITY_PATHS || []) {
  const html = await readFile(
    new URL(fileFor(path), dist),
    'utf8'
  );

  if (!html.includes('class="seo-guide"')) {
    fail(`${path}: priority page has no static SEO guide.`);
  }

  if (html.includes('seo-static-shell-style')) {
    fail(`${path}: static crawl content is hidden.`);
  }
}


// The homepage must contain contextual links to every priority crawl target.
{
  const homeHtml = await readFile(
    new URL('index.html', dist),
    'utf8'
  );

  for (const path of SEO_PRIORITY_PATHS || []) {
    if (!homeHtml.includes(`href="${path}"`)) {
      fail(`Homepage is missing priority internal link: ${path}`);
    }
  }
}


// Sitemap coverage
const sitemap = await readFile(
  new URL('sitemap.xml', dist),
  'utf8'
);

const actualUrls = [
  ...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g),
]
  .map(match => match[1])
  .sort();

const expectedUrls =
  canonicalPaths
    .map(
      path =>
        origin +
        (path === '/' ? '/' : path)
    )
    .sort();

if (
  JSON.stringify(actualUrls) !==
  JSON.stringify(expectedUrls)
) {
  fail(
    'Sitemap does not exactly match canonical routes.'
  );
}

for (const [path, value] of Object.entries(SEO_LASTMOD || {})) {
  const loc =
    origin +
    (path === '/' ? '/' : path);

  const expected =
    `<url><loc>${loc}</loc><lastmod>${value}</lastmod></url>`;

  if (!sitemap.includes(expected)) {
    fail(
      `Sitemap lastmod mismatch: ${path}`
    );
  }
}


// Private route checks
try {
  const adminHtml =
    await readFile(
      new URL('admin.html', dist),
      'utf8'
    );

  if (
    !adminHtml.includes(
      'name="robots" content="noindex,nofollow"'
    )
  ) {
    fail(
      '/admin: missing noindex,nofollow.'
    );
  }
} catch {
  fail(
    'Missing generated HTML: /admin'
  );
}


// Canonical aliases must also have server-side 301 redirects.
const redirects = await readFile(
  new URL('../public/_redirects', import.meta.url),
  'utf8'
);

const redirectLines =
  redirects
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts.length >= 3);

for (const [from, to] of Object.entries(aliases)) {
  const found =
    redirectLines.some(
      parts =>
        parts[0] === from &&
        parts[1] === to &&
        parts[2] === '301'
    );

  if (!found) {
    fail(
      `Missing 301 redirect for SEO alias: ${from} -> ${to}`
    );
  }
}


// robots.txt
const robots = await readFile(
  new URL('../public/robots.txt', import.meta.url),
  'utf8'
);

if (
  !robots.includes(
    `Sitemap: ${origin}/sitemap.xml`
  )
) {
  fail(
    'robots.txt sitemap reference is missing or incorrect.'
  );
}


// 404
const notFound = await readFile(
  new URL('404.html', dist),
  'utf8'
);

if (
  !notFound.includes(
    '<meta name="robots" content="noindex">'
  )
) {
  fail(
    '404 page is missing robots noindex.'
  );
}


// Result
if (errors.length) {
  console.error('\nSEO AUDIT: FAILED\n');

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(
  `SEO AUDIT: PASS — ${allPaths.length} static pages, ` +
  `${canonicalPaths.length} canonical sitemap URLs, ` +
  'metadata/canonicals/schema/internal links/robots/404 verified.'
);
