// NestJS: the controller Mesub posts events to, with handle-event.ts beside it.
// In main.ts, keep the raw body: NestFactory.create(AppModule, { rawBody: true }).
// Register it in a module, and leave it out of the app's global auth guard.
import {
    BadRequestException,
    Controller,
    HttpCode,
    Post,
    type RawBodyRequest,
    Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MesubError, verifyWebhook } from '@mesub/node';
import { type EventStore, receiveEvent } from './handle-event';

// ADAPT: the app's own store, see handle-event.ts. Inject a provider instead if the app has one.
const store: EventStore = {
    claim: async () => {
        throw new Error('Record the event id in the app\'s database here.');
    },
    release: async () => {},
};

// ADAPT: the path is the one registered in the dashboard. A global prefix applies to it.
@Controller('webhooks/mesub')
export class MesubWebhooksController {
    @Post()
    @HttpCode(200)
    async receive(@Req() req: RawBodyRequest<Request>): Promise<void> {
        if (!req.rawBody) throw new Error('No raw body: pass { rawBody: true } to NestFactory.create.');

        let event;
        try {
            // req.rawBody, never req.body: the signature is over the bytes as sent.
            event = await verifyWebhook(req.rawBody, req.headers);
        } catch (error) {
            if (error instanceof MesubError && error.code === 'invalid_webhook') {
                throw new BadRequestException();
            }
            throw error;
        }

        // A throw here answers 500, and Mesub sends the event again.
        await receiveEvent(event, store);
    }
}
