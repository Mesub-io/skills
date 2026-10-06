// The routes the widget calls. The catch-all folder answers every path under /api/mesub.
import { mesubRouteHandlers } from '@mesub/node/next';
import { customer, mesub } from '@/lib/mesub';

export const { GET, POST } = mesubRouteHandlers({ client: mesub, customer });
