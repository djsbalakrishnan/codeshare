# CodeShare

CodeShare is a Cloudflare Worker app for sharing code snippets with students using short links.

It is designed for classroom use:
- Teachers create a snippet page from the home screen.
- Students open the generated URL to view the snippet in read-only mode.
- Snippets are stored in Cloudflare KV and automatically expire after 30 days.

## How It Works (Architecture)

### 1) Teacher creates a new page

1. Teacher opens `/` and enters:
   - Title
   - Programming language
   - Code content
2. Frontend sends `POST /new` with JSON payload:
   - `title`
   - `language`
   - `code`
3. Worker validates input:
   - `code` must be non-empty
   - `language` must be one of supported languages
   - `code` size limit: 500 KB
4. Worker generates a random snippet ID (7-char alphanumeric).
5. Worker stores snippet in Cloudflare KV (`SNIPPETS`) with `expirationTtl` set to 30 days.
6. Worker returns:
   - `id`
   - share URL like `https://<domain>/<id>`

### 2) Student accesses the page

1. Student opens `GET /:id`.
2. Worker reads snippet from Cloudflare KV using the ID.
3. If found:
   - Worker renders a read-only code page with title, language, and code content.
   - Expiry date is shown based on creation timestamp + 30 days.
4. If missing/expired:
   - Worker returns "Snippet Not Found" page.

## Data Stored in Cloudflare KV

For each snippet ID, the Worker stores this JSON object:

- `code`: snippet content (trimmed text)
- `title`: snippet title (trimmed, max 120 chars)
- `language`: selected language key
- `createdAt`: creation timestamp in milliseconds (`Date.now()`)

## Retention

- Storage backend: Cloudflare Edge KV (`SNIPPETS` binding)
- TTL: `30 * 24 * 60 * 60` seconds (30 days)
- After TTL, snippets are automatically removed by KV expiration.

## Routes

- `GET /` - Create snippet page
- `POST /new` - Create and store snippet, return URL
- `GET /:id` - View snippet page (read-only)

