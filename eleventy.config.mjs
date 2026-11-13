export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/CNAME');

  eleventyConfig.addCollection('posts', (collectionApi) =>
    collectionApi.getFilteredByGlob('src/posts/*.md').sort((a, b) => b.date - a.date));

  eleventyConfig.addFilter('postDate', (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

  eleventyConfig.addFilter('isoDate', (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addGlobalData('currentYear', () => new Date().getFullYear());

  return {
    dir: { input: 'src', output: '_site', includes: '_includes' },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
