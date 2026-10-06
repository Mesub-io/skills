# What goes wrong on a first run

| What is seen | What it means | What to do |
|---|---|---|
| The server throws "Missing Mesub API key" on start | `MESUB_API_KEY` is not in that process's environment | Check the env file is the one the framework loads, and that the server was restarted |
| A paid route or the plan read answers 500, or under Express 401 for everybody, signed in or not | Mesub refused the key (wrong, rotated, or another project's) | The user checks the key in the dashboard. Under Express, add an error handler that answers 500 for a `MesubError`: a 401 reads to the widget as "Sign in first" |
| The window opens on an error instead of the plan, the plan read is 404 | `endpoint` is not the mount path, or the slug is not a plan of this project | Compare the two paths, then the slug with the dashboard |
| The window says "Sign in first" | The routes answer 401: `customer` returned `null` | The session is not reaching the route: cookie, middleware order, or a cross-origin call without credentials |
| A subscriber is refused on the paid route (402) | The paid route names the customer differently from the widget routes | Use one `customer` function for both |
| No wallet is offered | No wallet extension is installed in that browser | Nothing to fix in code |

Past these, the failure belongs to another skill: see `kit-directory.md` in this folder.
