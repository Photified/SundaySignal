# Sunday Signal: weekly player props update

Unzip this package and upload its contents into the root of your existing SundaySignal repository, replacing matching files. Preserve scripts, data and tests folders. Commit the upload and let the existing GitHub Actions deployment finish. The .github workflow and existing icons need no changes. This package includes the previous consensus and eight-publisher changes, so it works whether or not you uploaded v3.

## Player props

Props has its own tab, with passing, rushing, receiving/receptions, touchdowns and other categories. Individual published expert props appear without requiring two experts to agree. Agreement badges still appear when multiple tracked analysts support the same player, market and line. Different thresholds, first touchdowns and anytime touchdowns stay separate. Publisher follow preferences apply.

The updated Sportsbook Review adapter discovers the current weekly player-prop article from its NFL index. It reads the explicitly selected player, prop and quoted price from the publisher's pick table. Sports Betting Dime, BettingPros and RotoWire continue to contribute their explicitly labeled props.

Player-only picks are matched against ESPN roster data rather than a hardcoded player/team list. Rosters refresh daily, partial roster responses retry the next hourly run, and article weeks must match game weeks. Ambiguous player names remain unverified. Upcoming requires a future kickoff; Recent retains earlier and unverified picks.

## Weekly operation

Your existing hourly GitHub Actions job discovers new weekly articles, collects published props, refreshes schedule data and deploys the new edition. There are no hardcoded article weeks or years. The app checks the published edition every five minutes while open. Publishers may release their selections later in the week, and GitHub can delay scheduled runs.

Public page layout or feed changes can require future parser maintenance. This is automatic weekly collection, not a guarantee that every publisher supplies every game or that public sources never change. There are no paid feeds or sportsbook API keys.

## Verification

Packaging-time data includes 31 prop selections, with nine matched to upcoming games. Counts change as sources publish and games begin. 22 Python tests pass, including a Week 7 discovery check, player matching, ambiguity and exact prices. JavaScript checks pass for Props filtering, consensus, odds, follow preferences and app loading. Visual browser/device QA was unavailable.
