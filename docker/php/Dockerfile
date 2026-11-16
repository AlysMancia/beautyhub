FROM php:8.2-apache

# pdo_pgsql: database. gd + exif: resize uploaded photos and fix phone-photo rotation.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install pdo pdo_pgsql gd exif \
    && a2enmod headers \
    && rm -rf /var/lib/apt/lists/*

# Upload limits (videos up to 60 MB) and a safe uploads folder.
COPY uploads.ini /usr/local/etc/php/conf.d/uploads.ini
COPY uploads.conf /etc/apache2/conf-enabled/uploads.conf

# Owned by Apache so PHP can write; a new Docker volume copies this ownership.
RUN mkdir -p /var/www/html/uploads && chown -R www-data:www-data /var/www/html/uploads
