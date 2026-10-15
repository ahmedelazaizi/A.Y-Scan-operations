import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

// The web app is fully self-hosted: no third-party scripts, styles, fonts or API origins.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

type StaticHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

/**
 * Serves the built single-page app from `root`. Unknown extension-less paths fall back to index.html so
 * client-side navigation works. Returns false when the request is not a static GET/HEAD it should handle.
 */
export function createStaticHandler(root: string): StaticHandler {
  const resolvedRoot = path.resolve(root)
  const indexPath = path.join(resolvedRoot, 'index.html')

  return async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      return false
    }
    if (pathname.startsWith('/api/') || pathname === '/api' || pathname.includes('\0')) return false

    const candidate = path.resolve(resolvedRoot, `.${pathname}`)
    const insideRoot = candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`)
    let filePath: string | null = null
    if (insideRoot && pathname !== '/' && await fileExists(candidate)) filePath = candidate
    else if (!path.extname(pathname) && await fileExists(indexPath)) filePath = indexPath
    if (!filePath) {
      // A browser opening the app while its files are missing should see why, not a bare JSON error.
      const wantsPage = !path.extname(pathname) && String(request.headers.accept ?? '').includes('text/html')
      if (wantsPage && !(await fileExists(indexPath))) {
        response.statusCode = 503
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(`<!doctype html><meta charset="utf-8"><title>A.Y Scan</title><body dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;max-width:640px;margin:60px auto;line-height:1.9"><h2>ملفات الواجهة غير موجودة</h2><p>الخادم يعمل، لكن ملف <b>index.html</b> غير موجود في المجلد التالي:</p><pre dir="ltr" style="background:#f3f5f8;padding:12px;border-radius:8px">${resolvedRoot.replace(/[<>&]/g, '')}</pre><p>أعد تثبيت البرنامج بنسخة جديدة من المثبّت. إن استمرت المشكلة أرسل محتوى مجلد <b>logs</b> للدعم.</p></body>`)
        return true
      }
      return false
    }

    const isIndex = filePath === indexPath
    const isHashedAsset = filePath.startsWith(path.join(resolvedRoot, 'assets') + path.sep)
    response.statusCode = 200
    response.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
    response.setHeader('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache')
    if (isIndex) response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    if (request.method === 'HEAD') {
      response.end()
      return true
    }
    await new Promise<void>((resolve) => {
      const stream = createReadStream(filePath)
      stream.on('error', () => {
        if (!response.headersSent) response.statusCode = 500
        response.end()
        resolve()
      })
      stream.on('end', resolve)
      stream.pipe(response)
    })
    return true
  }
}
