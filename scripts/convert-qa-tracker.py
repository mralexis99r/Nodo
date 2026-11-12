"""Convert a QA workbook with feature sheets into a private Nodo import package.

Usage: python scripts/convert-qa-tracker.py source.xlsx output.json
Uses Python's standard library. It never executes spreadsheet formulas.
"""
import hashlib
import json
import posixpath
import re
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def normalize_url(value):
    if not value:
        return ''
    parts = urlsplit(value)
    if parts.scheme not in ('https', 'http') or not parts.netloc:
        raise ValueError('Unsupported link protocol')
    return urlunsplit((parts.scheme, parts.netloc, quote(unquote(parts.path), safe='/:@'), parts.query, parts.fragment))


def read_workbook(source):
    with zipfile.ZipFile(source) as archive:
        if sum(info.file_size for info in archive.infolist()) > 30_000_000:
            raise ValueError('Workbook is too large')
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        relations = {node.get('Id'): node.get('Target') for node in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = []
        for info in ET.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS):
            target = relations[info.get(REL)]
            path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            root = ET.fromstring(archive.read(path))
            rows = {}
            for row in root.findall('s:sheetData/s:row', NS):
                cells = {}
                for cell in row.findall('s:c', NS):
                    column = re.match(r'[A-Z]+', cell.get('r')).group()
                    raw = cell.find('s:v', NS)
                    text = raw.text if raw is not None else ''
                    if cell.get('t') == 's' and text:
                        text = shared[int(text)]
                    elif cell.get('t') == 'inlineStr':
                        text = ''.join(cell.find('s:is', NS).itertext())
                    cells[column] = {'value': text or '', 'formula': cell.find('s:f', NS) is not None}
                rows[int(row.get('r'))] = cells
            link_relations = {}
            rel_path = posixpath.dirname(path) + '/_rels/' + posixpath.basename(path) + '.rels'
            if rel_path in archive.namelist():
                link_relations = {node.get('Id'): node.get('Target') for node in ET.fromstring(archive.read(rel_path))}
            links = {node.get('ref'): link_relations.get(node.get(REL), '') for node in root.findall('s:hyperlinks/s:hyperlink', NS)}
            sheets.append({'name': info.get('name'), 'rows': rows, 'links': links})
        return sheets


def convert(source):
    source = Path(source)
    fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
    sheets = read_workbook(source)
    uid = lambda key: str(uuid.uuid5(uuid.NAMESPACE_URL, fingerprint + ':' + key))
    value = lambda row, col: row.get(col, {}).get('value', '')
    warnings = []
    pages = []
    cases = []
    bugs = {}
    base_url = ''
    for sheet in sheets:
        for row in sheet['rows'].values():
            for cell in row.values():
                if '/_workitems/edit/' in cell['value'] and cell['value'].startswith('https://'):
                    base_url = normalize_url(cell['value'].split('/_workitems/edit/')[0] + '/_workitems/edit/')
                    break
            if base_url:
                break
        if base_url:
            break
    option_sheet = next((sheet for sheet in sheets if sheet['name'] == 'Opciones'), {'rows': {}})
    options = {key: list(dict.fromkeys(value(row, col) for n, row in option_sheet['rows'].items() if n >= 2 and value(row, col))) for key, col in [('classification', 'B'), ('automation', 'C'), ('note', 'D')]}
    blank = {'reference': '', 'title': '', 'status': '', 'classification': '', 'automation': '', 'bug': '', 'url': '', 'workItemId': '', 'linkLabel': '', 'note': '', 'history': '', 'module': ''}
    for sheet in sheets:
        if value(sheet['rows'].get(5, {}), 'A') != 'ATC / Referencia':
            continue
        records = []
        references = []
        for number, row in sheet['rows'].items():
            if number < 6:
                continue
            if not any(value(row, col) and not row[col]['formula'] for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] if col in row):
                continue
            item = {**blank, 'id': uid(f"{sheet['name']}:{number}"), 'sourceRow': number}
            for field, col in [('reference', 'A'), ('title', 'B'), ('status', 'C'), ('classification', 'D'), ('automation', 'E'), ('bug', 'F'), ('note', 'H'), ('history', 'I')]:
                item[field] = value(row, col)
            item['module'] = sheet['name']
            item['linkLabel'] = value(row, 'G') if not row.get('G', {}).get('formula') else ''
            direct_url = item['linkLabel'] if item['linkLabel'].startswith(('https://', 'http://')) else ''
            item['url'] = normalize_url(sheet['links'].get(f'G{number}', '') or direct_url)
            item['workItemId'] = value(row, 'J').strip()
            if not item['workItemId'] and item['url']:
                match = re.search(r'/_workitems/edit/(\d+)', item['url'])
                if match:
                    item['workItemId'] = match.group(1)
            if item['workItemId'] and not item['url'] and base_url:
                item['url'] = base_url + item['workItemId']
            if not item['reference'] and not item['status']:
                references.append(item)
            else:
                records.append(item)
        if records and any(not record['reference'] for record in records):
            warnings.append(f"{sheet['name']}: {sum(not record['reference'] for record in records)} casos sin referencia original. Se conservan el nombre, el estado y la fila de origen.")
        cases.extend(records)
        pages.append({'title': sheet['name'], 'icon': 'code', 'status': 'todo', 'blocks': [{'id': uid(sheet['name'] + ':block'), 'type': 'qa', 'kind': 'cases', 'title': 'Casos QA', 'source': source.name + ' / ' + sheet['name'], 'workItemBase': base_url, 'options': options, 'rows': records}]})
        if references:
            pages[-1]['blocks'].append({'id': uid(sheet['name'] + ':references'), 'type': 'qa', 'kind': 'references', 'title': 'Referencias históricas', 'source': source.name + ' / ' + sheet['name'], 'workItemBase': base_url, 'options': options, 'rows': references})
    if not pages:
        raise ValueError('No compatible feature sheets found')
    bug_sheet = next((sheet for sheet in sheets if sheet['name'] == 'Bugs Azure'), None)
    if bug_sheet:
        for number, row in bug_sheet['rows'].items():
            work_item = value(row, 'A')
            if number < 6 or not re.fullmatch(r'\d+', work_item) or row.get('A', {}).get('formula'):
                continue
            item = {**blank, 'id': uid('bug:' + work_item), 'workItemId': work_item, 'sourceRow': number}
            for field, col in [('module', 'B'), ('title', 'C'), ('status', 'D'), ('classification', 'E'), ('note', 'G'), ('history', 'H')]:
                item[field] = value(row, col)
            item['url'] = normalize_url(value(row, 'F')) or (base_url + work_item if base_url else '')
            if work_item in bugs:
                raise ValueError('Duplicate work item in bug register: ' + work_item)
            bugs[work_item] = item
    missing_ids = []
    for case in cases:
        work_item = case['workItemId']
        if work_item and work_item not in bugs:
            missing_ids.append(work_item)
            bugs[work_item] = {**blank, 'id': uid('bug:' + work_item), 'workItemId': work_item, 'title': case['linkLabel'] or case['bug'] or case['title'], 'status': 'POR CONFIRMAR', 'module': case['module'], 'classification': case['classification'], 'url': case['url'], 'history': 'Referencia encontrada en una feature. No existe estado explícito en el registro de bugs del archivo original. Confirmar el estado del WI en Azure.', 'sourceRow': case['sourceRow']}
    if missing_ids:
        warnings.append('Los WI ' + ', '.join(missing_ids) + ' están enlazados desde features y no tienen estado explícito en Bugs Azure. Se incorporan una sola vez como POR CONFIRMAR; no se asumen abiertos.')
    warnings.append('Los estados QA se conservan literalmente. CERRADO no se transforma en PASS. Los textos históricos no reabren bugs.')
    warnings.append('El resumen se recalcula a partir de los registros importados, incluyendo los casos sin referencia. Consolidacion y las fórmulas auxiliares no se duplican como casos.')
    bug_page = {'title': 'Bugs Azure', 'icon': 'code', 'status': 'todo', 'blocks': [{'id': uid('bugs:block'), 'type': 'qa', 'kind': 'bugs', 'title': 'Registro de bugs', 'source': source.name + ' / Bugs Azure', 'workItemBase': base_url, 'options': options, 'rows': list(bugs.values())}]}
    paragraphs = [{'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]} for text in warnings]
    overview = {'title': 'Resumen QA', 'icon': 'layers', 'status': 'todo', 'blocks': [{'id': uid('summary:report'), 'type': 'report', 'title': 'Trabajo resuelto', 'scope': 'project'}, {'id': uid('summary:notes'), 'type': 'text', 'content': {'type': 'doc', 'content': paragraphs}}]}
    original_summary = next((sheet for sheet in sheets if sheet['name'] == 'Resumen'), {'rows': {}})
    title = value(original_summary['rows'].get(1, {}), 'A').split('/')[-1].strip()
    title = title[:120] or source.stem[:120]
    return {'format': 'nodo-project', 'version': 1, 'project': {'title': title, 'description': 'Seguimiento QA por feature, casos y work items. Migrado desde ' + source.name, 'icon': 'code', 'color': 'blue'}, 'pages': [overview, *pages, bug_page], 'warnings': warnings}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python scripts/convert-qa-tracker.py source.xlsx output.json')
    output = Path(sys.argv[2])
    package = convert(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding='utf-8')
    counts = {kind: sum(len(block['rows']) for page in package['pages'] for block in page['blocks'] if block['type'] == 'qa' and block['kind'] == kind) for kind in ('cases', 'bugs')}
    print(json.dumps({'pages': len(package['pages']), **counts, 'warnings': len(package['warnings'])}))
