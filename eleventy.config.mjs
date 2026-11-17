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

  // A few recovered posts were archived at a snapshot already using the
  // live site's bare-slug permalink (e.g. /ocgn-2/, /nvax/) rather than the
  // dated one (/2020/12/15/veru/) -- those are already at their final
  // short-slug URL, so redirects.njk must skip them or it'd collide trying
  // to write a second file to the same path.
  eleventyConfig.addCollection('postsNeedingSlugRedirect', (collectionApi) =>
    collectionApi.getFilteredByGlob('src/posts/*.md').filter((t) => /^\/\d{4}\//.test(t.url)));

  // Old, still-Google-indexed URLs that outlived a rename elsewhere on the
  // live site (confirmed per-entry via Wayback CDX, not guessed) -- add one
  // line here whenever another is spotted 404ing from a Google result.
  // src/legacy-redirects.njk turns each into the same tiny
  // redirect-plus-canonical stub as the per-post ones above.
  eleventyConfig.addGlobalData('legacyRedirects', () => [
    // /investor-warning/ (singular) was the real URL as of a 2020-05-06
    // Wayback capture; the site later renamed it to /investor-warnings/
    // (captured 2020-09-24), but Google's index still has the old one.
    { from: 'investor-warning', to: '/investor-warnings/' },
    // /blog/ was last captured 2026-01-15 as WordPress's auto-generated
    // posts-page listing, still showing the theme's unedited default
    // placeholder content ("Edit this text") -- not real content, just
    // whatever sat on the domain before it pointed at this rebuild. Its own
    // page title is literally "Home", so send it to the real homepage.
    { from: 'blog', to: '/' },
  ]);

  eleventyConfig.addFilter('postDate', (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

  eleventyConfig.addFilter('isoDate', (date) => new Date(date).toISOString().slice(0, 10));

  // The live site's final permalink structure was the bare slug
  // (utopiacap.com/veru/), confirmed still serving 200 in Wayback CDX
  // captures through Feb 2026 -- but this rebuild recovered posts from an
  // earlier Wayback snapshot that used dated permalinks
  // (/2020/12/15/veru/). Google's index still has the bare-slug URLs, so
  // they 404 here. src/redirects.njk uses this to emit a tiny alias page
  // at the bare slug that points back to the real post.
  eleventyConfig.addFilter('lastSegment', (url) => url.replace(/\/$/, '').split('/').pop());

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
    // Rows for a repeated ticker are disambiguated with a trailing " N" or
    // "*" in the recovered table (e.g. "CYDY 4", "XSPA*") -- strip that back
    // off before matching, since no post title contains that suffix.
    const baseTicker = ticker.replace(/\s+\d+$/, '').replace(/\*+$/, '');
    const safeTicker = baseTicker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
