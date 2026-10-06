import { reportsFor } from './reports.js';
import type { User } from './session.js';

// The paid feature: the reports as CSV.
export function exportFor(user: User): string {
    const rows = reportsFor(user).map((report) => `${report.id},${report.title},${report.revenue}`);
    return ['id,title,revenue', ...rows].join('\n');
}
