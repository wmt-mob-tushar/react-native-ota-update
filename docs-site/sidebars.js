/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'architecture',
    'getting-started',
    {
      type: 'category',
      label: 'Backend',
      items: ['backend-setup', 'database-schema', 'edge-functions'],
    },
    {
      type: 'category',
      label: 'Client',
      items: ['sdk-integration', 'native-modules', 'update-flow', 'rollback'],
    },
    'cli',
    'dashboard',
    'api-reference',
    'troubleshooting',
  ],
};

module.exports = sidebars;
