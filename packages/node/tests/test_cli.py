import json
from unittest.mock import patch, MagicMock
from tagai_data_supply.registration import register_with_relayer


def test_register_includes_tagai_username():
    with patch('tagai_data_supply.registration.urllib.request') as m:
        resp = MagicMock()
        resp.read.return_value = json.dumps({'c': 0, 'd': {'node_id': 'n1', 'node_token': 't1', 'protocol_version': '1'}}).encode()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = resp
        m.build_opener.return_value = opener
        cred = register_with_relayer('http://h:7701', 'inv', 'UTC',
                                     tagai_username='alice', tagai_account_type=0)
        assert cred['node_id'] == 'n1'
        data = m.Request.call_args[1]['data']
        body = json.loads(data.decode())
        assert body['tagai_username'] == 'alice'
        assert body['tagai_account_type'] == 0


def test_register_excludes_none_fields():
    with patch('tagai_data_supply.registration.urllib.request') as m:
        resp = MagicMock()
        resp.read.return_value = json.dumps({'c': 0, 'd': {'node_id': 'n1', 'node_token': 't1', 'protocol_version': '1'}}).encode()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = resp
        m.build_opener.return_value = opener
        register_with_relayer('http://h:7701', 'inv', 'UTC')
        data = m.Request.call_args[1]['data']
        body = json.loads(data.decode())
        assert 'tagai_username' not in body
        assert 'label' not in body
