import json
from types import SimpleNamespace

from tagai_data_supply.scraper.twitter_api_payload import (
    pack_twitter_api_payload,
    pack_twitter_api_user,
)
from tagai_data_supply.scraper.twikit_scraper import TwikitScraper


def test_pack_twitter_api_user():
    user = SimpleNamespace(
        id="1846739709462302720",
        name="凤凰单枞",
        screen_name="fenghuangha",
        profile_image_url="https://pbs.twimg.com/a.jpg",
        followers_count=11,
        following_count=80,
        statuses_count=1342,
        favourites_count=1762,
        listed_count=0,
        is_blue_verified=False,
        created_at="2024-10-17T02:27:18.000Z",
    )
    u = pack_twitter_api_user(user)
    assert u["id"] == "1846739709462302720"
    assert u["username"] == "fenghuangha"
    assert u["public_metrics"]["followers_count"] == 11
    assert u["verified"] is False


def test_pack_twitter_api_payload_reply_shape():
    user = SimpleNamespace(
        id="1846739709462302720",
        name="凤凰单枞",
        screen_name="fenghuangha",
        profile_image_url="https://pbs.twimg.com/a.jpg",
        followers_count=11,
        following_count=80,
        statuses_count=1342,
        favourites_count=1762,
        listed_count=0,
        verified=False,
    )
    tweet = SimpleNamespace(
        id="2072246627860119888",
        text="@binance @TagAIDAO tip $BUIDL",
        created_at="2026-07-01T09:11:11.000Z",
        conversation_id="2072203462792929643",
        in_reply_to_status_id="2072203462792929643",
        user=user,
        entities={
            "mentions": [
                {"start": 0, "end": 8, "username": "binance", "id": "877807935493033984"},
            ],
            "cashtags": [{"start": 23, "end": 29, "tag": "BUIDL"}],
        },
    )
    payload = pack_twitter_api_payload(tweet, user)
    assert payload["data"]["text"] == "@binance @TagAIDAO tip $BUIDL"
    assert payload["data"]["author_id"] == "1846739709462302720"
    assert payload["data"]["conversation_id"] == "2072203462792929643"
    assert payload["data"]["referenced_tweets"] == [
        {"type": "replied_to", "id": "2072203462792929643"},
    ]
    assert payload["includes"]["users"][0]["username"] == "fenghuangha"
    # tagclaw / twitterHandler 消费路径
    parsed = json.loads(json.dumps(payload))
    assert parsed["data"]["text"]
    author = next(u for u in parsed["includes"]["users"] if u["id"] == parsed["data"]["author_id"])
    assert author["username"] == "fenghuangha"


def test_pack_includes_raw_payload_on_tweet():
    scraper = TwikitScraper(ct0="x", auth_token="y")
    tweet = SimpleNamespace(
        id="999",
        text="hello",
        created_at="2026-07-01T00:00:00+00:00",
        conversation_id="999",
        user=SimpleNamespace(
            id="123",
            name="Bob",
            screen_name="bob_x",
            profile_image_url="https://pbs.twimg.com/b.jpg",
            followers_count=1,
            friends_count=2,
        ),
    )
    packed = scraper._pack([tweet])
    tw = packed["tweets"][0]
    assert tw["content"] == "hello"
    assert tw["raw_payload"]["data"]["text"] == "hello"
    assert tw["raw_payload"]["data"]["id"] == "999"
    assert tw["raw_payload"]["includes"]["users"][0]["username"] == "bob_x"
