# BeautyHub Next.js

This repository has been reworked into a Next.js frontend while preserving the existing PHP backend.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the Next.js development server:
   ```bash
   npm run dev
   ```
3. Make sure the PHP backend is available at `http://localhost/beautyhub/php/main.php`.

## Notes

- The PHP backend is proxied through `/api/php/main`.
- Static asset files are served from `public/Assets`.
- Existing PHP source files are kept for legacy use.
