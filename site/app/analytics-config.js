// Which analytics provider the site reports to, chosen when the site is built (this file ships with it).
// "none" sends nothing. To turn on Umami Cloud (spec 5.3), in one commit:
//   - set { provider: "umami", websiteId: "<the site's id>", endpoint: "<Umami's /api/send URL, checked against its docs>" };
//   - add the endpoint's origin to connect-src in vercel.json's Content-Security-Policy;
//   - Daniel approves the footer line sheet.js shows while a provider is on.
// tests/analytics.test.mjs refuses a config and a CSP that disagree.
export default { provider: "none" };
