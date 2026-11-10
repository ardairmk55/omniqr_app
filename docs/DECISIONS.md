# Decisions

- Chose the “Private Press” concept: QR codes are treated as print proofs, with linen stock, forest ink, clay registration marks, crop corners, and compact production metadata.
- Kept user payloads in browser state and sends only the selected content to the same-origin generation endpoint. The server keeps only a bounded in-memory image cache.
- Used a pure Flask factory and separated payload building, validation, rendering, and HTTP routes. QR is PNG rendered with `qrcode` and Pillow.
- This starter implements 11 payload families, basic module shapes, a color pair, and the installation shell. Rich gradients, logo embedding, logo upload, gradients, scanner fallback, IndexedDB history/import, and a local offline QR encoder are not included yet; export buttons disclose their current behavior.
- The committed visual system uses a hand-authored stylesheet and local system font stacks to avoid third-party runtime requests; Tailwind CLI is available for utility generation. Font files can be added under `app/static/fonts/` after license review.
- PWA shell caches app assets and falls back to an offline page. Offline QR generation is not yet implemented.
