import base64, os
data = base64.b64decode(open('/Users/willnoftsinger/yotcrm-ui/peter-quintal.b64').read().strip())
os.makedirs('/Users/willnoftsinger/yotcrm-ui/public/email', exist_ok=True)
with open('/Users/willnoftsinger/yotcrm-ui/public/email/peter-quintal.jpg', 'wb') as f:
    f.write(data)
print('Done:', len(data), 'bytes written')
