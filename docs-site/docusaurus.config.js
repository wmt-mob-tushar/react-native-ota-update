// @ts-check
const { themes } = require('prism-react-renderer');

// Vercel serves at the domain root; GitHub Pages serves under a sub-path.
// Set DEPLOY_TARGET=gh-pages in the Pages workflow; Vercel uses the default.
const isGitHubPages = process.env.DEPLOY_TARGET === 'gh-pages';
const siteUrl  = process.env.SITE_URL
  || (isGitHubPages ? 'https://wmt-mob-tushar.github.io' : 'https://react-native-ota-update-docs.vercel.app');
const baseUrl  = isGitHubPages ? '/react-native-ota-update/' : '/';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'React Native OTA Update Platform',
  tagline: 'Self-hosted Over-The-Air updates for React Native, powered by Supabase',
  favicon: 'img/favicon.ico',

  url: siteUrl,
  baseUrl,

  organizationName: 'wmt-mob-tushar',
  projectName: 'react-native-ota-update',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl:
            'https://github.com/wmt-mob-tushar/react-native-ota-update/tree/main/docs-site/',
        },
        blog: false,
        theme: { customCss: require.resolve('./src/css/custom.css') },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: { respectPrefersColorScheme: true },
      navbar: {
        title: 'OTA Platform',
        items: [
          { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
          {
            href: 'https://github.com/wmt-mob-tushar/react-native-ota-update',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting Started', to: '/getting-started' },
              { label: 'Architecture', to: '/architecture' },
              { label: 'API Reference', to: '/api-reference' },
            ],
          },
          {
            title: 'More',
            items: [
              { label: 'GitHub', href: 'https://github.com/wmt-mob-tushar/react-native-ota-update' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} WebMob Technologies. MIT Licensed.`,
      },
      prism: {
        theme: themes.github,
        darkTheme: themes.dracula,
        additionalLanguages: ['bash', 'json', 'sql', 'java', 'objectivec', 'kotlin'],
      },
    }),
};

module.exports = config;
