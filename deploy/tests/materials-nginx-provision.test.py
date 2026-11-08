import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).resolve().parents[1] / "materials" / "enable-nginx.py"
spec = importlib.util.spec_from_file_location("materials_nginx", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NginxProvisionTest(unittest.TestCase):
    def test_preserves_https_and_http_redirect_configuration(self):
        text = """server {
    server_name bhi47.app www.bhi47.app;
    location /api/ { proxy_pass http://127.0.0.1:4000; }
    listen [::]:443 ssl;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/bhi47.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bhi47.app/privkey.pem;
}
server {
    server_name bhi47.app www.bhi47.app;
    listen 80;
    return 301 https://$host$request_uri;
}
"""
        updated = module.add_include(text)
        self.assertEqual(updated.count(module.INCLUDE), 1)
        self.assertEqual(updated.replace("\n\n    " + module.INCLUDE, ""), text)
        self.assertEqual(module.add_include(updated), updated)

    def test_refuses_a_non_tls_or_unknown_site(self):
        for text in ["server { listen 80; }", "server {\n    server_name bhi47.app www.bhi47.app;\n    listen 80;\n}"]:
            with self.assertRaises(ValueError):
                module.add_include(text)


if __name__ == "__main__":
    unittest.main()
