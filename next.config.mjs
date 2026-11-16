// Uploaded photos/videos live on the PHP backend; serve them from this site's
// address (/uploads/...) so pages and invoice downloads can use them directly.
const phpOrigin = new URL(process.env.PHP_BACKEND_URL || 'http://localhost:8088/php/main.php').origin;

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/uploads/:path*', destination: `${phpOrigin}/uploads/:path*` }];
  },
};

export default nextConfig;
