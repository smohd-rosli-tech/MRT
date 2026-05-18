const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '/', component: () => import('pages/MatchesPage.vue') },
      { path: '/team', component: () => import('pages/database/TeamManager.vue') },
      { path: '/room', component: () => import('pages/RoomPage.vue') },
      { path: '/matches', component: () => import('pages/MatchesPage.vue') },
      { path: '/draft', component: () => import('pages/XpressionDraftViewer.vue') },
      {
        path: '/matches/:match_uid',
        name: 'match-detail',
        component: () => import('pages/MatchDetailPage.vue'),
      },
      {
        path: 'live',
        children: [
          { path: 'draft', name: 'DraftPage', component: () => import('pages/XpressionDraftViewer.vue') },
          {
            path: 'dashboard',
            name: 'DashboardPage',
            component: () => import('pages/DashboardPage.vue'),
          },
        ],
      },
      {
        path: 'test',
        // children: [{ path: '', component: () => import('pages/test/LiveDashboard.vue') }],
        children: [
          { path: '', component: () => import('pages/test/testObjective.vue') },
          { path: 'draft', component: () => import('pages/test/DraftPage.vue') },
        ],
      },
    ],
  },

  // Always leave this as last one,ß
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
