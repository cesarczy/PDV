import hashlib
import json
import os
import secrets
import sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / 'pdv_front'
DB_PATH = BASE_DIR / 'data.db'

INITIAL_ITEMS = [
    {'id': 'entry-fee', 'name': 'Chave', 'price': 0, 'stock': 0},
    {'id': 'item-1', 'name': 'Coca-Cola', 'price': 6.5, 'stock': 20},
    {'id': 'item-2', 'name': 'Água', 'price': 3.5, 'stock': 30},
    {'id': 'item-3', 'name': 'Batata frita', 'price': 12.0, 'stock': 15}
]

INITIAL_CLIENTS = [
    {'id': f'chave-{i}', 'name': f'Chave {i}', 'ficha': i, 'status': 'livre'}
    for i in range(1, 101)
]

INITIAL_USERS = [
    {'id': 'user-admin', 'name': 'Administrador', 'login': 'admin', 'password': 'admin123'}
]

CREATE_TABLES_SQL = [
    '''
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT,
      price REAL,
      stock INTEGER
    )''',
    '''
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT,
      ficha INTEGER,
      status TEXT
    )''',
    '''
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      item_id TEXT,
      item_name TEXT,
      quantity INTEGER,
      total REAL,
      created_at TEXT,
      closed_at TEXT
    )''',
    '''
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      login TEXT UNIQUE,
      password TEXT
    )''',
    '''
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )'''
]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100_000)
    return f'pbkdf2$100000${salt}${digest.hex()}'


def is_hashed_password(password: str) -> bool:
    return password.startswith('pbkdf2$')


def verify_password(password: str, stored: str) -> bool:
    if not is_hashed_password(stored):
        return secrets.compare_digest(password, stored)
    _, iterations, salt, hash_hex = stored.split('$', 3)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), int(iterations))
    return secrets.compare_digest(digest.hex(), hash_hex)


def resolve_user_password(user: dict, existing_passwords: dict) -> str:
    password = user.get('password', '')
    user_id = user['id']
    if password:
        return password if is_hashed_password(password) else hash_password(password)
    return existing_passwords.get(user_id, hash_password(''))


def verify_login(login: str, password: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            'SELECT password FROM users WHERE login = ?',
            (login,)
        ).fetchone()
        if not row:
            return False
        stored = row['password']
        if not verify_password(password, stored):
            return False
        if not is_hashed_password(stored):
            conn.execute(
                'UPDATE users SET password = ? WHERE login = ?',
                (hash_password(password), login)
            )
            conn.commit()
        return True
    finally:
        conn.close()


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def migrate_items_table(conn):
    info = conn.execute('PRAGMA table_info(items)').fetchall()
    if not info:
        return
    columns = [row['name'] for row in info]
    if 'type' not in columns:
        return

    conn.execute('ALTER TABLE items RENAME TO items_old')
    conn.execute('''
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          name TEXT,
          price REAL,
          stock INTEGER
        )''')
    conn.execute(
        'INSERT INTO items (id, name, price, stock) SELECT id, name, price, stock FROM items_old'
    )
    conn.execute('DROP TABLE items_old')


def migrate_purchases_table(conn):
    columns = [row['name'] for row in conn.execute('PRAGMA table_info(purchases)').fetchall()]
    if not columns:
        return
    if 'item_name' not in columns:
        conn.execute('ALTER TABLE purchases ADD COLUMN item_name TEXT')
    if 'closed_at' not in columns:
        conn.execute('ALTER TABLE purchases ADD COLUMN closed_at TEXT')


def ensure_entry_fee_item(conn):
    entry_fee = conn.execute("SELECT value FROM app_settings WHERE key = 'entry_fee'").fetchone()['value']
    conn.execute(
        'INSERT OR IGNORE INTO items (id, name, price, stock) VALUES (?, ?, ?, ?)',
        ('entry-fee', 'Chave', float(entry_fee), 0)
    )


def migrate_active_entry_fee_purchases(conn):
    conn.execute('''
        UPDATE purchases
        SET closed_at = NULL
        WHERE item_id = 'entry-fee'
          AND client_id IN (SELECT id FROM clients WHERE status = 'em uso')
    ''')


def initialize_database():
    conn = get_connection()
    with conn:
        for sql in CREATE_TABLES_SQL:
            conn.execute(sql)
        migrate_items_table(conn)
        migrate_purchases_table(conn)
        conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('entry_fee', '0')")

        client_count = conn.execute('SELECT COUNT(*) AS count FROM clients').fetchone()['count']
        if client_count == 0:
            conn.executemany(
                'INSERT INTO clients (id, name, ficha, status) VALUES (?, ?, ?, ?)',
                [(c['id'], c['name'], c['ficha'], c['status']) for c in INITIAL_CLIENTS]
            )
        migrate_active_entry_fee_purchases(conn)

        item_count = conn.execute('SELECT COUNT(*) AS count FROM items').fetchone()['count']
        if item_count == 0:
            conn.executemany(
                'INSERT INTO items (id, name, price, stock) VALUES (?, ?, ?, ?)',
                [(item['id'], item['name'], item['price'], item['stock']) for item in INITIAL_ITEMS]
            )
        ensure_entry_fee_item(conn)

        user_count = conn.execute('SELECT COUNT(*) AS count FROM users').fetchone()['count']
        if user_count == 0:
            conn.executemany(
                'INSERT INTO users (id, name, login, password) VALUES (?, ?, ?, ?)',
                [
                    (user['id'], user['name'], user['login'], hash_password(user['password']))
                    for user in INITIAL_USERS
                ]
            )
    conn.close()


def load_state():
    initialize_database()
    conn = get_connection()
    try:
        items = [dict(row) for row in conn.execute('SELECT id, name, price, stock FROM items ORDER BY name')]
        clients = [dict(row) for row in conn.execute('SELECT id, name, ficha, status FROM clients ORDER BY ficha')]
        purchases = [dict(row) for row in conn.execute('SELECT id, client_id AS clientId, item_id AS itemId, item_name AS itemName, quantity, total, created_at AS createdAt, closed_at AS closedAt FROM purchases ORDER BY created_at DESC')]
        users = [dict(row) for row in conn.execute('SELECT id, name, login FROM users ORDER BY name')]
        entry_fee = conn.execute("SELECT value FROM app_settings WHERE key = 'entry_fee'").fetchone()['value']
        return {'items': items, 'clients': clients, 'purchases': purchases, 'users': users, 'entryFee': float(entry_fee)}
    finally:
        conn.close()


def save_state(parsed):
    items = parsed.get('items', [])
    clients = parsed.get('clients', [])
    purchases = parsed.get('purchases', [])
    users = parsed.get('users', [])

    conn = get_connection()
    try:
        with conn:
            existing_passwords = {
                row['id']: row['password']
                for row in conn.execute('SELECT id, password FROM users').fetchall()
            }

            current_entry_fee = conn.execute(
                "SELECT id, name, price, stock FROM items WHERE id = 'entry-fee'"
            ).fetchone()
            incoming_entry_fee = next((item for item in items if item.get('id') == 'entry-fee'), None)
            if not incoming_entry_fee and current_entry_fee:
                items.append(dict(current_entry_fee))
                incoming_entry_fee = items[-1]
            entry_fee = float(incoming_entry_fee['price']) if incoming_entry_fee else float(parsed.get('entryFee', 0))

            conn.execute('DELETE FROM items')
            conn.execute('DELETE FROM clients')
            conn.execute('DELETE FROM purchases')
            conn.execute('DELETE FROM users')

            conn.executemany(
                'INSERT INTO items (id, name, price, stock) VALUES (?, ?, ?, ?)',
                [
                    (item['id'], item['name'], float(item['price']), int(item['stock']))
                    for item in items
                ]
            )
            conn.executemany(
                'INSERT INTO clients (id, name, ficha, status) VALUES (?, ?, ?, ?)',
                [
                    (client['id'], client['name'], int(client['ficha']), client['status'])
                    for client in clients
                ]
            )
            conn.executemany(
                'INSERT INTO purchases (id, client_id, item_id, item_name, quantity, total, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    (
                        purchase['id'], purchase['clientId'], purchase['itemId'], purchase.get('itemName'),
                        int(purchase['quantity']), float(purchase['total']), purchase['createdAt'], purchase.get('closedAt')
                    )
                    for purchase in purchases
                ]
            )
            conn.executemany(
                'INSERT INTO users (id, name, login, password) VALUES (?, ?, ?, ?)',
                [
                    (user['id'], user['name'], user['login'], resolve_user_password(user, existing_passwords))
                    for user in users
                ]
            )
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ('entry_fee', ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (str(entry_fee),)
            )
    finally:
        conn.close()


class APIRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/state':
            try:
                state = load_state()
                self.send_json(state)
            except Exception as exc:
                self.send_json({'error': str(exc)}, status=500)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/login':
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length) if content_length else b''
            try:
                body = json.loads(raw_body.decode('utf-8'))
                login = body.get('login', '').strip()
                password = body.get('password', '')
                if not login or not password:
                    self.send_json({'error': 'Credenciais inválidas'}, status=401)
                    return
                if verify_login(login, password):
                    self.send_json({'ok': True})
                else:
                    self.send_json({'error': 'Credenciais inválidas'}, status=401)
            except json.JSONDecodeError:
                self.send_json({'error': 'JSON inválido'}, status=400)
            except Exception as exc:
                self.send_json({'error': str(exc)}, status=500)
        elif parsed.path == '/api/state':
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length) if content_length else b''
            try:
                parsed = json.loads(raw_body.decode('utf-8'))
                save_state(parsed)
                self.send_json({'ok': True})
            except json.JSONDecodeError:
                self.send_json({'error': 'JSON inválido'}, status=400)
            except Exception as exc:
                self.send_json({'error': str(exc)}, status=500)
        else:
            super().do_POST()

    def send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == '__main__':
    import sys

    initialize_database()

    if not FRONTEND_DIR.is_dir():
        raise RuntimeError(f'Pasta do frontend não encontrada: {FRONTEND_DIR}')

    default_port = int(os.environ.get('PORT', '8000'))
    port = default_port
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f'Porta inválida: {sys.argv[1]}. Usando {default_port}.')

    address = ('', port)
    print(f'Serving at http://localhost:{port}')
    handler = partial(APIRequestHandler, directory=str(FRONTEND_DIR))
    server = ThreadingHTTPServer(address, handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor interrompido.')
        server.server_close()
