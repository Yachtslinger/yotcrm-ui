#!/bin/bash
# Run this once from the yotcrm-ui directory to install Peter's photo
curl -o /Users/willnoftsinger/yotcrm-ui/public/email/peter-quintal.jpg \
  "https://denisonyachting.com/wp-content/uploads/peter-quintal.jpg" 2>/dev/null || \
python3 -c "
import base64, os
# Decode the embedded base64 photo and write it
photo_b64 = open('/tmp/peter_b64_src.txt').read().strip()
with open('/Users/willnoftsinger/yotcrm-ui/public/email/peter-quintal.jpg','wb') as f:
    f.write(base64.b64decode(photo_b64))
print('Written successfully')
"
