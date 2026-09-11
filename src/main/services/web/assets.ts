import indexHtml from '../../web/index.html?raw'
import appCss from '../../web/app.css?raw'
import appJs from '../../web/app.js?raw'
import manifest from '../../web/manifest.webmanifest?raw'
import iconSvg from '../../web/icon.svg?raw'

export interface WebAsset {
  body: string
  contentType: string
}

/**
 * The phone UI is inlined into the main bundle so the packaged app never has to
 * resolve a static directory at runtime.
 */
export const WEB_ASSETS: Record<string, WebAsset> = {
  '/index.html': { body: indexHtml, contentType: 'text/html; charset=utf-8' },
  '/app.css': { body: appCss, contentType: 'text/css; charset=utf-8' },
  '/app.js': { body: appJs, contentType: 'text/javascript; charset=utf-8' },
  '/manifest.webmanifest': { body: manifest, contentType: 'application/manifest+json' },
  '/icon.svg': { body: iconSvg, contentType: 'image/svg+xml' }
}
