const PATH_PREFIX = (process.env.PATH_PREFIX || '').replace(/\/$/, '');

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/wp-content');
  // src/CNAME is intentionally renamed to src/CNAME.bak right now so the
  // github.io preview URL works without redirecting to the custom domain
  // before DNS is pointed at it -- see README. Restore the passthrough
  // (and rename the file back) once DNS is ready to go live.

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

  return {
    dir: { input: 'src', output: '_site', includes: '_includes' },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
