const PATH_PREFIX = (process.env.PATH_PREFIX || '').replace(/\/$/, '');

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/wp-content');
  eleventyConfig.addPassthroughCopy('src/CNAME');

  if (PATH_PREFIX) {
    // GitHub Pages serves the preview under /utopiacap-site/, not the domain
    // root, so root-absolute href/src (e.g. "/assets/style.css") 404 there.
    // Rewrite them at build time. Unset PATH_PREFIX in deploy.yml once the
    // custom domain is live, since that serves from the root.
    eleventyConfig.addTransform('path-prefix', (content, outputPath) => {
      if (!outputPath || !outputPath.endsWith('.html')) return content;
      return content
        .replace(/((?:href|src)=")\/(?!\/)/g, `$1${PATH_PREFIX}/`)
        .replace(/(url\(['"])\/(?!\/)/g, `$1${PATH_PREFIX}/`);
    });
  }

  eleventyConfig.addCollection('posts', (collectionApi) =>
    collectionApi.getFilteredByGlob('src/posts/*.md').sort((a, b) => b.date - a.date));

  eleventyConfig.addFilter('postDate', (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

  eleventyConfig.addFilter('isoDate', (date) => new Date(date).toISOString().slice(0, 10));

  eleventyConfig.addFilter('firstImageSrc', (html) => {
    if (!html) return null;
    const match = /<img[^>]*\bsrc="([^"]+)"/.exec(html);
    return match ? match[1] : null;
  });
  eleventyConfig.addGlobalData('currentYear', () => new Date().getFullYear());

  // Matches a Track Record row (ticker + DD/MM/YYYY + type) back to the post
  // that reports it, so the ticker can link to its actual trade alert/short
  // report/investor warning instead of sitting as plain text.
  eleventyConfig.addFilter('reportUrl', (ticker, dateStr, type, posts) => {
    if (!ticker || !dateStr || !posts) return null;
    const [day, month, year] = dateStr.split('/').map(Number);
    if (!day || !month || !year) return null;
    const target = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const safeTicker = ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tickerRe = new RegExp(`\\b${safeTicker}\\b`);

    const byDate = (iso) => posts.filter((p) => {
      const pDate = new Date(p.date).toISOString().slice(0, 10);
      return pDate === iso && tickerRe.test(p.data.title || '');
    });

    let candidates = byDate(target);
    if (candidates.length === 0) {
      // A few recovered dates are off by one day from the post's own date
      // (likely a timezone artifact in the original recovered spreadsheet).
      const d = new Date(`${target}T00:00:00Z`);
      for (const delta of [-1, 1]) {
        const shifted = new Date(d);
        shifted.setUTCDate(shifted.getUTCDate() + delta);
        candidates = byDate(shifted.toISOString().slice(0, 10));
        if (candidates.length) break;
      }
    }

    if (candidates.length > 1) {
      const tag = type === 'Trade Alert' ? 'trade-alert' : type === 'Short Report' ? 'short-report' : null;
      if (tag) {
        const narrowed = candidates.filter((p) => (p.data.tags || []).includes(tag));
        if (narrowed.length) candidates = narrowed;
      } else if (type === 'Investor Warning') {
        const narrowed = candidates.filter((p) => /investor warning/i.test(p.data.title || ''));
        if (narrowed.length) candidates = narrowed;
      }
    }

    return candidates.length === 1 ? candidates[0].url : null;
  });

  return {
    dir: { input: 'src', output: '_site', includes: '_includes' },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
