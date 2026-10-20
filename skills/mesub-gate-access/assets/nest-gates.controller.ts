// NestJS: paid controllers, with several plans and a refusal of your own.
import { type CanActivate, Controller, Get, HttpException, Injectable, UseGuards } from '@nestjs/common';
import { type Denial, MesubAccess, type MesubRequest, RequirePlan } from '@mesub/node/nest';
// ADAPT: the path of the app's one Mesub client (assets/mesub-client.ts).
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

const customer = (req: AuthedRequest) => (req.user ? { external_id: req.user.id } : null);

// In Nest, `onDenied` answers by throwing. Throw only for the refusals you reword:
// returning keeps the default one, and the default 503 is the one that carries Retry-After.
function denied(denial: Denial): void {
    if (denial.reason !== 'no_access') return;
    throw new HttpException(
        { message: 'This needs the Pro or the Team plan.', status: denial.answer?.status ?? null },
        denial.status,
    );
}

@Controller('reports')
// The app's own auth guard first, then RequirePlan: RequirePlan reads what the auth guard wrote.
@UseGuards(
    AppAuthGuard,
    // ADAPT: the plans' slugs, three at most.
    RequirePlan<AuthedRequest>(['pro', 'team'], { client: mesub, customer, onDenied: denied }),
)
export class ReportsController {
    @Get()
    list(@MesubAccess() access: MesubAccess) {
        // `access.plan` is the plan that let the request through.
        return { plan: access.plan, customer: access.customer, stale: access.stale };
    }
}
