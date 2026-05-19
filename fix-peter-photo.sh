#!/bin/bash
# Fetch Peter's photo from the correct Denison CDN URL and save it locally
# Run this once from the yotcrm-ui directory: bash fix-peter-photo.sh

mkdir -p public/email

# Try the correct CDN path for Peter Quintal
curl -L -o public/email/peter-quintal.jpg \
  "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69a9ad1648535.jpg" \
  && echo "✅ Saved from CDN (69a9ad)" && exit 0

echo "⚠️  CDN failed — copy peter-quintal.jpg manually to public/email/peter-quintal.jpg"
