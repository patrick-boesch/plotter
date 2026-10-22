# One Line — Bild zu Plotterpfad

Ein kleines JavaScript-Studio für durchgehende Kritzelporträts, inspiriert von einer Plotter-Video-Referenz. Dunkle Bildbereiche bekommen viele überlagerte Linien; helle bleiben weitgehend frei. Ein Bild ergibt **einen offenen, zusammenhängenden SVG-Pfad** mit einem Startpunkt und ohne Stiftabheben dazwischen.

## Start

Node.js ab Version 18, keine Pakete installieren:

```sh
npm start
```

Dann **http://localhost:4173** öffnen. Alternativ den Ordner auf einem statischen Webserver bereitstellen. Wegen ES-Modulen und Web Worker nicht per `file://` öffnen. Kein Build und keine GitHub Actions nötig.

## Bedienung

1. Eine im Browser erzeugte Lichtstudie wird automatisch als Demo berechnet. Das eigene Porträt per Dateiauswahl oder Drag-and-drop laden (z. B. JPG, PNG, WebP; abhängig von den Bildformaten des Browsers, bis 30 MB). „Demo“ lädt erneut die Lichtstudie.
2. **Schwarzpunkt**: Helligkeiten darunter werden maximal dunkel. **Weißpunkt**: Helligkeiten darüber bekommen keine zusätzliche Schraffur. Zwischen den Punkten werden Graustufen in Liniendichte umgesetzt. Für einen harten binären Schwellenwert die Voreinstellung „Schwellenwert“ verwenden; Schwarz-/Weißpunkt auf benachbarte Werte setzen, um die Grenze zu verschieben.
3. **Mitteltöne**: Größere Werte lassen mittlere Tonwerte heller erscheinen. **Liniendichte** steuert die Menge an gezeichneter Linie. **Schwung** steuert die Länge der einzelnen Bewegungen. **Detailgrad** verändert die interne Bildauflösung.
4. **Motivbreite**, **Stiftbreite** und **Papierrand** in Millimetern einstellen. Die Motivhöhe folgt dem Seitenverhältnis des heruntergerechneten Bildes. Papierformat und tatsächliche Pfadlänge erscheinen unter der Vorschau.
5. Zwischen **Pfad**, **Tonwerten** und **Original** wechseln. Mit +/− vergrößern, die vergrößerte Vorschau scrollen und mit der Prozentanzeige wieder einpassen. „Andere Linienführung“ erzeugt eine neue deterministische Variante.
6. **SVG herunterladen** und in die Plottersoftware importieren. Der Export enthält ausschließlich einen schwarzen, ungefüllten Pfad; keine eingebettete Bilddatei, keine Hintergrundfläche und keine getrennten Teilpfade. Die Importsoftware sollte die vorhandene Pfadreihenfolge erhalten.

Änderungen werden nach kurzer Pause automatisch berechnet. Eine neue Änderung beendet eine laufende Berechnung; ein veralteter Pfad kann nicht exportiert werden. „Berechnung abbrechen“ stoppt den Worker unmittelbar. Nach 45 Sekunden wird eine laufende Berechnung automatisch beendet. Komplett weiße Bilder erzeugen keinen sinnlosen Ersatzpfad.

## Algorithmus und Grenzen

- Alpha wird auf weißem Papier verrechnet, dann werden Luminanz, Schwarz-/Weißpunkt, Gamma und optionale Invertierung ausgewertet.
- Ein gerichteter Zufallspfad sucht noch nicht ausreichend gezeichnete Bildbereiche. Jeder Abschnitt verbraucht einen Teil der verbleibenden Dunkelheit. So entsteht eine dichte Kritzelstruktur statt einer Kontur-Nachzeichnung oder Zeilenrasterung.
- Auch Verbindungen zwischen getrennten dunklen Inseln werden gezeichnet. Einzelne Linien über helle Bereiche sind bei einem einzigen durchgehenden Pfad unvermeidbar. Ein Weißpunkt ist daher **keine harte geometrische Ausschlussmaske**.
- Ecken werden innerhalb ihrer Nachbarpunkte abgerundet und als kurze Geradensegmente exportiert. Vorschau, Export und Längenangabe verwenden dieselben Punkte. Die Dichte ist eine künstlerische Näherung, keine kalibrierte Druckkennlinie; Papier, Tinte und echter Stift beeinflussen die Deckung.
- Berechnung im Web Worker, maximal 600 Pixel an der längeren Bildkante und 100.000 rohe Schritte. Bei erreichter Schrittgrenze wird ein Hinweis angezeigt. Hohe Dichte, dünne Stifte und große Motive können lange physische Plotzeiten erzeugen.
- Die App benötigt einen aktuellen Browser mit ES-Modulen, Canvas und Modul-Web-Workern. Alle Bilddaten bleiben im Browser; keine Analyse-APIs, externen Fonts oder Telemetrie.
- SVG ist geräteunabhängig. Es gibt bewusst keine unbestätigten maschinenspezifischen G-Code-/Servo-Befehle.

Das vom Auftraggeber bereitgestellte Porträt wurde lokal für die Entwicklung und die Prüfung einer gerenderten Zeichnung verwendet. Das Foto und seine abgeleitete Vorschau sind nicht Bestandteil dieses öffentlichen Repositories. Sie lassen sich wie andere lokale Bilder über den Bildimport verwenden. Die integrierte Demo wird ausschließlich aus geometrischen Formen und Verläufen erzeugt.

## Struktur und Prüfung

- `src/path.js`: Tonwerte, zusammenhängender Pfad und SVG-Export, unabhängig von DOM/Worker.
- `src/worker.js`: begrenzte Berechnung außerhalb des UI-Threads.
- `src/app.js`: Bildimport, Vorschau, Regler und Export.
- `server.js`: lokaler statischer Server, bindet ausschließlich an `127.0.0.1`.

```sh
npm test
```

Die fokussierten Node-Tests prüfen Tonwerte, Transparenz, leere Bilder, verbundene dunkle Inseln, Grenzen/Determinismus, Dichte, Pfadlänge und den einzelnen SVG-Pfad mit Millimetermaßen. Ein physischer Plot muss am eigenen Gerät geprüft werden.
