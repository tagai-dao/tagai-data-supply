import json
from unittest.mock import patch, MagicMock
import pytest
import click
from tagai_data_supply.registration import register_with_relayer, verify_invite, verify_tagai_account


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


def test_verify_invite_ok():
    with patch('tagai_data_supply.registration.urllib.request') as m:
        resp = MagicMock()
        resp.read.return_value = json.dumps({
            'c': 0, 'd': {'ok': True, 'invite_id': 'inv_1', 'label': 'lab1'},
        }).encode()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = resp
        m.build_opener.return_value = opener
        d = verify_invite('http://h:7701', 'secret')
        assert d['invite_id'] == 'inv_1'
        assert d['label'] == 'lab1'


def test_verify_invite_403_friendly():
    import urllib.error
    with patch('tagai_data_supply.registration.urllib.request') as m:
        opener = MagicMock()
        opener.open.side_effect = urllib.error.HTTPError(
            'url', 403, 'Forbidden', {}, None,
        )
        opener.open.return_value.__enter__.side_effect = opener.open.side_effect
        m.build_opener.return_value = opener
        m.HTTPError = urllib.error.HTTPError
        with pytest.raises(click.ClickException) as exc:
            verify_invite('http://h:7701', 'used-code')
        assert '邀请码' in str(exc.value)


def test_verify_tagai_account_ok():
    with patch('tagai_data_supply.registration.urllib.request') as m:
        resp = MagicMock()
        resp.read.return_value = json.dumps({
            'c': 0, 'd': {'ok': True, 'twitter_username': 'alice', 'twitter_id': '111', 'account_type': 0},
        }).encode()
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value = resp
        m.build_opener.return_value = opener
        d = verify_tagai_account('http://h:7701', 'alice')
        assert d['twitter_username'] == 'alice'
        assert d['account_type'] == 0


def test_verify_tagai_account_403_friendly():
    import urllib.error
    with patch('tagai_data_supply.registration.urllib.request') as m:
        opener = MagicMock()
        opener.open.side_effect = urllib.error.HTTPError(
            'url', 403, 'Forbidden', {}, None,
        )
        opener.open.return_value.__enter__.side_effect = opener.open.side_effect
        m.build_opener.return_value = opener
        m.HTTPError = urllib.error.HTTPError
        with pytest.raises(click.ClickException) as exc:
            verify_tagai_account('http://h:7701', 'nobody')
        assert 'Steem' in str(exc.value) or '验证失败' in str(exc.value)
