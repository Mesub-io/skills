# A plan's token and its dollar value

Read this before a page of the app's own shows a plan's price or a payment: a pricing page, a checkout summary, a list of charges. The widget shows all of it by itself: with `SubscribeButton`, `useSubscribe` or the manage window there is nothing to write.

These fields may be newer than the installed `@mesub/node`. Check them in `node_modules/@mesub/node/dist/index.d.ts` before reading them, and say so if they are not there rather than casting around the types.

## What a plan carries

`mesub.plans.retrieve(slug)` and `mesub.plans.list()`, on the server:

| Field | What it says |
|---|---|
| `amount`, `decimals` | The price per period in the token's smallest unit, as a string, and the token's decimals |
| `amount_display` | That price as a person counts it: `"9.99"`. Print this, never a number computed from `amount` |
| `amount_usd` | That price in US dollars, a decimal string, or `null` when Mesub has no price for the token |
| `mint` | The token's address. This is the token: two tokens may share a symbol, never a mint |
| `symbol` | Set only for a token Mesub vouches for (USDC, USDT, PYUSD). `null` for every other |
| `token.symbol`, `token.name`, `token.logo_url` | What Mesub found for that exact mint. Each may be `null` |
| `token.verified` | `true` for a token Mesub vouches for, or one Jupiter marks as verified |

Mesub fills `token` itself from the mint. Nothing in it comes from the app, the merchant or the browser, so never send or override it.

## The rule: an unverified token is shown as unverified

**When `token.verified` is false, say so next to the symbol and keep the mint in view.** Why: a symbol is free text on chain. Anyone can create a token and call it USDC, and a fake under a known name is a common scam. The customer signs for the mint, not for the name.

- Mesub never answers an unverified token under the symbol or the name of a stablecoin it vouches for: that field comes `null`. Do not put the name back from the mint, a list of the app's own or a guess.
- Any other symbol or name of an unverified token is third-party text. Print it as text (never as HTML), and never let it decide anything: branch on `mint` and on the top-level `symbol`, not on `token.symbol`.
- `token.logo_url` is an address somebody else chose. Show it as an image only, and do not show it at all for an unverified token if the page has no way to say "unverified" beside it.
- A verified token still has its mint: a page that shows the short mint for every token is never wrong.

```ts
import type { Plan } from '@mesub/node';

// What to print beside the amount.
export function tokenLabel(plan: Plan): string {
    const { symbol, verified } = plan.token;
    const mint = `${plan.mint.slice(0, 4)}...${plan.mint.slice(-4)}`;

    if (!symbol) return mint;
    return verified ? symbol : `${symbol}, unverified (${mint})`;
}
```

So a price reads `9.99 USDC`, `30000 Bonk`, or `30000 MOON, unverified (Dez1...x9Qp)`.

## The dollar value

- **On a plan, `amount_usd` is an estimate.** It is the plan's amount at the latest price Mesub knows for the token, so it moves with the market for anything but a stablecoin. Print it as "about $0.45", beside the token amount and never instead of it: the customer is charged `amount` of the token, whatever it is worth that day.
- **On an attempt, `amount_usd` is the price at the charge.** `mesub.subscriptions.attempts(id)` answers it on each attempt: priced once, at the instant of the charge, and not rewritten. It is `null` until Mesub has priced it, which comes after the attempt is recorded: show the token amount alone meanwhile, not `$0`.
- Both are decimal strings (`"9.99"`) or `null`. Do not parse them into a float to add them up, and never compute a dollar value in the app from `amount`.
- `terms.message` is what the customer signs, and it is unchanged: show it as written, with no dollar line of the page's own inside it.

## What the docs say

The docs page [Subscribe from your server](https://docs.mesub.io/docs/subscribe) has the section this file is written from, and [Manage from your server](https://docs.mesub.io/docs/manage) the attempt's. If the installed types differ from this file, the types win.
