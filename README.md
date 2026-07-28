# Seriva Web und Online-Reservierung

Diese Dateien gehören in das Repository `allendogan060.github.io`.

Enthalten sind:

- `index.html`: Seriva-Startseite sowie öffentliche Reservierung, Stornierung, Bewertung, Support und Rechtstexte
- `dashboard/`: Web-Anmeldung, Restaurant-Erstellung und rollenbasierter Seriva-Arbeitsbereich
- `assets/`: lokal ausgelieferte Bilddateien
- `.well-known/`: Vorbereitung für Universal Links

## Temporäre Entwicklungssperre

Die Website startet aktuell mit einer klar gekennzeichneten Entwicklungssperre.

Der Zugangs-PIN wird getrennt von den öffentlichen Repository-Dateien verwaltet.

Die Freigabe gilt nur für die aktuelle Browsersitzung. Zusätzlich enthält die
Seite `noindex`, `nofollow`, `noarchive` und `nosnippet`, damit Suchmaschinen sie
nicht in Suchergebnisse aufnehmen sollen.

Wichtig: GitHub Pages liefert statische und grundsätzlich öffentlich abrufbare
Dateien aus. Der PIN ist deshalb nur eine vorübergehende Zugangshürde und kein
serverseitiger Schutz. Keine vertraulichen Daten oder echten Kundendaten für
diese Entwicklungsvorschau verwenden.

Solange `DEVELOPMENT_MODE` aktiv ist, liegen auch Support, Veröffentlichungshilfe,
Impressum, Datenschutz, Nutzungsbedingungen und AGB hinter der PIN-Sperre.
Direkte Hash-Links öffnen das jeweilige Dokument erst nach erfolgreicher
PIN-Eingabe.

## Veröffentlichung

1. Alle Dateien und den Ordner `.well-known` aus diesem Ordner in die oberste
   Ebene des Repositorys laden.
   Der Ordner muss exakt `dashboard` heißen. GitHub Pages unterscheidet zwischen
   `dashboard` und `Dashboard`.
2. Unter `Settings > Pages` als Quelle `Deploy from a branch` auswählen.
3. Branch `main` und Ordner `/ (root)` auswählen.
4. In Supabase zuerst `online_booking_migration.sql` und danach
   `booking_availability_waitlist_migration.sql` sowie
   `reservation_confirmation_email_migration.sql` und
   `reservation_reviews_push_migration.sql` sowie
   `reservation_review_email_migration.sql` ausführen. Anschließend aus dem
   App-Projekt `Restaurant/supabase/web_dashboard_migration.sql`,
   `Restaurant/supabase/operational_routing_identity_migration.sql` und
   `Restaurant/supabase/device_access_management_migration.sql` ausführen.
5. In Seriva unter `Online-Reservierung` die Funktion aktivieren und speichern.

Das Dashboard ist anschließend unter
`https://allendogan060.github.io/dashboard/` erreichbar. Restaurantleitung,
Management, Service, Küche und Bar verwenden Restaurantkennung, ihren Namen
und ihr persönliches Passwort. Die Restaurantleitung kann Mitarbeiter,
individuelle Rechte und Gerätezugänge im Web-Dashboard verwalten. Geräte selbst
melden sich weiterhin ausschließlich in der nativen Seriva-App an.

Die Auftragsausgabe verwendet dieselben Begriffe wie die App:

- `Nur digitale Stationen`
- `Nur Bondruck`
- `Kombiniert`

Kassen und digitale Stationsdisplays besitzen eigene Gerätezugänge. Klassische
Bondrucker sind keine Benutzerkonten und erscheinen deshalb nicht als
Mitarbeiter oder Geräte-Login.

Die Restaurant-Erstellung ist zusätzlich im Web möglich. Der bestehende
Erstellungsablauf in der App bleibt während der Testphase erhalten, damit bei
einem Web- oder Hostingproblem kein Betrieb ausgesperrt wird.

Die Startadresse `https://allendogan060.github.io/` zeigt die Seriva-Startseite.
Ist im Browser bereits eine gültige Seriva-Websitzung gespeichert, wird direkt
zum Dashboard weitergeleitet. Ansonsten führen die Schaltflächen „Anmelden“ und
„Restaurant erstellen“ in den passenden Dashboard-Ablauf.

Vor einer öffentlichen Freigabe zusätzlich:

1. Alle gelb markierten Anbieterangaben in `index.html` ergänzen.
2. Datenschutz, Impressum, Nutzungsbedingungen und AGB rechtlich prüfen.
3. In `index.html` `DEVELOPMENT_MODE` auf `false` setzen.
4. Den Entwicklungs-PIN und dessen Hash entfernen.
5. Den Robots-Meta-Tag nur dann auf `index, follow` ändern, wenn die Seite
   tatsächlich von Suchmaschinen gefunden werden soll.
6. Support und Rechtstexte müssen für die echte Veröffentlichung öffentlich
   erreichbar sein. Die Bereiche `#support`, `#veroeffentlichung`,
   `#impressum`, `#datenschutz`, `#nutzungsbedingungen` und `#agb` dann ohne
   Entwicklungs-PIN testen.

Seriva erzeugt danach automatisch Links nach diesem Muster:

`https://allendogan060.github.io/?r=EINDEUTIGE-RESTAURANT-ID`

Nach einem abgeschlossenen Besuch kann der Gast über seine Reservierungsnummer
eine verifizierte Bewertung abgeben:

`https://allendogan060.github.io/?review=SVR-ABC123`

Für Universal Links muss in Apple Developer beim App Identifier
`com.oezguer.Restaurant` die Capability `Associated Domains` aktiviert sein.
Der spätere App-Clip-Identifier ist `com.oezguer.Restaurant.Clip`.

## Sicherheit und Daten

- Das Dashboard speichert niemals Passwörter im Browser oder im Restaurantstatus.
- Nur kurzlebige Supabase-Sitzungstoken werden lokal gehalten.
- Änderungen werden als erlaubte Teil-Patches mit Rollenprüfung und
  Konflikterkennung in Supabase gespeichert.
- Offline sind betriebliche Änderungen gesperrt; es entsteht kein zweiter
  lokaler Datenstand.
- Die Weboberfläche kassiert absichtlich noch nicht fiskalisch. Ein echtes
  deutsches Kassensystem benötigt vor der öffentlichen Nutzung unter anderem
  eine belastbare TSE-, DSFinV-K- und Belegarchitektur.
