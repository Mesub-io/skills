import type { Session } from './session';

export interface Report {
    id: string;
    title: string;
    revenue: number;
}

// What the app sells: made-up numbers, the same for everybody.
export function reportsFor(_session: Session): Report[] {
    return [
        { id: 'r_1', title: 'January', revenue: 12400 },
        { id: 'r_2', title: 'February', revenue: 13150 },
    ];
}
