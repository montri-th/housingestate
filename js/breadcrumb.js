/**
 * Breadcrumb — ประเทศไทย › จังหวัด › เขต/อำเภอ, then the project the reader is inside — the CityMETER production
 * hierarchy, through the shared shell (js/shell/breadcrumb.js, citymeter-shell). The province and the district are the
 * production boundaries each DOL record is counted in (the measure's finest area); every administrative crumb carries
 * the production deep link of the estate layer. A project is the last crumb without a production link
 * (demo-platform-review §5.3 rule 4); a developer, a DOL record, a station or a building is the panel heading, never a
 * crumb.
 */
import {provinceByCode, PRODUCTION_DATASET} from './model.js';
import {areaWord} from './areas.js';
import {buildBreadcrumb as shellBreadcrumb, renderBreadcrumb, breadcrumbText, deepestHref} from './shell/breadcrumb.js';

/** Production dataset code (`?d=`): the estate layer of CityMETER production, which reads the same records. */
export const DATASET = PRODUCTION_DATASET;

/** Pure model. province = production code or ''; area = district record {id, name, province} or null; site = {id, name, province} or null. */
export const buildBreadcrumb = (sel = {}) => shellBreadcrumb(sel, {dataset: DATASET, provinceByCode, areaWord});
export {renderBreadcrumb, breadcrumbText};

/** Production deep link of the deepest administrative crumb (for “ดูใน CityMETER”). */
export const productionHref = crumbs => deepestHref(crumbs, DATASET);
