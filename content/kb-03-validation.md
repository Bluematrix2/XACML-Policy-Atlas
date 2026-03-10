# Validierungsregeln im XACML Policy Atlas

Der XACML Policy Atlas prüft jede geladene Policy automatisch auf Korrektheit und Qualität. Die Validierung läuft vollständig im Browser und besteht aus zwei Stufen: **Pflichtprüfungen** (Fehler blockieren eine korrekte Verarbeitung) und **Hinweise** (Warnungen auf potenzielle Probleme).

---

## Übersicht: Wo erscheint die Validierung?

- **Visualizer-Tab**: Im Summary-Bereich jeder Policy erscheint ein grünes ✅ oder rotes ❌ Badge. Ein Klick darauf öffnet die Detailliste aller Prüfungen.
- **XACML-Editor**: Die Statusleiste unter der Editor-Toolbar zeigt in Echtzeit, ob das aktuell bearbeitete XML gültig ist.

---

## Stufe 1: Pflichtprüfungen (Fehler)

Schlägt eine der folgenden Prüfungen fehl, kann die Policy von einem XACML-PDP (Policy Decision Point) möglicherweise nicht korrekt ausgewertet werden.

---

### Prüfung 1 — XML syntaktisch korrekt

**Einfach erklärt:**
Das Dokument muss überhaupt lesbares XML sein. Fehlende schließende Tags, falsch verschachtelte Elemente oder ungültige Zeichen führen hier zu einem Fehler.

**Technisch:**
Der Browser-Parser (`DOMParser`, MIME-Typ `application/xml`) wird verwendet. Enthält das Dokument ein `<parsererror>`-Element im resultierenden DOM, schlägt diese Prüfung fehl. Die Fehlermeldung enthält, wenn verfügbar, die Zeilennummer.

**Referenz:** XML 1.0 Spezifikation, W3C — [https://www.w3.org/TR/xml/](https://www.w3.org/TR/xml/)

---

### Prüfung 2 — Gültiger XACML-Namespace

**Einfach erklärt:**
Jede XACML-Policy muss angeben, welche Version des Standards sie verwendet. Das geschieht über den XML-Namespace am Wurzelelement.

**Technisch:**
Das `namespaceURI` des Wurzelelements muss einem der beiden bekannten XACML-Namespaces entsprechen:

| Version | Namespace |
|---------|-----------|
| XACML 2.0 | `urn:oasis:names:tc:xacml:2.0:policy:schema:os` |
| XACML 3.0 | `urn:oasis:names:tc:xacml:3.0:core:schema:wd-17` |

**Referenz:** XACML 3.0 Core Specification, Abschnitt 5 — [https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html)

---

### Prüfung 3 — Wurzelelement ist `<Policy>` oder `<PolicySet>`

**Einfach erklärt:**
Das oberste Element des Dokuments muss entweder eine einzelne Policy oder ein Container für mehrere Policies sein.

**Technisch:**
`doc.documentElement.localName` muss `Policy` oder `PolicySet` sein. Andere Wurzelelemente (z. B. `<Request>` oder `<Response>`) sind zwar gültige XACML-Dokumente, aber keine auswertbaren Policies.

**Referenz:** XACML 3.0 Core Spec, Abschnitt 5.1 (Element `<Policy>`) und 5.2 (Element `<PolicySet>`)

---

### Prüfung 4 — Jede Policy besitzt einen Combining Algorithm

**Einfach erklärt:**
Wenn eine Policy mehrere Rules enthält, muss definiert sein, wie deren Ergebnisse (Permit/Deny) kombiniert werden. Das ist der sogenannte *Combining Algorithm*.

**Technisch:**
Jedes `<Policy>`-Element muss das Attribut `RuleCombiningAlgId` besitzen, jedes `<PolicySet>`-Element muss `PolicyCombiningAlgId` besitzen. Fehlt dieses Attribut, ist die Policy laut Spezifikation unvollständig und kann nicht deterministisch ausgewertet werden.

Gängige Combining Algorithms:

| Algorithmus-ID (Kurzform) | Verhalten |
|--------------------------|-----------|
| `deny-overrides` | Ein Deny gewinnt immer |
| `permit-overrides` | Ein Permit gewinnt immer |
| `first-applicable` | Erste passende Rule gewinnt |
| `only-one-applicable` | Genau eine Rule darf passen |
| `ordered-deny-overrides` | Wie `deny-overrides`, aber geordnet |
| `ordered-permit-overrides` | Wie `permit-overrides`, aber geordnet |

**Referenz:** XACML 3.0 Core Spec, Abschnitt 7.14 (Combining Algorithms)

---

### Prüfung 5 — Alle Rules besitzen ein `Effect`-Attribut

**Einfach erklärt:**
Jede Regel muss angeben, ob sie einen Zugriff erlaubt (`Permit`) oder verweigert (`Deny`). Fehlt diese Angabe, ist die Regelentscheidung undefiniert.

**Technisch:**
Das Attribut `Effect` jedes `<Rule>`-Elements muss exakt den Wert `Permit` oder `Deny` (case-sensitive) haben. Andere Werte oder ein fehlendes Attribut sind laut Spezifikation ungültig.

**Referenz:** XACML 3.0 Core Spec, Abschnitt 5.17 (Element `<Rule>`)

---

### Prüfung 6 — Designatoren enthalten `AttributeId` und `DataType`

**Einfach erklärt:**
Überall dort, wo in einer Policy auf ein Attribut (z. B. die Rolle eines Benutzers) verwiesen wird, muss sowohl der Name des Attributs als auch sein Datentyp angegeben sein.

**Technisch:**
Alle Elemente, deren `localName` das Wort `Designator` enthält (z. B. `SubjectAttributeDesignator`, `ResourceAttributeDesignator`, `AttributeDesignator`), müssen sowohl `AttributeId` als auch `DataType` als Attribute besitzen. Fehlende Werte führen zu undefiniertem Verhalten bei der Attributauflösung im PDP.

Unterstützte Standarddatentypen (Auswahl):

| Kurzform | Vollständiger URI |
|----------|-------------------|
| `string` | `http://www.w3.org/2001/XMLSchema#string` |
| `boolean` | `http://www.w3.org/2001/XMLSchema#boolean` |
| `integer` | `http://www.w3.org/2001/XMLSchema#integer` |
| `anyURI` | `http://www.w3.org/2001/XMLSchema#anyURI` |
| `dateTime` | `http://www.w3.org/2001/XMLSchema#dateTime` |

**Referenz:** XACML 3.0 Core Spec, Abschnitt 5.29 (Element `<AttributeDesignator>`)

---

### Prüfung 7 — Policy oder Rules definieren ein `<Target>`

**Einfach erklärt:**
Das `<Target>`-Element legt fest, für welche Requests eine Policy oder Rule überhaupt gilt. Fehlt es, gilt die Policy für *alle* eingehenden Anfragen — was in der Praxis fast immer ungewollt ist.

**Technisch:**
Wenn kein einziges `<Target>`-Element im Dokument vorhanden ist, wird eine Warnung ausgegeben. Ein leeres `<Target/>` (ohne Kinder-Elemente) bedeutet ebenfalls „gilt für alles" und wird gesondert in Prüfung 11 behandelt.

**Referenz:** XACML 3.0 Core Spec, Abschnitt 5.5 (Element `<Target>`)

---

### Prüfung 8 — Policies enthalten Rules

**Einfach erklärt:**
Eine `<Policy>` ohne `<Rule>`-Kindelemente ist leer und kann keine Zugriffsentscheidung treffen — sie gibt dann immer `NotApplicable` zurück.

**Technisch:**
Jedes `<Policy>`-Element (nicht `<PolicySet>`) wird daraufhin geprüft, ob es mindestens ein `<Rule>`-Kindelement besitzt. Fehlt dieses, wird eine Warnung ausgegeben.

**Referenz:** XACML 3.0 Core Spec, Abschnitt 5.1

---

### Prüfung 9 — Policy- und Rule-IDs sind eindeutig

**Einfach erklärt:**
Jede Policy und jede Rule muss eine ID haben, die im gesamten Dokument einmalig ist. Doppelte IDs können dazu führen, dass ein PDP die falsche Rule auswertet.

**Technisch:**
Alle `PolicyId`- und `RuleId`-Attributwerte werden in einem `Set` gesammelt. Taucht ein Wert ein zweites Mal auf, wird er als Duplikat gemeldet.

**Referenz:** XACML 3.0 Core Spec, Abschnitte 5.1 und 5.17

---

## Stufe 2: Qualitätswarnungen (Linter-Checks)

Diese Prüfungen erzeugen keine Fehler, sondern **Warnungen**. Sie weisen auf Konstrukte hin, die zwar technisch valide sind, aber in der Praxis häufig unbeabsichtigt sind oder Sicherheitsrisiken darstellen.

---

### Prüfung 10 — PolicySet enthält Policies

Ein `<PolicySet>` ohne `<Policy>`- oder `<PolicySet>`-Kinder trifft keine Entscheidungen und gibt immer `NotApplicable` zurück.

---

### Prüfung 11 — Leere `<Target>`-Elemente

Ein `<Target/>` ohne Kinder-Elemente bedeutet „trifft auf alle Requests zu". Das ist manchmal gewollt (z. B. als explizit universelle Policy), sollte aber bewusst gesetzt werden.

---

### Prüfung 12 — Rules ohne `<Condition>`

Eine Rule ohne `<Condition>`-Element greift bei jedem Request, der das `<Target>` erfüllt — unabhängig von weiteren Attributwerten des Subjects, der Resource oder der Action.

---

### Prüfung 13 — Unbedingte Permit-Rules ohne Target und Condition

Eine Rule mit `Effect="Permit"`, ohne `<Target>` und ohne `<Condition>`, erlaubt jeden Request bedingungslos. Das entspricht einer „permit-all"-Regel und sollte selten bis nie vorkommen.

---

### Prüfung 14 — Unbedingte Deny-Rules ohne Target und Condition

Analog zu Prüfung 13: Eine Rule mit `Effect="Deny"` ohne jede Einschränkung blockiert alle Requests und macht die gesamte Policy faktisch unbrauchbar.

---

### Prüfung 15 — Mögliche Regelüberschneidungen

Wenn mehrere Rules in einer Policy kein eigenes `<Target>` besitzen, können sie auf dieselben Requests angewendet werden. Die Reihenfolge und der Combining Algorithm entscheiden dann über das Ergebnis — das ist fehleranfällig.

---

### Prüfung 16 — Unerreichbare Rules (permit-overrides)

Beim Combining Algorithm `permit-overrides` gewinnt das erste Permit. Steht eine unbedingte Permit-Rule *vor* anderen Rules, werden alle nachfolgenden Rules nie ausgewertet — sie sind unerreichbar (dead code in der Policy).

---

### Prüfung 17 — Rules ohne `<Description>`

Das `<Description>`-Element ist optional, aber dringend empfohlen. Ohne Beschreibung ist der Zweck einer Rule für spätere Leser nicht nachvollziehbar.

---

### Prüfung 18 — Inkonsistente `AttributeId`-Formate

Im selben Dokument werden sowohl vollständige URIs (z. B. `urn:oasis:names:tc:xacml:1.0:subject:subject-id`) als auch Kurzformen (z. B. `subject-id`) verwendet. Das kann zu Problemen bei der Attributauflösung führen, wenn der PDP beide Formate nicht automatisch normalisiert.

---

### Prüfung 19 — Nicht-standardisierte DataTypes

Ein `DataType`-Attribut enthält einen Wert, der nicht zur XACML-Spezifikation oder zum XML-Schema-Standard gehört. Solche Typen können von PDPs unterschiedlich oder gar nicht unterstützt werden.

---

### Prüfung 20 — Unbekannte XACML-Elemente

Im XACML-Namespace tauchen Elemente auf, die weder in XACML 2.0 noch in 3.0 definiert sind. Das kann auf Tippfehler, proprietäre Erweiterungen oder Versionsverwechslungen hinweisen.

---

### Prüfung 21 — Zu tiefe PolicySet-Verschachtelung

`<PolicySet>`-Elemente können beliebig tief ineinander verschachtelt werden. Mehr als 3 Ebenen erschweren die Lesbarkeit und können die Performance des PDP bei der Entscheidungsfindung beeinträchtigen.

---

### Prüfung 22 — Fehlende `PolicyId`

Ein `<Policy>`- oder `<PolicySet>`-Element ohne `PolicyId` kann nicht eindeutig referenziert werden, z. B. über `<PolicyIdReference>`. Außerdem ist eine ID laut XACML-Spezifikation verpflichtend.

---

### Prüfung 23 — Fehlende `RuleId`

Analog zu Prüfung 22: Eine Rule ohne `RuleId` kann nicht eindeutig identifiziert werden, was das Debugging und das Logging im PDP erheblich erschwert.

---

### Prüfung 24 — Policy sehr groß (>20 Rules)

Policies mit mehr als 20 Rules sind schwer zu warten und können die Auswertungsgeschwindigkeit im PDP messbar verringern. Hier empfiehlt sich eine Aufteilung in mehrere Policies, die über ein `<PolicySet>` zusammengeführt werden.

---

## Weiterführende Quellen

- **XACML 3.0 Core Specification (OASIS):** [https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html)
- **XACML 2.0 Core Specification (OASIS):** [https://docs.oasis-open.org/xacml/2.0/access_control-xacml-2.0-core-spec-os.pdf](https://docs.oasis-open.org/xacml/2.0/access_control-xacml-2.0-core-spec-os.pdf)
- **XML 1.0 Spezifikation (W3C):** [https://www.w3.org/TR/xml/](https://www.w3.org/TR/xml/)
- **XML Schema Datentypen:** [https://www.w3.org/TR/xmlschema-2/](https://www.w3.org/TR/xmlschema-2/)
