# Election night 2026

A Claude Code mod for the November 3, 2026 US general election. It opens a side pane that shows the balance of power in the House, Senate and governorships, with a spotlight on Kansas, and refreshes every 3 minutes.

- **House, Senate, Governors:** called seats (solid) and races where a party is ahead but not yet called (shaded). Senate and governor totals include the seats not on the ballot this year.
- **Kansas:** Governor and KS-3 in full, plus US Senate, KS-1, KS-2 and KS-4. A ✓ appears only once a race is called.
- **Toasts** when a Kansas race is called or a party clinches the House or Senate.
- **Temporary:** it stops updating after 7:00 pm Central on November 4, 2026.

Results come from CNN's public results feed, which is undocumented and may change without notice. Race calls are CNN's. Times are shown in Central time.

## Install

At the prompt of a terminal session:

```
/plugin install election-night --marketplace jason-scott-adams/election-night-2026
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install election-night --marketplace jason-scott-adams/election-night-2026
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `jason-scott-adams/election-night-2026`, then Add plugin.

## Use

The pane opens by itself in a wide terminal (144 columns or more). Type `/election` to open it at any width and refresh right away.
