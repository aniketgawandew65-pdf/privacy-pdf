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
} = await loadTs('../src/seoConfig.ts');

const {
  ARTICLES,
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


// Internal links in rendered guides/blogs
const validPaths = new Set(allPaths);

function checkLinks(source, html) {
  const links = [
    ...html.matchAll(/href="(\/[^"#?]*)/g),
  ].map(match => match[1]);

  for (const target of links) {
    if (!validPaths.has(target)) {
      fail(
        `Broken internal link: ${source} -> ${target}`
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
