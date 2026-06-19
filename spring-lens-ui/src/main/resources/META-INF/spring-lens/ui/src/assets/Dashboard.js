import { TEMPLATES, BEAN_TYPE_RULES, SCOPE_COLORS, ROLE_COLORS, SCOPE_STYLES, DEFAULT_SCOPE_STYLE, DEPENDENCY_CATEGORY_COLORS } from './constants.js';
import { getBeanCategory, nodeStyle } from './utils.js';
import { BeanTreeBuilder } from './DataLoader.js';

/**
 * Controller class for the Beans Definitions dashboard tab.
 * Renders list tables, processes filters, aggregates bean metrics via Chart.js,
 * and manages detail sidebar selection.
 */
export default class Dashboard {
    /**
     * @param {DataLoader} dataLoader - Shared data service instance.
     */
    constructor(dataLoader) {
        this.dataLoader = dataLoader;
        this.charts = {
            scopeChart: null,
            roleChart: null
        };
        
        // State variables
        this.beans = [];
        this.filteredBeans = [];
        this.searchQuery = '';
        
        this.filters = {
            scope: '',
            role: '',
            primary: '',
            lazy: ''
        };

        this.currentPage = 1;
        this.pageSize = 10;
        this.selectedBeanName = null;
        this.activeTab = 'properties'; // 'properties' | 'dependencies' | 'dependents'
    }

    /**
     * Initializes the view by loading live bean definitions, setting up metrics,
     * building charts, applying filters, and registering event handlers.
     */
    async enter() {
        try {
            await this.dataLoader.load();
            if (window.allBeansMap) {
                this.beans = Array.from(window.allBeansMap.values());
            } else {
                this.beans = [];
            }

            this.initFilterDropdowns();
            this.updateKPIs();
            this.initCharts();
            this.applyFiltersAndRender();
            this.initEvents();

            // Select the first bean as default details if available
            if (this.beans.length > 0) {
                this.selectBean(this.beans[0].beanName);
            }
        } catch (error) {
            console.error('Error in Dashboard enter:', error);
        }
    }

    /**
     * Handles cleaning up charts when transitioning away from the dashboard.
     */
    leave() {
        this.cleanupCharts();
    }

    /**
     * Populates filter dropdowns with unique options aggregated from the live dataset.
     */
    initFilterDropdowns() {
        const scopes = new Set();
        const roles = new Set();
        
        this.beans.forEach(bean => {
            if (bean.scope) scopes.add(bean.scope);
            if (bean.role) roles.add(bean.role);
        });

        this._populateDropdown(
            $('#def-filter-scope'),
            scopes,
            'Scope: All',
            scope => this._capitalize(scope)
        );

        this._populateDropdown(
            $('#def-filter-role'),
            roles,
            'Role: All',
            role => this._capitalize(role.replace(/^ROLE_/, ''))
        );

        // Sync dropdown selectors with active filter state
        $('#def-filter-scope').val(this.filters.scope);
        $('#def-filter-role').val(this.filters.role);
        $('#def-filter-primary').val(this.filters.primary);
        $('#def-filter-lazy').val(this.filters.lazy);
        $('#def-filter-size').val(this.pageSize);
        $('#def-search-input').val(this.searchQuery);
    }

    /**
     * Helper to populate a select dropdown with unique, sorted, and formatted options.
     * @private
     */
    _populateDropdown($select, values, defaultText, formatter) {
        $select.html(`<option value="">${defaultText}</option>`);
        Array.from(values).sort().forEach(val => {
            $select.append(`<option value="${val}">${formatter(val)}</option>`);
        });
    }

    /**
     * Computes and updates metrics cards (total counts, context distributions, lazy percentage).
     */
    updateKPIs() {
        if (this.beans.length === 0) return;

        this._updateTotalCountKPI();
        this._updateContextDistributionKPI();
        this._updateLazyInitKPI();
    }

    /**
     * Updates the total bean count metric.
     * @private
     */
    _updateTotalCountKPI() {
        $('#def-total-count').text(this.beans.length.toLocaleString());
    }

    /**
     * Computes and updates context distribution stats and progress bars.
     * @private
     */
    _updateContextDistributionKPI() {
        const contexts = {};
        this.beans.forEach(b => {
            const ctxId = b.contextId || 'unknown';
            contexts[ctxId] = (contexts[ctxId] || 0) + 1;
        });

        const contextEntries = Object.entries(contexts).sort((a, b) => b[1] - a[1]);
        $('#def-context-count').text(`${contextEntries.length} Total`);

        const colors = ['bg-primary', 'bg-blue-500', 'bg-success'];
        const contextListHtml = contextEntries.map(([ctxId, count], idx) => {
            const pct = Math.round((count / this.beans.length) * 100);
            const colorClass = colors[idx] || 'bg-gray-400';
            return TEMPLATES.contextListItem({ ctxId, colorClass, pct });
        }).join('');
        $('#def-context-list').html(contextListHtml);
    }

    /**
     * Computes and updates lazy initialization percentage and progress bar.
     * @private
     */
    _updateLazyInitKPI() {
        const lazyCount = this.beans.filter(b => b.lazyInit).length;
        const lazyPct = Math.round((lazyCount / this.beans.length) * 100);
        $('#def-lazy-percent').text(`${lazyPct}%`);
        $('#def-lazy-bar').css('width', `${lazyPct}%`);
    }

    /**
     * Initializes scope and role distribution charts with live computed frequencies.
     */
    initCharts() {
        this.cleanupCharts();
        if (this.beans.length === 0) return;

        // 1. Scope distribution
        this._initDistributionChart(
            'scopeChart',
            'scopeChart',
            '#def-scope-legend',
            bean => this._capitalize(bean.scope || 'unknown'),
            SCOPE_COLORS,
            '#a855f7'
        );

        // 2. Role distribution
        this._initDistributionChart(
            'roleChart',
            'roleChart',
            '#def-role-legend',
            bean => this._capitalize((bean.role || 'unknown').replace(/^ROLE_/, '')),
            ROLE_COLORS,
            '#cbd5e1'
        );
    }

    /**
     * Helper to initialize a distribution chart and its corresponding HTML legend.
     * @private
     */
    _initDistributionChart(chartKey, canvasId, legendId, valueExtractor, colorsConfig, defaultColor) {
        const counts = {};
        this.beans.forEach(bean => {
            const rawVal = valueExtractor(bean) || 'unknown';
            counts[rawVal] = (counts[rawVal] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const data = Object.values(counts);
        const bgColors = labels.map(lbl => colorsConfig[lbl] || defaultColor);

        const legendHtml = labels.map((lbl, idx) => {
            const count = data[idx];
            const pctStr = this._formatPercentage(count, this.beans.length);
            const color = bgColors[idx];
            return TEMPLATES.chartLegendItem({ color, lbl, count, pctStr });
        }).join('');
        $(legendId).html(legendHtml);

        this.charts[chartKey] = this._createDoughnutChart(
            canvasId,
            labels,
            data,
            bgColors
        );
    }

    /**
     * Formats count into a percentage string relative to total.
     * Special formatting ranges: < 1% for values between 0% and 1%, > 99% for values between 99% and 100%.
     * @private
     */
    _formatPercentage(count, total) {
        if (!total) return '0%';
        const pctVal = (count / total) * 100;
        if (pctVal > 0 && pctVal < 1) {
            return '< 1%';
        } else if (pctVal > 99 && pctVal < 100) {
            return '> 99%';
        } else {
            return Math.round(pctVal) + '%';
        }
    }

    /**
     * Capitalizes the first letter of a string and converts the rest to lowercase.
     * @private
     */
    _capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    /**
     * Helper to instantiate a pre-styled doughnut chart on a target canvas.
     * @private
     */
    _createDoughnutChart(canvasId, labels, data, colors) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                cutout: '70%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                }
            }
        });
    }

    /**
     * Filters the raw beans using search queries and select values, then renders.
     */
    applyFiltersAndRender() {
        this.filteredBeans = this.beans.filter(bean => this._matchesFilters(bean));
        this._adjustCurrentPageBounds();
        this.renderTable();
        this.renderPagination();
    }

    /**
     * Checks if a bean matches the active search query and dropdown filters.
     * @private
     */
    _matchesFilters(bean) {
        // Search text
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            const searchableFields = [bean.beanName, bean.type, bean.contextId];
            const hasMatch = searchableFields.some(field => 
                (field || '').toLowerCase().includes(query)
            );
            if (!hasMatch) {
                return false;
            }
        }

        // Dropdown filter validation
        const matchesScope = !this.filters.scope || bean.scope === this.filters.scope;
        const matchesRole = !this.filters.role || bean.role === this.filters.role;
        const matchesPrimary = this.filters.primary === '' || bean.primary === (this.filters.primary === 'true');
        const matchesLazy = this.filters.lazy === '' || bean.lazyInit === (this.filters.lazy === 'true');

        return matchesScope && matchesRole && matchesPrimary && matchesLazy;
    }

    /**
     * Adjusts the current page pointer to be within valid limits of filtered results.
     * @private
     */
    _adjustCurrentPageBounds() {
        const maxPage = Math.max(1, Math.ceil(this.filteredBeans.length / this.pageSize));
        if (this.currentPage > maxPage) {
            this.currentPage = maxPage;
        }
    }

    /**
     * Resolves matching semantic metadata (icon & color) based on bean identifier text.
     * @private
     * @param {Object} bean - The bean definition object.
     * @returns {{icon: string, color: string}}
     */
    _resolveBeanMetadata(bean) {
        const name = (bean.beanName || '').toLowerCase();
        const type = (bean.type || '').toLowerCase();

        const rule = BEAN_TYPE_RULES.find(r =>
            r.keywords.some(keyword => name.includes(keyword) || type.includes(keyword))
        );

        if (rule) {
            return { icon: rule.icon, color: rule.color };
        }

        const style = nodeStyle({ fullName: bean.beanName, meta: { type: bean.type } });
        return {
            icon: 'extension',
            color: style.stroke || '#6b46c1'
        };
    }

    /**
     * Resolves matching semantic icons based on bean identifier text.
     */
    getBeanIcon(bean) {
        return this._resolveBeanMetadata(bean).icon;
    }

    getBeanColor(bean) {
        return this._resolveBeanMetadata(bean).color;
    }

    /**
     * Renders the bean definitions list table for the current page.
     */
    renderTable() {
        const $tbody = $('#beanTableBody');
        if ($tbody.length === 0) return;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, this.filteredBeans.length);
        const pageBeans = this.filteredBeans.slice(startIndex, endIndex);

        if (pageBeans.length === 0) {
            $tbody.html(`
                <tr>
                    <td colspan="8" class="px-5 py-8 text-center text-gray-400">
                        No beans found matching the active filters or search query.
                    </td>
                </tr>
            `);
            return;
        }

        const rowsHtml = pageBeans.map(bean => {
            const displayName = BeanTreeBuilder._displayName(bean.beanName);
            
            const cleanRole = (bean.role || '').replace(/^ROLE_/, '');
            const displayRole = cleanRole ? this._capitalize(cleanRole) : 'N/A';
            const displayScope = bean.scope ? this._capitalize(bean.scope) : 'N/A';

            const scopeLower = (bean.scope || '').toLowerCase();
            const scopeStyle = SCOPE_STYLES[scopeLower] || DEFAULT_SCOPE_STYLE;

            const primaryIcon = bean.primary ? TEMPLATES.checkCircle : TEMPLATES.uncheckedCircle;
            const lazyIcon = bean.lazyInit ? TEMPLATES.checkCircle : TEMPLATES.uncheckedCircle;
            const icon = this.getBeanIcon(bean);
            const color = this.getBeanColor(bean);

            const isSelected = this.selectedBeanName === bean.beanName;
            const activeRowClass = isSelected ? 'bg-primary-light/40 border-l-2 border-primary font-medium' : '';

            return TEMPLATES.dashboardRow({
                activeRowClass,
                beanName: bean.beanName,
                color,
                icon,
                displayName,
                type: bean.type,
                scopeStyle,
                displayScope,
                displayRole,
                primaryIcon,
                lazyIcon,
                contextId: bean.contextId
            });
        });

        $tbody.html(rowsHtml.join(''));
    }

    /**
     * Renders dynamic pagination navigation controls.
     */
    renderPagination() {
        const total = this.filteredBeans.length;
        const startIndex = total === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(startIndex + this.pageSize - 1, total);
        
        $('#def-pagination-info').text(`Showing ${startIndex} to ${endIndex} of ${total.toLocaleString()} beans`);

        const $buttons = $('#def-pagination-buttons');
        if ($buttons.length === 0) return;

        const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
        const buttonsHtml = [];

        buttonsHtml.push(TEMPLATES.paginationPrevBtn({ isDisabled: this.currentPage === 1 }));

        const range = this._getPaginationRange(this.currentPage, totalPages);
        range.forEach(p => {
            if (p === '...') {
                buttonsHtml.push(TEMPLATES.paginationEllipsis);
            } else {
                buttonsHtml.push(TEMPLATES.paginationPageBtn({ page: p, isActive: p === this.currentPage }));
            }
        });

        buttonsHtml.push(TEMPLATES.paginationNextBtn({ isDisabled: this.currentPage === totalPages }));

        $buttons.html(buttonsHtml.join(''));
    }

    /**
     * Helper to compute the numeric pages and ellipses range array for pagination.
     * @private
     */
    _getPaginationRange(currentPage, totalPages) {
        const delta = 2;
        const range = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                range.push(i);
            } else if (range[range.length - 1] !== '...') {
                range.push('...');
            }
        }
        return range;
    }

    selectBean(beanName) {
        this.selectedBeanName = beanName;
        
        $('.bean-row').removeClass('bg-primary-light/40 border-l-2 border-primary font-medium');
        $(`.bean-row[data-bean-name="${beanName}"]`).addClass('bg-primary-light/40 border-l-2 border-primary font-medium');

        const bean = this.beans.find(b => b.beanName === beanName);
        if (!bean) return;

        $('#def-details-sidebar').show();

        this._updateSidebarDetails(bean);
        this._updateSidebarLists(bean);

        this.renderActiveTab();
    }

    /**
     * Updates the text properties and factory/init info in the details sidebar.
     * @private
     */
    _updateSidebarDetails(bean) {
        const displayName = BeanTreeBuilder._displayName(bean.beanName);
        $('#def-sidebar-name').text(displayName);
        $('#def-sidebar-type').text(bean.type || 'N/A').attr('title', bean.type || '');
        
        const icon = this.getBeanIcon(bean);
        const color = this.getBeanColor(bean);
        $('#def-sidebar-icon').text(icon);

        $('#def-sidebar-icon-container')
            .css({
                'background-color': `${color}10`,
                'color': color,
                'border-color': `${color}33`
            });

        const displayScope = bean.scope ? this._capitalize(bean.scope) : 'N/A';
        const cleanRole = (bean.role || '').replace(/^ROLE_/, '');
        const displayRole = cleanRole ? this._capitalize(cleanRole) : 'N/A';

        $('#def-sidebar-scope').text(displayScope);
        $('#def-sidebar-role').text(displayRole);

        $('#def-sidebar-prop-primary').text(bean.primary ? 'TRUE' : 'FALSE');
        $('#def-sidebar-prop-lazy').text(bean.lazyInit ? 'TRUE' : 'FALSE');
        $('#def-sidebar-prop-autowired').text(bean.autowireCandidate ? 'TRUE' : 'FALSE');
        $('#def-sidebar-prop-context').text(bean.contextId || 'N/A');

        $('#def-sidebar-factory-bean').text(bean.factoryBeanName || '-');
        $('#def-sidebar-factory-method').text(bean.factoryMethodName || '-');

        $('#def-sidebar-init-method').text(bean.initMethodName || '-');
        $('#def-sidebar-destroy-method').text(bean.destroyMethodName || '-');
    }

    /**
     * Renders dependency and dependent lists in the details sidebar.
     * @private
     */
    _updateSidebarLists(bean) {
        const deps = bean.dependencies || [];
        const dependents = bean.dependents || [];
        
        $('#def-sidebar-deps-count').text(deps.length);
        $('#def-sidebar-dependents-count').text(dependents.length);

        const buildListHtml = (names) => {
            if (names.length === 0) {
                return TEMPLATES.sidebarEmptyList;
            }

            return names.map(depName => {
                const depRecord = window.allBeansMap?.get(depName);
                const dispName = BeanTreeBuilder._displayName(depName);

                let catColor = 'blue';
                if (depRecord) {
                    const cat = getBeanCategory({ fullName: depName, meta: { type: depRecord.type } });
                    catColor = DEPENDENCY_CATEGORY_COLORS[cat] || 'blue';
                }

                return TEMPLATES.sidebarListItem({ depName, dispName, catColor });
            }).join('');
        };

        $('#def-sidebar-deps-list').html(buildListHtml(deps));
        $('#def-sidebar-dependents-list').html(buildListHtml(dependents));
    }

    /**
     * Refreshes the display of the active tab pane in the details sidebar.
     */
    renderActiveTab() {
        $('#def-sidebar-tabs button').removeClass('text-primary border-b-2 border-primary font-bold').addClass('text-gray-500 hover:text-gray-700 font-medium');
        $(`#def-tab-${this.activeTab}`).removeClass('text-gray-500 hover:text-gray-700 font-medium').addClass('text-primary border-b-2 border-primary font-bold');

        $('.tab-pane').addClass('hidden');
        $(`#def-pane-${this.activeTab}`).removeClass('hidden');
    }
    /**
     * Binds all interactivity handlers for filters, searching, sidebar operations, and pagination.
     */
    initEvents() {
        this._bindFilterEvents();
        this._bindTableAndPaginationEvents();
        this._bindSidebarEvents();
    }

    /**
     * Binds input search, reset, and dropdown filters.
     * @private
     */
    _bindFilterEvents() {
        // Search
        $('#def-search-input').off('input').on('input', (e) => {
            this.searchQuery = $(e.target).val();
            this.currentPage = 1;
            this.applyFiltersAndRender();
        });

        // Dropdown Filters (Scope, Role, Primary, Lazy)
        const filterMappings = [
            { selector: '#def-filter-scope', key: 'scope' },
            { selector: '#def-filter-role', key: 'role' },
            { selector: '#def-filter-primary', key: 'primary' },
            { selector: '#def-filter-lazy', key: 'lazy' }
        ];

        filterMappings.forEach(({ selector, key }) => {
            $(selector).off('change').on('change', (e) => {
                this.filters[key] = $(e.target).val();
                this.currentPage = 1;
                this.applyFiltersAndRender();
            });
        });

        // Dropdown Page Size Filter
        $('#def-filter-size').off('change').on('change', (e) => {
            this.pageSize = parseInt($(e.target).val()) || 10;
            this.currentPage = 1;
            this.applyFiltersAndRender();
        });

        // Clear filter settings
        $('#def-btn-reset-filters').off('click').on('click', () => {
            this.searchQuery = '';
            this.filters = { scope: '', role: '', primary: '', lazy: '' };
            this.pageSize = 10;
            this.currentPage = 1;
            this.initFilterDropdowns();
            this.applyFiltersAndRender();
        });
    }

    /**
     * Binds table selection rows and pagination chevrons/number button events.
     * @private
     */
    _bindTableAndPaginationEvents() {
        // Table clicks
        $('#beanTableBody').off('click', '.bean-row').on('click', '.bean-row', (e) => {
            const beanName = $(e.currentTarget).data('bean-name');
            if (beanName) {
                this.selectBean(beanName);
            }
        });

        // Pagination buttons
        $('#def-pagination-buttons').off('click', '.btn-page').on('click', '.btn-page', (e) => {
            const page = parseInt($(e.currentTarget).data('page'));
            if (!isNaN(page)) {
                this.currentPage = page;
                this.renderTable();
                this.renderPagination();
            }
        });

        $('#def-pagination-buttons').off('click', '.btn-prev').on('click', '.btn-prev', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderTable();
                this.renderPagination();
            }
        });

        $('#def-pagination-buttons').off('click', '.btn-next').on('click', '.btn-next', () => {
            const totalPages = Math.ceil(this.filteredBeans.length / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderTable();
                this.renderPagination();
            }
        });
    }

    /**
     * Binds close buttons, tabs switches, list-item clicks, and redirection buttons in sidebar details pane.
     * @private
     */
    _bindSidebarEvents() {
        // Sidebar close
        $('#def-close-sidebar').off('click').on('click', () => {
            $('#def-details-sidebar').hide();
            this.selectedBeanName = null;
            $('.bean-row').removeClass('bg-primary-light/40 border-l-2 border-primary font-medium');
        });

        // Sidebar tabs
        $('#def-sidebar-tabs').off('click', '.tab-btn').on('click', '.tab-btn', (e) => {
            this.activeTab = $(e.currentTarget).data('tab');
            this.renderActiveTab();
        });

        // Click list link in details pane
        $('#def-sidebar-content').off('click', '.def-sidebar-item-click').on('click', '.def-sidebar-item-click', (e) => {
            const depName = $(e.currentTarget).data('fullname');
            if (depName && window.allBeansMap?.has(depName)) {
                this.selectBean(depName);
            }
        });

        // Complete graph redirect hook
        $('#def-view-graph-btn').off('click').on('click', () => {
            if (this.selectedBeanName) {
                window.focusBeanOnNextGraphEnter = this.selectedBeanName;
                window.location.hash = '#/graph';
            }
        });
    }

    /**
     * Destroys existing charts to avoid memory leaks or canvas drawing conflicts.
     */
    cleanupCharts() {
        for (const [key, chart] of Object.entries(this.charts)) {
            if (chart) {
                chart.destroy();
                this.charts[key] = null;
            }
        }
    }
}