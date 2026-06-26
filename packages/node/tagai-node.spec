# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec: 把 tagai-node 打包为单文件可执行（spec §11/P7，全平台）
# 构建：pyinstaller tagai-node.spec（在各平台分别构建以获得对应平台二进制）

block_cipher = None

a = Analysis(
    ['src/tagai_data_supply/__main__.py'],
    pathex=['src'],
    binaries=[],
    datas=[],
    hiddenimports=[
        # twikit 为可选依赖；如未安装打包时忽略，运行时按需提示
        'twikit',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='tagai-node',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
