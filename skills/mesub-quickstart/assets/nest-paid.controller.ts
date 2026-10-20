// NestJS: one paid controller. The widget routes are mounted in main.ts with
// mesubRoutes from '@mesub/node/express', exactly as under Express.
import { type CanActivate, Controller, Get, Injectable, UseGuards } from '@nestjs/common';
import { MesubAccess, type MesubRequest, RequirePlan } from '@mesub/node/nest';
// ADAPT: the path of the app's one Mesub client, the one main.ts gives the widget routes too.
import { mesub } from './mesub-client';

// ADAPT: the shape the app's own auth guard leaves on the request.
interface AuthedRequest extends MesubRequest {
    user?: { id: string };
}

// ADAPT: replace with the app's own auth guard, the one that verifies the session and sets req.user.
// Until it is replaced this throws, so nobody is let in by mistake.
@Injectable()
class AppAuthGuard implements CanActivate {
    canActivate(): boolean {
        throw new Error("Use the app's own auth guard here.");
    }
}

@Controller('analytics')
// The app's own auth guard first, then RequirePlan: RequirePlan reads what the auth guard wrote.
@UseGuards(
    AppAuthGuard,
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
