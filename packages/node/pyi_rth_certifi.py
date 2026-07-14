"""PyInstaller runtime hook：单文件二进制启动时注入 CA 证书路径。

注意：run -d 时子进程会继承父进程环境。父进程退出后其 _MEI* 临时目录会被清理，
若子进程仍指向父进程的 SSL_CERT_FILE，httpx/twikit 会报 FileNotFoundError。
因此这里无论成败都先清掉相关变量，再写入本进程自己的 certifi 路径。
"""
import os
import sys

_SSL_ENV_KEYS = (
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
)

if getattr(sys, "frozen", False):
    for key in _SSL_ENV_KEYS:
        os.environ.pop(key, None)
    try:
        import certifi

        ca = certifi.where()
        if os.path.isfile(ca):
            os.environ["SSL_CERT_FILE"] = ca
            os.environ["REQUESTS_CA_BUNDLE"] = ca
    except Exception:
        pass
