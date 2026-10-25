export default {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/generate/:slug',
      handler: 'report.generate',
      config: {},
    },
  ],
};
