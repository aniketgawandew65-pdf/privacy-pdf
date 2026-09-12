import { readFile, writeFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';

// Compile the shared content without adding another bundler or runtime dependency.
async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  return import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
}
const {TOOLS_METADATA} = await loadTs('../src/seoConfig.ts');
const {TOOL_COPY} = await loadTs('../src/toolCopy.ts');
const {ARTICLES,blogMeta,renderGuide,renderBlog,escapeHtml:e} = await loadTs('../src/seoContent.ts');
const origin = 'https://www.1into1.com';
const dist = new URL('../dist/',import.meta.url);
const template = await readFile(new URL('index.html',dist),'utf8');
const app = await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
const paths = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]).filter(p=>!p.includes('*')&&!p.includes(':'));
const articlePaths = ARTICLES.map(a=>'/blog/'+a.slug);
const allPaths = [...new Set([...paths,...articlePaths])];
const aliases = {'/visual-editor':'/edit-pdf'};
const nav = Object.entries(TOOLS_METADATA).filter(([p])=>allPaths.includes(p)&&!aliases[p]&&!['/','/privacy','/terms'].includes(p)).map(([p,m])=>`<a href="${p}">${e(m.heading)}</a>`).join('');
function headFor(meta,path) {
  const url=origin+(aliases[path]|| (path==='/'?'':path));
  let html=template.replace(/<title>[\s\S]*?<\/title>/,`<title>${e(meta.title)}</title>`);
  const values={'name="description"':meta.description,'property="og:title"':meta.title,'property="og:description"':meta.description,'property="og:url"':url,'name="twitter:title"':meta.title,'name="twitter:description"':meta.description,'name="twitter:url"':url};
  for(const [attr,value] of Object.entries(values)) html=html.replace(new RegExp(`<meta ${attr} content="[^"]*"\\s*/?>`),`<meta ${attr} content="${e(value)}" />`);
  const isArticle=articlePaths.includes(path);
  const organization={'@type':'Organization','@id':origin+'/#organization',name:'1into1 PDF',url:origin+'/'};

  let primaryEntity;
  if(path==='/') {
    primaryEntity={'@type':'WebSite','@id':origin+'/#website',name:'1into1 PDF',url,description:meta.description,publisher:{'@id':origin+'/#organization'}};
  } else if(path==='/blog') {
    primaryEntity={'@type':'CollectionPage','@id':url+'#page',name:meta.heading,description:meta.description,url,isPartOf:{'@id':origin+'/#website'}};
  } else if(isArticle) {
    primaryEntity={'@type':'Article','@id':url+'#article',headline:meta.heading,name:meta.heading,description:meta.description,url,author:{'@id':origin+'/#organization'},publisher:{'@id':origin+'/#organization'},mainEntityOfPage:url};
  } else if(['/privacy','/terms'].includes(path)) {
    primaryEntity={'@type':'WebPage','@id':url+'#page',name:meta.heading,description:meta.description,url,isPartOf:{'@id':origin+'/#website'}};
  } else {
    primaryEntity={
      '@type':'WebApplication','@id':url+'#app',name:meta.heading,url,description:meta.description,
      applicationCategory:'UtilitiesApplication',operatingSystem:'Any',
      browserRequirements:'Requires a modern web browser with HTML5 support',
      provider:{'@id':origin+'/#organization'},
      offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},
      featureList:['Local-first PDF processing','Browser-based document tools','No account required for core tools','Offline-capable PWA for supported local workflows']
    };
  }

  const breadcrumbItems=isArticle
    ? [
        {'@type':'ListItem',position:1,name:'Home',item:origin+'/'},
        {'@type':'ListItem',position:2,name:'PDF Guides',item:origin+'/blog'},
        {'@type':'ListItem',position:3,name:meta.heading,item:url}
      ]
    : path==='/' ? [] : [
        {'@type':'ListItem',position:1,name:'Home',item:origin+'/'},
        {'@type':'ListItem',position:2,name:meta.heading,item:url}
      ];

  const schema={'@context':'https://schema.org','@graph':[
    organization,
    primaryEntity,
    ...(breadcrumbItems.length?[{'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:breadcrumbItems}]:[])
  ]};

  return html.replace('</head>',`<link rel="canonical" href="${url}" /><script id="schema-org-ld" type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head>`);
}
for(const path of allPaths) {
  const meta=blogMeta(path)||TOOLS_METADATA[path];
  if(!meta) throw new Error('Missing SEO metadata for route: '+path);
  const isBlog=Boolean(blogMeta(path));
  const body=`<div class="app-shell seo-static-shell"><header class="site-header"><a class="brand" href="/">1into1 PDF</a><a href="/blog">PDF guides</a></header><main class="site-main"><section class="page-intro ${path==='/'?'home-intro':''}">${!isBlog&&!['/privacy','/terms'].includes(path)?'<div class="eyebrow">YOUR FILES. YOUR DEVICE.</div>':''}<h1>${path==='/'?'All tasks.<br class="mobile-break" /> <span>Simply done.</span>':e(meta.heading)}</h1><p>${e(path==='/'?'Everyday PDF tools, with privacy built in. Compress, merge, edit and convert — right in your browser.':TOOL_COPY[path]||meta.subheading)}</p>${!isBlog&&!['/privacy','/terms'].includes(path)?'<div class="trust-points" aria-label="Local PDF tool benefits"><span>Lightning fast</span><span>No internet needed</span><span>100% private</span><span>No signup</span></div><p class="trust-caption">*Local PDF tools after the app and required resources have loaded. Optional cloud AI and checkout need a connection.</p>':''}</section>${isBlog?renderBlog(path):`<section id="workspace" class="static-loading"><p>The interactive tool loads in your browser.</p><noscript>Enable JavaScript to process files on this device.</noscript></section>${renderGuide(path)}`}</main><footer class="site-footer"><a href="/blog">PDF guides</a><details class="footer-directory"><summary>Explore PDF tools</summary><nav>${nav}</nav></details><nav class="guide-related"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></footer></div>`;
  const html=headFor(meta,path)
    .replace('</head>', '<style id="seo-static-shell-style">.seo-static-shell .site-header,.seo-static-shell .site-footer,.seo-static-shell .site-main>:not(.page-intro){visibility:hidden!important;pointer-events:none!important}</style></head>')
    .replace('<div id="root"></div>',`<div id="root">${body}</div>`);
  const file=path==='/'?'index.html':path.slice(1)+'.html';
  const destination=new URL(file,dist);
  await mkdir(new URL('./',destination),{recursive:true});
  await writeFile(destination,html);
}
// A real 404 file disables Cloudflare Pages' automatic SPA fallback.
// Existing routes are static files; unknown paths must not return homepage HTML with 200.
await writeFile(new URL('404.html',dist),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | 1into1 PDF</title></head><body><main><h1>Page not found</h1><p>This address does not match a tool or guide.</p><a href="/">Open PDF tools</a> · <a href="/blog">Read PDF guides</a></main></body></html>`);
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allPaths.filter(p=>!aliases[p]).map(p=>`  <url><loc>${origin}${p==='/'?'/':p}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(new URL('sitemap.xml',dist),sitemap);
await writeFile(new URL('../public/sitemap.xml',import.meta.url),sitemap);
console.log(`SEO: generated ${allPaths.length} static pages, canonical metadata, sitemap and 404 page.`);
