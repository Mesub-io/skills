# Theming the widget

## The stylesheet

```ts
import '@mesub/react/styles.css';
```

It styles the widget only, through `data-mesub-*` attributes. There are no class names, so nothing of the app's CSS collides with it and a selector on a class will never match.

## Brand it with custom properties

The stylesheet reads `--mesub-*` properties and never sets one, so a value the app sets always wins, whatever the selector. Set them on `:root`, or on a wrapper to brand one area. `assets/mesub-theme.css` is ready to copy.

| Property | What it colours |
|---|---|
| `--mesub-accent` | Actions, the current state, the focus ring |
| `--mesub-on-accent` | Text on the accent |
| `--mesub-bg` | The window and the list rows |
| `--mesub-text` | Titles. The muted tones and the borders derive from it |
| `--mesub-font` | The font. Inherits the page's by default |
| `--mesub-radius` | Buttons. The window is a little rounder |

The docs page names five of them (all but `--mesub-on-accent`). The installed stylesheet lists more in its header comment (borders, danger, success, shadow, duration and others): read `node_modules/@mesub/react/styles.css` before using one that is not in this table.

## Dark mode

- `<MesubProvider theme="dark">` sets `data-mesub-theme="dark"` on the widget. `theme="auto"` follows the system setting, `theme="light"` forces light.
- Without the prop, the widget inherits `data-mesub-theme` from any ancestor, `<html>` for instance. With neither, it is light.
- `auto` is opt-in on purpose: the widget should match the app's page, not the visitor's system.
- A `--mesub-bg` or `--mesub-text` set on `:root` also wins in dark mode. An app with both modes scopes its values: `[data-mesub-theme="dark"] { --mesub-bg: ... }`.

## Layout it does by itself

Under 480px the window is a bottom sheet. Motion follows `prefers-reduced-motion`. The window is a native `<dialog>`.

## Styling everything yourself

Leave the stylesheet out and style the attributes. The ones that carry state:

| Attribute | On | Values |
|---|---|---|
| `data-mesub-subscribe`, `data-mesub-state` | The subscribe button | `idle`, `open`, `signing`, `confirming`, `subscribed` |
| `data-mesub-receipt` | The line after the button once subscribed | |
| `data-mesub-manage-button` | The manage button | |
| `data-mesub-dialog`, `data-mesub-step` | The window | `plan`, `wallet`, `review`, `approve`, `confirming`, `subscribed` when subscribing; `confirm`, `wallet`, `approve`, `confirming`, `done` when managing |
| `data-mesub-subscriptions`, `data-mesub-state` | The list's root | `loading`, `ready`, `signed-out`, `error` |
| `data-mesub-subscription` | One row, with the subscription's id | |
| `data-mesub-status` | A row's status | The status, or `paused` |
| `data-mesub-action` | A row's button | `cancel`, `resume`, `close` |

These are the markup of the installed version, not a promise across versions: after an upgrade, check a hand-made stylesheet against the header of the package's own.

Do not restyle the wording or hide a screen (the review, the terms, "Nothing was charged"). They are what the customer agrees to.
