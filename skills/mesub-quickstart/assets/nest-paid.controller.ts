// NestJS: one paid controller. The widget routes are mounted in main.ts with
// mesubRoutes from '@mesub/node/express', exactly as under Express.
import { Controller, Get, UseGuards } from '@nestjs/common';
import { MesubAccess, type MesubRequest, RequirePlan } from '@mesub/node/nest';
// ADAPT: the path of the app's one Mesub client, the one main.ts gives the widget routes too.
import { mesub } from './mesub-client';

// ADAPT: the shape the app's own auth guard leaves on the request.
interface AuthedRequest extends MesubRequest {
    user?: { id: string };
}

@Controller('analytics')
// ADAPT: put the app's own auth guard first, then RequirePlan with the plan's slug.
// Order matters: RequirePlan reads what the auth guard wrote.
@UseGuards(
    RequirePlan<AuthedRequest>('pro', {
        client: mesub,
        customer: (req) => (req.user ? { external_id: req.user.id } : null),
    }),
)
export class AnalyticsController {
    @Get()
    list(@MesubAccess() mesub: MesubAccess) {
        return { plan: mesub.plan, customer: mesub.customer };
    }
}
