"""PyInstaller runtime hook：单文件二进制启动时注入 CA 证书路径。"""
import os
import sys

if getattr(sys, "frozen", False):
    try:
        import certifi

        ca = certifi.where()
        if os.path.isfile(ca):
            os.environ["SSL_CERT_FILE"] = ca
            os.environ["REQUESTS_CA_BUNDLE"] = ca
    except Exception:
        pass
