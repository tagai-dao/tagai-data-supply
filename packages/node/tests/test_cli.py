import json
from unittest.mock import patch, MagicMock
from tagai_data_supply.cli import register_with_relayer


def test_register_includes_tagai_account():
    with patch('tagai_data_supply.cli.urllib.request') as m:
        resp = MagicMock()
        resp.read.return_value = json.dumps({'c': 0, 'd': {'node_id': 'n1', 'node_token': 't1', 'protocol_version': '1'}}).encode()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = resp
        m.build_opener.return_value = opener
        cred = register_with_relayer('http://h:7701', 'inv', 'UTC',
                                     tagai_account='111', tagai_account_type=0)
        assert cred['node_id'] == 'n1'
        # 验证请求体含 tagai_account（data 是关键字参数，从 kwargs 取）
        data = m.Request.call_args[1]['data']
        body = json.loads(data.decode())
        assert body['tagai_account'] == '111'
        assert body['tagai_account_type'] == 0


def test_register_excludes_none_fields():
    with patch('tagai_data_supply.cli.urllib.request') as m:
        resp = MagicMock()
        resp.read.return_value = json.dumps({'c': 0, 'd': {'node_id': 'n1', 'node_token': 't1', 'protocol_version': '1'}}).encode()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = resp
        m.build_opener.return_value = opener
        register_with_relayer('http://h:7701', 'inv', 'UTC')
        data = m.Request.call_args[1]['data']
        body = json.loads(data.decode())
        # exclude_none=True：未传字段不进 body
        assert 'tagai_account' not in body
        assert 'label' not in body
