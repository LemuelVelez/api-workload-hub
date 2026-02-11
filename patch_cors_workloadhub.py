import re
from pathlib import Path
from datetime import datetime

root = Path.cwd()
candidates = [
    root / "src" / "index.ts",
    root / "src" / "server.ts",
    root / "src" / "app.ts",
    root / "src" / "main.ts",
]

target = None

# 1) Prefer file that already has app.use(cors...)
for p in candidates:
    if p.exists():
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if "app.use(cors" in txt:
            target = p
            break

# 2) Otherwise detect a likely entrypoint
if target is None:
    for p in root.glob("src/**/*.ts"):
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if "express(" in txt and ("app.listen(" in txt or "createServer(" in txt):
            target = p
            break

if target is None:
    raise SystemExit("ERROR: Could not find backend entry file. Check src/index.ts or src/server.ts manually.")

text = target.read_text(encoding="utf-8")

# Backup
bak = target.with_suffix(target.suffix + f".bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}")
bak.write_text(text, encoding="utf-8")

# Ensure cors import with CorsOptions type
if not re.search(r'import\s+cors\b', text):
    import_line = 'import cors, { type CorsOptions } from "cors"\n'
    m = re.search(r'^(import .*\n)+', text, flags=re.M)
    if m:
        text = text[:m.end()] + import_line + text[m.end():]
    else:
        text = import_line + text
else:
    # If cors import exists but without CorsOptions type, normalize it.
    text = re.sub(
        r'import\s+cors\s+from\s+["\']cors["\']',
        'import cors, { type CorsOptions } from "cors"',
        text
    )

# Remove previous inserted block (idempotent)
text = re.sub(
    r'/\* CORS_CONFIG_START \*/[\s\S]*?/\* CORS_CONFIG_END \*/\n?',
    '',
    text,
    flags=re.M
)

# Remove common existing cors lines (avoid conflicting duplicate middleware)
text = re.sub(r'^\s*app\.use\(\s*cors\([\s\S]*?\)\s*\)\s*;?\s*$', '', text, flags=re.M)
text = re.sub(r'^\s*app\.options\(\s*["\']\*["\']\s*,\s*cors\([\s\S]*?\)\s*\)\s*;?\s*$', '', text, flags=re.M)

cors_block = '''
/* CORS_CONFIG_START */
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  process.env.SERVER_APP_ORIGIN ||
  "http://localhost:5173,https://workloadhub.jrmsu-tc.cloud"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
app.options("*", cors(corsOptions))
/* CORS_CONFIG_END */
'''

# Insert after app initialization if possible
m_app = re.search(r'^\s*const\s+app[^\n]*=\s*express\(\)\s*;?\s*$', text, flags=re.M)
if m_app:
    insert_at = m_app.end()
    text = text[:insert_at] + "\n\n" + cors_block.strip() + "\n" + text[insert_at:]
else:
    # fallback: after import block
    m_imp = re.search(r'^(import .*\n)+', text, flags=re.M)
    if m_imp:
        insert_at = m_imp.end()
        text = text[:insert_at] + "\n" + cors_block.strip() + "\n\n" + text[insert_at:]
    else:
        text = cors_block.strip() + "\n\n" + text

target.write_text(text, encoding="utf-8")
print(f"Patched: {target}")
print(f"Backup : {bak}")
