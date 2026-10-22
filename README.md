# Regie

Eigener Twitch-Chat auf dem CORSAIR XENEON EDGE. Nur lesen, kein Schreiben. Links Quick Actions, Mitte der Chat in einer schmalen Spalte, rechts Stats und Aktivität.

## Einrichten

1. Auf [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) eine App anlegen. OAuth Redirect `http://localhost`. Client-Typ Public. Das Secret wird nicht gebraucht.
2. iCUE 5.47 oder neuer. Im Widget-Panel auf `+` und `regie.icuewidget` wählen.
3. In den Widget-Einstellungen die Client ID eintragen. Optional ein Raid-Ziel.
4. Auf dem Edge anmelden. Den Code auf twitch.tv/activate freigeben.

Das Token liegt im Widget-`localStorage`. Access Token läuft nach 4 Stunden ab und wird erneuert. Der Refresh Token ist einmalig und stirbt nach 30 Tagen ohne Nutzung, dann neu anmelden.

## Aktionen

Emote, Follower, Subs, Unique, Slow und Schild schalten den eigenen Chat. Werbung, Raid und Leeren brauchen einen zweiten Tipp. Raid abbrechen sitzt im Raid-Dialog.

Mod-Aktionen gelten nur für den eingeloggten Kanal. Subs-Zahl bleibt `—`, wenn der Account keine Affiliate-Rechte hat.

## Prüfen

`node --test tests/*.test.js`

Layout ohne Twitch: `widget/index.html?demo=1`
