// Allow document formatting, never executable markup or remote resource requests.
const tags = new Set('p div span br b strong i em u s strike ul ol li h1 h2 h3 h4 h5 h6 blockquote pre code table thead tbody tfoot tr th td hr img font sub sup'.split(' '));
const drop = new Set(['script','style','iframe','object','embed','link','meta','base','svg','math','template']);
const properties = new Set('color background-color font-size font-family font-weight font-style text-align text-decoration line-height letter-spacing padding padding-top padding-bottom padding-left padding-right margin margin-top margin-bottom margin-left margin-right border border-top border-bottom border-left border-right border-collapse border-spacing border-radius width max-width min-width height max-height vertical-align display flex justify-content align-items gap white-space word-break'.split(' '));
export function sanitizeRichHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const clean = (parent: Element) => {
    for (const node of Array.from(parent.children)) {
      const tag = node.tagName.toLowerCase();
      if (drop.has(tag)) { node.remove(); continue; }
      clean(node);
      if (!tags.has(tag)) { node.replaceWith(...Array.from(node.childNodes)); continue; }
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === 'style') {
          const style = (node as HTMLElement).style;
          for (const property of Array.from(style)) {
            const value = style.getPropertyValue(property);
            if (!properties.has(property) || /url|expression|@|\\|[<>]/i.test(value)) style.removeProperty(property);
          }
        } else if (tag === 'img' && name === 'src' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(attr.value)) {
          // Embedded raster image, not a request to another site.
        } else if (['rowspan','colspan','width','height','size'].includes(name) && /^\d{1,4}$/.test(attr.value)) {
          // Bounded numeric document formatting.
        } else if (tag === 'font' && ['color','face'].includes(name) && !/[<>\\]|url|expression/i.test(attr.value)) {
          // Legacy contentEditable formatting.
        } else node.removeAttribute(attr.name);
      }
    }
  };
  clean(document.body);
  return document.body.innerHTML;
}
