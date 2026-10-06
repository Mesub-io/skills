import type { User } from './session.js';

export interface Report {
    id: string;
    title: string;
    revenue: number;
}

// What the app sells: made-up numbers, the same for everybody.
export function reportsFor(_user: User): Report[] {
    return [
        { id: 'r_1', title: 'January', revenue: 12400 },
        { id: 'r_2', title: 'February', revenue: 13150 },
    ];
}
