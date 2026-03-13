'use strict';

// ================================================================
//  I18N — Internationalization module (DE / EN)
//  Edit TRANSLATIONS to add or update UI strings.
//  To add a new language: add a key to SUPPORTED and a matching
//  object in TRANSLATIONS, then add a <button data-lang="xx"> in
//  the header.
// ================================================================

const SUPPORTED = ['de', 'en'];
const STORAGE_KEY = 'xacml-lang';

const TRANSLATIONS = {
  de: {
    // ── Page ──
    'page.title': 'XACML Policy Atlas – Viewer, Validator & Editor',

    // ── Header notices ──
    'hdr.notice.edu':     '⚠️ Nur für Bildungszwecke. Verwendung auf eigene Gefahr.',
    'hdr.notice.privacy': '🔒 Alle Daten werden lokal im Browser verarbeitet und niemals hochgeladen.',

    // ── Header ──
    'hdr.example.title': 'Beispiel-Policy laden (Physician Access)',
    'hdr.example.btn':   '▶ Beispiel laden',
    'hdr.csv.btn':       '📄 Mapping-CSV laden',
    'hdr.csv.title.none':'Keine Mapping-Tabelle geladen',
    'hdr.enf.btn':       '📊 Enforcement-CSV',
    'hdr.theme.aria.dark':  'Design: Dunkel (wechseln zu Hell)',
    'hdr.theme.aria.light': 'Design: Hell (wechseln zu Dunkel)',

    // ── Tabs ──
    'tab.viz':   '📊 Visualisierung',
    'tab.guide': '📖 XACML verstehen',
    'tab.kb':    '📚 Knowledge Base',

    // ── Sidebar ──
    'sidebar.clearBtn.title': 'Alle Policies entfernen',
    'sidebar.importBtn':      '+ Policy importieren',
    'sidebar.rules.one':      'Regel',
    'sidebar.rules.many':     'Regeln',
    'sidebar.editBtn.title':  'Bearbeiten',
    'sidebar.editBtn.aria':   'Bearbeiten',
    'sidebar.deleteBtn.title':'Entfernen',
    'sidebar.deleteBtn.aria': 'Entfernen',
    'sidebar.dirty.title':    'Ungespeicherte Änderungen',
    'sidebar.drop':           'XACML-Policy hier ablegen',

    // ── Confirm delete ──
    'confirm.delete.text': 'Entfernen?',
    'confirm.delete.yes':  'Ja',
    'confirm.delete.no':   'Abbrechen',

    // ── Content tabs ──
    'ctab.viz':    '📊 Visualizer',
    'ctab.editor': '✏️ XACML-Editor',

    // ── Empty state ──
    'empty.text':   'Noch keine Policy geladen',
    'empty.import': '+ Policy importieren',

    // ── Editor toolbar ──
    'editor.update':         '↻ Visualizer aktualisieren',
    'editor.beautify':       '✨ Beautify',
    'editor.download':       '⬇ Als XML herunterladen',
    'editor.reset':          '↺ Zurücksetzen',
    'editor.valInfo.title':  'Validierungsregeln erklärt (Knowledge Base)',
    'editor.valInfo.aria':   'Validierungsregeln erklärt',
    'editor.dirty':          '● Ungespeicherte Änderungen',
    'editor.reset.confirm':  'Alle Änderungen verwerfen?',
    'editor.reset.yes':      'Ja',
    'editor.reset.no':       'Abbrechen',

    // ── Editor search ──
    'editor.search.placeholder':   '🔍 Im Editor suchen…',
    'editor.search.clear.title':   'Suche leeren',
    'editor.search.clear.aria':    'Suche leeren',
    'editor.search.prev.title':    'Vorheriges Ergebnis',
    'editor.search.prev.aria':     'Vorheriges Ergebnis',
    'editor.search.next.title':    'Nächstes Ergebnis',
    'editor.search.next.aria':     'Nächstes Ergebnis',
    'editor.search.noMatch':       '0 Treffer',

    // ── Editor errors / status ──
    'editor.err.beautify': 'XML ist fehlerhaft – Beautify nicht möglich.',
    'editor.err.line':     'Zeile {line}: XML ist fehlerhaft. Bitte Syntax prüfen.',
    'editor.err.render':   'Fehler beim Rendern: {msg}',
    'editor.valid.xml':    'Gültiges XML',

    // ── Filter buttons ──
    'filter.all':    'Alle',
    'filter.permit': '✅ Nur Permit',
    'filter.deny':   '❌ Nur Deny',

    // ── Visualizer search bar ──
    'search.placeholder':   '🔍 Suchen (Beschreibung, Label, URI...)',
    'search.clear.title':   'Suche leeren',
    'search.clear.aria':    'Suche leeren',

    // ── Mobile hint ──
    'mobile.title': 'Desktop empfohlen',
    'mobile.text1': 'Der <strong>XACML Policy Atlas</strong> ist für größere Bildschirme ausgelegt und auf dem Smartphone oder kleinen Bildschirmen nicht nutzbar.',
    'mobile.text2': 'Bitte öffne die Seite auf einem Desktop- oder Laptop-Computer.',

    // ── Import modal ──
    'modal.title':              'Policy importieren',
    'modal.close.aria':         'Dialog schließen',
    'modal.tab.paste':          '📋 XML einfügen',
    'modal.tab.file':           '📁 Datei hochladen',
    'modal.textarea.placeholder': 'XACML-Policy hier einfügen...\n\nBeispiel:\n<PolicySet xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17" ...>\n  ...\n</PolicySet>',
    'modal.load':               '📥 Laden',
    'modal.drop.text':          'XML-Datei hier ablegen',
    'modal.drop.btn':           'Oder Datei auswählen',
    'modal.err.noXml':          'Keine XML-Datei gefunden. Bitte eine .xml-Datei wählen.',
    'modal.err.tooBig':         'Datei zu groß (max. {mb} MB)',
    'modal.err.noContent':      'Bitte XML-Inhalt eingeben.',
    'modal.success.single':     '\u201e{name}\u201c wurde erfolgreich geladen.',
    'modal.success.multi':      '{n} Policies erfolgreich geladen.',
    'modal.err.load':           'Fehler beim Laden:\n{errors}',

    // ── File validation ──
    'file.err.type':      'Ungültiger Dateityp. Nur {ext}-Dateien erlaubt.',
    'file.err.size':      'Datei zu groß (max. {mb} MB): {name}',
    'file.err.oversized': 'Übersprungen (max. {mb} MB überschritten):\n{files}',

    // ── Toast messages ──
    'toast.example':              'Beispiel-Policy geladen.',
    'toast.example.err':          'Beispiel konnte nicht geladen werden: {msg}',
    'toast.mapping.updated':      '\u201e{name}\u201c wurde aktualisiert.',
    'toast.mapping.loaded':       '\u201e{name}\u201c wurde erfolgreich geladen.',
    'toast.mapping.restored.one': '1 Mapping-Tabelle wiederhergestellt.',
    'toast.mapping.restored.many':'{n} Mapping-Tabellen wiederhergestellt.',
    'toast.mapping.full':         'Speicher voll \u2013 Mapping-Tabelle wurde nur temporär geladen.',
    'toast.mapping.cleared':      'Alle Mapping-Tabellen wurden entfernt.',
    'toast.enf.loaded':           '✓ {n} Ressourcen geladen',
    'toast.csv.err':              'CSV-Fehler: {msg}',
    'toast.enf.err':              'Enforcement-CSV-Fehler: {msg}',

    // ── Mapping CSV button tooltip ──
    'csv.tooltip.none': 'Keine Mapping-Tabelle geladen',
    'csv.tooltip.item': '{name} ({kb} KB, geladen: {date})',

    // ── Validation badge (summary box) ──
    'val.badge.errors':  '❌ {n} Fehler',
    'val.badge.valid':   '✅ Valide',
    'val.label':         'Validierung',
    'val.fixBtn':        'Im Editor öffnen und beheben →',
    'val.info.title':    'Validierungsregeln (Knowledge Base)',
    'val.info.aria':     'Validierungsregeln',

    // ── Validation checks (labels) ──
    'check.1':         'XML ist syntaktisch korrekt',
    'check.2':         'Gültiger XACML Namespace (2.0 oder 3.0)',
    'check.2.version': 'Gültiger XACML Namespace ({version})',
    'check.3':         'Wurzelelement ist Policy oder PolicySet',
    'check.3.found':   'Wurzelelement ist Policy oder PolicySet ({el})',
    'check.4':         'Alle Rules besitzen ein Effect (Permit/Deny)',
    'check.5':         'Policies besitzen einen Combining Algorithm',
    'check.6':         'Designatoren enthalten AttributeId und DataType',
    'check.7':         'Policy oder Rules definieren ein Target',
    'check.8':         'Policies enthalten Rules',
    'check.9':         'Policy- und Rule-IDs sind eindeutig',

    // ── Validation errors ──
    'val.err.namespace': 'Unbekannter XACML-Namespace: \u201e{ns}\u201c. Erwartet: XACML 3.0 oder 2.0.',
    'val.err.root':      'Wurzelelement ist <{name}>, erwartet <Policy> oder <PolicySet>',
    'val.err.alg':       'Kein Combining Algorithm bei: {names}',
    'val.err.effect':    'Rule ohne gültiges Effect: {names}',
    'val.err.desig':     'Designatoren enthalten kein AttributeId oder DataType: {names}',
    'val.err.duplicate': 'Doppelte IDs: {ids}',

    // ── Validation warnings ──
    'val.warn.noTargets':  'Keine Targets definiert \u2014 Policy gilt für alle Requests',
    'val.warn.emptyPolicy':'Policy ohne Rules: {names}',
    'val.warn.emptySet':   'PolicySet ohne Policy-Kinder: {names}',
    'val.warn.emptyTargets':'{n} leere(s) <Target/>-Element(e) gefunden \u2014 Policy gilt uneingeschränkt',
    'val.warn.noCond':     '{n} Rule(s) ohne Condition \u2014 greifen bei jedem passenden Request',
    'val.warn.permitAll':  '{n} unbedingte Permit-Rule(s) ohne Target/Condition \u2014 möglicherweise zu weite Rechte',
    'val.warn.denyAll':    '{n} unbedingte Deny-Rule(s) ohne Target/Condition \u2014 könnte Zugriff vollständig sperren',
    'val.warn.overlap':    'Policy \u201e{id}\u201c: {n} Rules ohne eigenes Target \u2014 mögliche Überschneidungen',
    'val.warn.unreachable':'Policy \u201e{id}\u201c (permit-overrides): {n} Rule(s) nach unbedingtem Permit nicht erreichbar',
    'val.warn.noDesc':     'Rule \u201e{id}\u201c hat keine Description',
    'val.warn.mixedAttr':  'Inkonsistente AttributeId-Formate: Mischung aus URI und Kurzform gefunden',
    'val.warn.badDt':      'Nicht-standardisierte DataTypes: {list}',
    'val.warn.unknownEl':  'Unbekannte XACML-Elemente: {list}',
    'val.warn.nesting':    'PolicySet-Verschachtelung zu tief ({n} Ebenen) \u2014 kann PDP-Performance beeinträchtigen',
    'val.warn.noPolicyId': '{n} Policy/PolicySet-Element(e) ohne PolicyId',
    'val.warn.noRuleId':   '{n} Rule(s) ohne RuleId',
    'val.warn.large':      'Policy sehr groß ({n} Rules) \u2014 kann Wartung und PDP-Performance erschweren',

    // ── Enforcement panel ──
    'enf.noData':         'Kein Enforcement-Eintrag für diese Ressource.',
    'enf.public':         '🌐 Public',
    'enf.publicMsg':      '🌐 Öffentlich zugänglich \u2014 keine Policy-Einschränkung',
    'enf.enforced.special':'⚠ Policy Enforced*',
    'enf.enforced':       '🔒 Policy Enforced',
    'enf.section':        'Enforcement-Attribute',
    'enf.th.sp':          'Suchparameter',
    'enf.th.path':        'FHIR-Pfad',
    'enf.th.xacml':       'XACML-Attribut',
    'enf.summary':        '{n} Attribute kontrolliert:',
    'enf.fhirLink':       '🔗 FHIR {version} Spezifikation →',

    // ── Renderer ──
    'renderer.oder.label':     'ODER (or)',
    'renderer.oder.tooltip':   'Eine dieser Bedingungen muss zutreffen',
    'renderer.und.label':      'UND (and)',
    'renderer.und.tooltip':    'Alle Bedingungen müssen gleichzeitig zutreffen',
    'renderer.fallback.tooltip':'Kein Label im Mapping gefunden',
    'renderer.wildcard.tooltip':'Wildcard-Policy: Gilt automatisch für alle Patientenakten',
    'renderer.wildcard.label': '⭐ Alle Patienten (Wildcard)',
    'renderer.fhir.spec':      '🔗 FHIR {version} Spezifikation',
    'renderer.not':            '⛔ NICHT',
    'renderer.entspricht':     'entspricht',
    'renderer.negated':        '\u2014 Bedingung ist negiert (NOT)',
    'renderer.impact':         'Wenn WAHR \u2192 Regel wird angewendet ({effect})',
    'renderer.condition':      '🔍 Bedingung',
    'renderer.who':            '👤 Wer (Subject)',
    'renderer.resources':      '📦 Ressourcen',
    'renderer.action':         '⚡ Action',
    'renderer.summary.title':  '📊 Zusammenfassung',
    'renderer.summary.type':          'Typ',
    'renderer.summary.type.policy':   'Policy',
    'renderer.summary.type.policyset':'PolicySet \u2014 {n} Policies',
    'renderer.summary.rules':  'Regeln',
    'renderer.summary.access': 'Zugang für',
    'renderer.summary.fhir':   'FHIR-Ressourcen',
    'renderer.summary.enf':    'Enforcement',
    'renderer.summary.enfCount':'📊 {n} Ressourcen geladen',
    'renderer.more':           '+{n} weitere',
    'renderer.wildcard.hint':  '⭐ Wildcard-Policy: Gilt automatisch für alle Patientenakten \u2014 kein Zustimmungsdokument erforderlich.',
    'renderer.rule.noDesc':    'Regel {n} (keine Beschreibung)',
    'renderer.noCondHint':     'ℹ️ Keine Zusatzbedingung \u2014 Regel greift immer wenn Subject übereinstimmt',
    'renderer.policyTarget':   '🎯 Policy-Target \u2014 gilt für alle Regeln',
    'renderer.expandAll':      '▼ Alle aufklappen',
    'renderer.collapseAll':    '▶ Alle zuklappen',

    // ── Guide UI chrome ──
    'guide.loading':          'Inhalte werden geladen…',
    'guide.err.title':        'Inhalte konnten nicht geladen werden',
    'guide.err.hint':         'Hinweis: Der Guide benötigt einen HTTP-Server. Wenn du die Datei direkt als <code>file://</code>-URL öffnest, blockiert der Browser das Laden der Markdown-Dateien. Starte einen lokalen HTTP-Server (z.&nbsp;B. <code>npx serve .</code>) oder nutze GitHub&nbsp;Pages.',
    'guide.toc.title':        'Inhalt',
    'guide.search.placeholder':'Suche…',
    'guide.search.aria':      'Guide durchsuchen',
    'guide.search.clear.title':'Suche leeren',
    'guide.search.clear.aria': 'Suche leeren',
    'guide.backTop.title':    'Zurück nach oben',
    'guide.backTop.aria':     'Zurück nach oben',
    'guide.anchor.title':     'Link zu diesem Abschnitt kopieren',
    'guide.anchor.aria':      'Abschnittslink kopieren',

    // ── Guide section titles ──
    'guide.s1.title': '1. Was ist XACML?',
    'guide.s2.title': '2. Aufbau einer Policy',
    'guide.s3.title': '3. Target \u2014 Für wen gilt die Regel?',
    'guide.s4.title': '4. UND- und ODER-Verknüpfungen',
    'guide.s5.title': '5. Conditions',
    'guide.s6.title': '6. Combining Algorithms',
    'guide.s7.title': '7. Praxisbeispiel',

    // ── KB UI chrome ──
    'kb.loading':          'Inhalte werden geladen…',
    'kb.err.title':        'Inhalte konnten nicht geladen werden',
    'kb.err.hint':         'Hinweis: Lokaler HTTP-Server erforderlich (z.&nbsp;B. <code>npx serve .</code>).',
    'kb.toc.title':        'Inhalt',
    'kb.search.placeholder':'Suche…',
    'kb.search.aria':      'Knowledge Base durchsuchen',
    'kb.search.clear.title':'Suche leeren',
    'kb.search.clear.aria': 'Suche leeren',
    'kb.backTop.title':    'Zurück nach oben',
    'kb.backTop.aria':     'Zurück nach oben',
    'kb.anchor.title':     'Link zu diesem Abschnitt kopieren',
    'kb.anchor.aria':      'Abschnittslink kopieren',

    // ── KB section titles ──
    'kb.s1.title': '1. Mapping-CSV',
    'kb.s2.title': '2. Enforcement-CSV',
    'kb.s3.title': '3. Validierungsregeln',
  },

  en: {
    // ── Page ──
    'page.title': 'XACML Policy Atlas – Viewer, Validator & Editor',

    // ── Header notices ──
    'hdr.notice.edu':     '⚠️ For educational purposes only. Use at your own risk.',
    'hdr.notice.privacy': '🔒 All data is processed locally in your browser and is never uploaded.',

    // ── Header ──
    'hdr.example.title': 'Load example policy (Physician Access)',
    'hdr.example.btn':   '▶ Load Example',
    'hdr.csv.btn':       '📄 Load Mapping-CSV',
    'hdr.csv.title.none':'No mapping table loaded',
    'hdr.enf.btn':       '📊 Enforcement-CSV',
    'hdr.theme.aria.dark':  'Theme: Dark (switch to Light)',
    'hdr.theme.aria.light': 'Theme: Light (switch to Dark)',

    // ── Tabs ──
    'tab.viz':   '📊 Visualization',
    'tab.guide': '📖 Understand XACML',
    'tab.kb':    '📚 Knowledge Base',

    // ── Sidebar ──
    'sidebar.clearBtn.title': 'Remove all policies',
    'sidebar.importBtn':      '+ Import Policy',
    'sidebar.rules.one':      'Rule',
    'sidebar.rules.many':     'Rules',
    'sidebar.editBtn.title':  'Edit',
    'sidebar.editBtn.aria':   'Edit',
    'sidebar.deleteBtn.title':'Remove',
    'sidebar.deleteBtn.aria': 'Remove',
    'sidebar.dirty.title':    'Unsaved Changes',
    'sidebar.drop':           'Drop XACML Policy here',

    // ── Confirm delete ──
    'confirm.delete.text': 'Remove?',
    'confirm.delete.yes':  'Yes',
    'confirm.delete.no':   'Cancel',

    // ── Content tabs ──
    'ctab.viz':    '📊 Visualizer',
    'ctab.editor': '✏️ XACML Editor',

    // ── Empty state ──
    'empty.text':   'No policy loaded yet',
    'empty.import': '+ Import Policy',

    // ── Editor toolbar ──
    'editor.update':         '↻ Update Visualizer',
    'editor.beautify':       '✨ Beautify',
    'editor.download':       '⬇ Download as XML',
    'editor.reset':          '↺ Reset',
    'editor.valInfo.title':  'Validation rules explained (Knowledge Base)',
    'editor.valInfo.aria':   'Validation rules explained',
    'editor.dirty':          '● Unsaved Changes',
    'editor.reset.confirm':  'Discard all changes?',
    'editor.reset.yes':      'Yes',
    'editor.reset.no':       'Cancel',

    // ── Editor search ──
    'editor.search.placeholder':   '🔍 Search in editor…',
    'editor.search.clear.title':   'Clear search',
    'editor.search.clear.aria':    'Clear search',
    'editor.search.prev.title':    'Previous result',
    'editor.search.prev.aria':     'Previous result',
    'editor.search.next.title':    'Next result',
    'editor.search.next.aria':     'Next result',
    'editor.search.noMatch':       '0 matches',

    // ── Editor errors / status ──
    'editor.err.beautify': 'XML is invalid – Beautify not possible.',
    'editor.err.line':     'Line {line}: XML is invalid. Please check syntax.',
    'editor.err.render':   'Render error: {msg}',
    'editor.valid.xml':    'Valid XML',

    // ── Filter buttons ──
    'filter.all':    'All',
    'filter.permit': '✅ Permit only',
    'filter.deny':   '❌ Deny only',

    // ── Visualizer search bar ──
    'search.placeholder':   '🔍 Search (description, label, URI...)',
    'search.clear.title':   'Clear search',
    'search.clear.aria':    'Clear search',

    // ── Mobile hint ──
    'mobile.title': 'Desktop recommended',
    'mobile.text1': 'The <strong>XACML Policy Atlas</strong> is designed for larger screens and cannot be used on smartphones or small screens.',
    'mobile.text2': 'Please open this page on a desktop or laptop computer.',

    // ── Import modal ──
    'modal.title':              'Import Policy',
    'modal.close.aria':         'Close dialog',
    'modal.tab.paste':          '📋 Paste XML',
    'modal.tab.file':           '📁 Upload file',
    'modal.textarea.placeholder': 'Paste XACML policy here...\n\nExample:\n<PolicySet xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17" ...>\n  ...\n</PolicySet>',
    'modal.load':               '📥 Load',
    'modal.drop.text':          'Drop XML file here',
    'modal.drop.btn':           'Or choose file',
    'modal.err.noXml':          'No XML file found. Please select a .xml file.',
    'modal.err.tooBig':         'File too large (max. {mb} MB)',
    'modal.err.noContent':      'Please enter XML content.',
    'modal.success.single':     '"{name}" loaded successfully.',
    'modal.success.multi':      '{n} policies loaded successfully.',
    'modal.err.load':           'Error loading:\n{errors}',

    // ── File validation ──
    'file.err.type':      'Invalid file type. Only {ext} files allowed.',
    'file.err.size':      'File too large (max. {mb} MB): {name}',
    'file.err.oversized': 'Skipped (max. {mb} MB exceeded):\n{files}',

    // ── Toast messages ──
    'toast.example':              'Example policy loaded.',
    'toast.example.err':          'Could not load example: {msg}',
    'toast.mapping.updated':      '"{name}" updated.',
    'toast.mapping.loaded':       '"{name}" loaded successfully.',
    'toast.mapping.restored.one': '1 mapping table restored.',
    'toast.mapping.restored.many':'{n} mapping tables restored.',
    'toast.mapping.full':         'Storage full – mapping table was only loaded temporarily.',
    'toast.mapping.cleared':      'All mapping tables removed.',
    'toast.enf.loaded':           '✓ {n} resources loaded',
    'toast.csv.err':              'CSV error: {msg}',
    'toast.enf.err':              'Enforcement CSV error: {msg}',

    // ── Mapping CSV button tooltip ──
    'csv.tooltip.none': 'No mapping table loaded',
    'csv.tooltip.item': '{name} ({kb} KB, loaded: {date})',

    // ── Validation badge (summary box) ──
    'val.badge.errors':  '❌ {n} errors',
    'val.badge.valid':   '✅ Valid',
    'val.label':         'Validation',
    'val.fixBtn':        'Open in editor and fix →',
    'val.info.title':    'Validation rules (Knowledge Base)',
    'val.info.aria':     'Validation rules',

    // ── Validation checks (labels) ──
    'check.1':         'XML is syntactically valid',
    'check.2':         'Valid XACML Namespace (2.0 or 3.0)',
    'check.2.version': 'Valid XACML Namespace ({version})',
    'check.3':         'Root element is Policy or PolicySet',
    'check.3.found':   'Root element is Policy or PolicySet ({el})',
    'check.4':         'All Rules have an Effect (Permit/Deny)',
    'check.5':         'Policies have a Combining Algorithm',
    'check.6':         'Designators contain AttributeId and DataType',
    'check.7':         'Policy or Rules define a Target',
    'check.8':         'Policies contain Rules',
    'check.9':         'Policy and Rule IDs are unique',

    // ── Validation errors ──
    'val.err.namespace': 'Unknown XACML namespace: "{ns}". Expected: XACML 3.0 or 2.0.',
    'val.err.root':      'Root element is <{name}>, expected <Policy> or <PolicySet>',
    'val.err.alg':       'No Combining Algorithm for: {names}',
    'val.err.effect':    'Rule without valid Effect: {names}',
    'val.err.desig':     'Designators missing AttributeId or DataType: {names}',
    'val.err.duplicate': 'Duplicate IDs: {ids}',

    // ── Validation warnings ──
    'val.warn.noTargets':  'No Targets defined \u2014 Policy applies to all requests',
    'val.warn.emptyPolicy':'Policy without Rules: {names}',
    'val.warn.emptySet':   'PolicySet without Policy children: {names}',
    'val.warn.emptyTargets':'{n} empty <Target/> element(s) found \u2014 Policy applies unconditionally',
    'val.warn.noCond':     '{n} Rule(s) without Condition \u2014 apply on every matching request',
    'val.warn.permitAll':  '{n} unconditional Permit Rule(s) without Target/Condition \u2014 possibly too broad',
    'val.warn.denyAll':    '{n} unconditional Deny Rule(s) without Target/Condition \u2014 could block all access',
    'val.warn.overlap':    'Policy "{id}": {n} Rules without own Target \u2014 possible overlaps',
    'val.warn.unreachable':'Policy "{id}" (permit-overrides): {n} Rule(s) after unconditional Permit are unreachable',
    'val.warn.noDesc':     'Rule "{id}" has no Description',
    'val.warn.mixedAttr':  'Inconsistent AttributeId formats: mix of URI and short form found',
    'val.warn.badDt':      'Non-standard DataTypes: {list}',
    'val.warn.unknownEl':  'Unknown XACML elements: {list}',
    'val.warn.nesting':    'PolicySet nesting too deep ({n} levels) \u2014 may impact PDP performance',
    'val.warn.noPolicyId': '{n} Policy/PolicySet element(s) without PolicyId',
    'val.warn.noRuleId':   '{n} Rule(s) without RuleId',
    'val.warn.large':      'Policy very large ({n} Rules) \u2014 may impact maintainability and PDP performance',

    // ── Enforcement panel ──
    'enf.noData':         'No enforcement entry for this resource.',
    'enf.public':         '🌐 Public',
    'enf.publicMsg':      '🌐 Publicly accessible \u2014 no policy restriction',
    'enf.enforced.special':'⚠ Policy Enforced*',
    'enf.enforced':       '🔒 Policy Enforced',
    'enf.section':        'Enforcement Attributes',
    'enf.th.sp':          'Search Parameter',
    'enf.th.path':        'FHIR Path',
    'enf.th.xacml':       'XACML Attribute',
    'enf.summary':        '{n} attributes controlled:',
    'enf.fhirLink':       '🔗 FHIR {version} Specification →',

    // ── Renderer ──
    'renderer.oder.label':     'OR',
    'renderer.oder.tooltip':   'One of these conditions must match',
    'renderer.und.label':      'AND',
    'renderer.und.tooltip':    'All conditions must match simultaneously',
    'renderer.fallback.tooltip':'No label found in mapping',
    'renderer.wildcard.tooltip':'Wildcard policy: Applies automatically to all patient records',
    'renderer.wildcard.label': '⭐ All Patients (Wildcard)',
    'renderer.fhir.spec':      '🔗 FHIR {version} Specification',
    'renderer.not':            '⛔ NOT',
    'renderer.entspricht':     'matches',
    'renderer.negated':        '\u2014 condition is negated (NOT)',
    'renderer.impact':         'If TRUE \u2192 rule is applied ({effect})',
    'renderer.condition':      '🔍 Condition',
    'renderer.who':            '👤 Who (Subject)',
    'renderer.resources':      '📦 Resources',
    'renderer.action':         '⚡ Action',
    'renderer.summary.title':  '📊 Summary',
    'renderer.summary.type':          'Type',
    'renderer.summary.type.policy':   'Policy',
    'renderer.summary.type.policyset':'PolicySet \u2014 {n} Policies',
    'renderer.summary.rules':  'Rules',
    'renderer.summary.access': 'Access for',
    'renderer.summary.fhir':   'FHIR Resources',
    'renderer.summary.enf':    'Enforcement',
    'renderer.summary.enfCount':'📊 {n} resources loaded',
    'renderer.more':           '+{n} more',
    'renderer.wildcard.hint':  '⭐ Wildcard Policy: Applies automatically to all patient records \u2014 no consent document required.',
    'renderer.rule.noDesc':    'Rule {n} (no description)',
    'renderer.noCondHint':     'ℹ️ No additional condition \u2014 rule applies whenever Subject matches',
    'renderer.policyTarget':   '🎯 Policy Target \u2014 applies to all rules',
    'renderer.expandAll':      '▼ Expand all',
    'renderer.collapseAll':    '▶ Collapse all',

    // ── Guide UI chrome ──
    'guide.loading':          'Loading content…',
    'guide.err.title':        'Content could not be loaded',
    'guide.err.hint':         'Note: The guide requires an HTTP server. If you open the file directly as a <code>file://</code> URL, the browser blocks loading of Markdown files. Start a local HTTP server (e.g. <code>npx serve .</code>) or use GitHub Pages.',
    'guide.toc.title':        'Contents',
    'guide.search.placeholder':'Search…',
    'guide.search.aria':      'Search guide',
    'guide.search.clear.title':'Clear search',
    'guide.search.clear.aria': 'Clear search',
    'guide.backTop.title':    'Back to top',
    'guide.backTop.aria':     'Back to top',
    'guide.anchor.title':     'Copy link to this section',
    'guide.anchor.aria':      'Copy section link',

    // ── Guide section titles ──
    'guide.s1.title': '1. What is XACML?',
    'guide.s2.title': '2. Structure of a Policy',
    'guide.s3.title': '3. Target \u2014 Who does the rule apply to?',
    'guide.s4.title': '4. AND and OR Combinations',
    'guide.s5.title': '5. Conditions',
    'guide.s6.title': '6. Combining Algorithms',
    'guide.s7.title': '7. Practical Example',

    // ── KB UI chrome ──
    'kb.loading':          'Loading content…',
    'kb.err.title':        'Content could not be loaded',
    'kb.err.hint':         'Note: A local HTTP server is required (e.g. <code>npx serve .</code>).',
    'kb.toc.title':        'Contents',
    'kb.search.placeholder':'Search…',
    'kb.search.aria':      'Search Knowledge Base',
    'kb.search.clear.title':'Clear search',
    'kb.search.clear.aria': 'Clear search',
    'kb.backTop.title':    'Back to top',
    'kb.backTop.aria':     'Back to top',
    'kb.anchor.title':     'Copy link to this section',
    'kb.anchor.aria':      'Copy section link',

    // ── KB section titles ──
    'kb.s1.title': '1. Mapping-CSV',
    'kb.s2.title': '2. Enforcement-CSV',
    'kb.s3.title': '3. Validation Rules',
  }
};

// ── Detect language ────────────────────────────────────────────────────────

function _detectLang() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored)) return stored;
  const browser = (navigator.language || 'de').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : 'de';
}

let _lang = _detectLang();

// ── Public API ─────────────────────────────────────────────────────────────

export const I18n = {

  getLang() { return _lang; },

  setLang(lang) {
    if (!SUPPORTED.includes(lang) || lang === _lang) return;
    _lang = lang;
    sessionStorage.setItem(STORAGE_KEY, lang);
    this.apply();
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  },

  /** Look up a translation key, optionally interpolating {placeholder} vars. */
  t(key, vars = {}) {
    const dict = TRANSLATIONS[_lang] || TRANSLATIONS.de;
    let str = dict[key] ?? TRANSLATIONS.de[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
    return str;
  },

  /**
   * Resolve a markdown content path for the current language.
   * Falls back to the original path if no lang-specific version exists.
   * Usage: I18n.mdPath('content/xacml-01-foo.md')
   *   → 'content/en/xacml-01-foo.md'  (when lang=en)
   *   → 'content/xacml-01-foo.md'     (when lang=de, or as fallback)
   */
  mdPath(defaultPath) {
    if (_lang === 'de') return defaultPath;
    return defaultPath.replace(/^content\//, `content/${_lang}/`);
  },

  /** Walk the DOM and update all data-i18n* elements. */
  apply() {
    // textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });
    // innerHTML (for strings containing HTML tags like <strong>, <code>)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = this.t(el.dataset.i18nHtml);
    });
    // placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.dataset.i18nPlaceholder);
    });
    // title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
    // aria-label attribute
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', this.t(el.dataset.i18nAria));
    });
    // document.title
    document.title = this.t('page.title');
    // html[lang]
    document.documentElement.lang = _lang;
    // lang switcher active state
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === _lang);
    });
  }
};

// Apply on first load (sets lang attr + active state; updates text if lang != de)
I18n.apply();
