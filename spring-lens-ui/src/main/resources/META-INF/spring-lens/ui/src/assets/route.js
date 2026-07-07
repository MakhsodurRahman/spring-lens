import { CLASSES, TEMPLATES } from './constants.js';

export default class Route {
    constructor(config = {}) {
        this.routes = config.routes || {};
        this.container = $(config.container || '#main-content');
        this.pagesDir = config.pagesDir || './src/pages/';
        this.defaultRoute = config.defaultRoute || 'definitions';
        this.templateCache = {};
        this.activeRouteKey = null;
    }

    init() {
        $(window).on('hashchange', () => this.resolve());
        
        // Listen to parent links to toggle collapse state when already open
        $(document).on('click', '.parent-link', (e) => {
            const $link = $(e.currentTarget);
            const $submenu = $link.next('.submenu');
            if ($submenu.length && $submenu.is(':visible')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                $submenu.slideUp(200);
                $link.find('.chevron-icon').removeClass('rotate-180');
            }
        });

        // Listen to links marked with .nav-link class
        $(document).on('click', '.nav-link', (e) => {
            e.preventDefault();
            const page = $(e.currentTarget).data('page');
            if (page) {
                this.navigate(page);
            }
        });

        this.resolve();
    }

    /**
     * Programmatic navigation
     */
    navigate(routeKey) {
        window.location.hash = `#/${routeKey}`;
    }

    /**
     * Match active route and load associated template and hooks
     */
    async resolve() {
        const hash = window.location.hash || `#/${this.defaultRoute}`;
        const routeKey = hash.replace('#/', '');
        const route = this.routes[routeKey];

        if (!route) {
            this.navigate(this.defaultRoute);
            return;
        }

        // 1. Run cleanup (onLeave) hook for the previous active route
        if (this.activeRouteKey) {
            const prevRoute = this.routes[this.activeRouteKey];
            if (prevRoute?.onLeave) {
                try {
                    prevRoute.onLeave();
                } catch (e) {
                    console.error(`Error executing onLeave hook for route ${this.activeRouteKey}:`, e);
                }
            }
        }

        this.activeRouteKey = routeKey;

        // 2. Render dynamic loading state
        this.container.html(TEMPLATES.loading);

        try {
            // 3. Load template (retrieve from cache or fetch via GET)
            const html = this.templateCache[routeKey] || await $.get(`${this.pagesDir}${route.template}.html`);
            this.templateCache[routeKey] = html;

            // 4. Inject into container and update sidebar states
            this.container.html(html);
            this.updateSidebarVisuals(routeKey);

            // 5. Run setup (onEnter) hook for the newly active route
            if (route.onEnter) {
                route.onEnter();
            }

        } catch (error) {
            console.error(`Routing error loading template for ${routeKey}:`, error);
            this._renderError(error.message);
        }
    }

    /**
     * Render routing error panel and bind retry action
     */
    _renderError(message) {
        this.container.html(TEMPLATES.error(message));
        this.container.find('#retry-load-btn').on('click', () => this.resolve());
    }

    /**
     * Manage visual sidebar selections
     */
    updateSidebarVisuals(activePage) {
        $('aside nav a').each((index, element) => {
            const $link = $(element);
            const pageAttr = $link.data('page');
            const isSubLink = $link.parent().hasClass('submenu');
            const isActive = pageAttr === activePage;

            if (isSubLink) {
                if (isActive) {
                    $link.removeClass('text-gray-500 hover:text-gray-800')
                         .addClass('text-primary');
                } else {
                    $link.removeClass('text-primary')
                         .addClass('text-gray-500 hover:text-gray-800');
                }
                
                // If this is the active sub-link, expand its parent submenu
                if (isActive) {
                    const $submenu = $link.parent('.submenu');
                    if ($submenu.is(':hidden')) {
                        $submenu.slideDown(200);
                        const $parentLink = $submenu.prev('.parent-link');
                        $parentLink.find('.chevron-icon').addClass('rotate-180');
                    }
                }
            } else {
                const isParent = $link.hasClass('parent-link');
                const $submenu = isParent ? $link.next('.submenu') : $();
                const hasActiveChild = $submenu.length && $submenu.find(`[data-page="${activePage}"]`).length > 0;
                const isParentActive = isActive || hasActiveChild;

                if (isParentActive) {
                    $link.removeClass('text-gray-500 hover:text-gray-800 hover:bg-gray-50')
                         .addClass('text-primary bg-primary-light border-l-2 border-primary');
                } else {
                    $link.removeClass('text-primary bg-primary-light border-l-2 border-primary')
                         .addClass('text-gray-500 hover:text-gray-800 hover:bg-gray-50');
                }
                
                // If this is the active parent link or has an active child, expand its submenu
                if (isParentActive && isParent) {
                    if ($submenu.length && $submenu.is(':hidden')) {
                        $submenu.slideDown(200);
                        $link.find('.chevron-icon').addClass('rotate-180');
                    }
                }
            }
        });

        // Auto-collapse inactive submenus
        $('.submenu').each((index, element) => {
            const $submenu = $(element);
            const hasActiveChild = $submenu.find(`[data-page="${activePage}"]`).length > 0;
            const isParentActive = $submenu.prev(`.parent-link[data-page="${activePage}"]`).length > 0;

            if (!hasActiveChild && !isParentActive) {
                if ($submenu.is(':visible')) {
                    $submenu.slideUp(200);
                    $submenu.prev('.parent-link').find('.chevron-icon').removeClass('rotate-180');
                }
            }
        });
    }
}