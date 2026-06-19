import Router from './src/assets/Router.js';
import DataLoader from './src/assets/DataLoader.js';
import BeanGraph from './src/assets/BeanGraph.js';
import Dashboard from './src/assets/Dashboard.js';
import RequestTracker from './src/assets/RequestTracker.js';

$(document).ready(() => {
    const dataLoader = new DataLoader();
    const beanGraph = new BeanGraph(dataLoader);
    const dashboard = new Dashboard(dataLoader);
    const requestTracker = new RequestTracker();

    // Configure routes and instantiate Router
    const appRouter = new Router({
        container: '#main-content',
        defaultRoute: 'definitions',
        routes: {
            'request': {
                template: 'request',
                onEnter: () => requestTracker.enter(),
                onLeave: () => requestTracker.leave()
            },
            'definitions': {
                template: 'definitions',
                onEnter: () => dashboard.enter(),
                onLeave: () => dashboard.leave()
            },
            'graph': {
                template: 'graph',
                onEnter: () => beanGraph.enter(),
                onLeave: () => beanGraph.leave()
            },
            'conditions': {
                template: 'conditions',
                onEnter: () => dashboard.enter(),
                onLeave: () => dashboard.leave()
            }
        }
    });

    // Start Router
    appRouter.init();

    /* ── Resize ── */
    let resizeTimer;
    $(window).on('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            beanGraph.handleResize();
        }, 200);
    });
});