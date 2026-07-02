from types import SimpleNamespace

import pytest

from tagai_data_supply.scraper.twikit_scraper import TwikitScraper


def test_pack_user_extracts_author_fields():
    scraper = TwikitScraper(ct0="x", auth_token="y")
    user = SimpleNamespace(
        id="123",
        name="Alice",
        screen_name="alice_x",
        profile_image_url_https="https://pbs.twimg.com/a.jpg",
        followers_count=100,
        following_count=50,
        statuses_count=200,
        favourites_count=300,
        listed_count=4,
        is_blue_verified=True,
    )
    author = scraper._pack_user(user)
    assert author["twitter_username"] == "alice_x"
    assert author["twitter_name"] == "Alice"
    assert author["profile"] == "https://pbs.twimg.com/a.jpg"
    assert author["followers"] == 100
    assert author["followings"] == 50
    assert author["tweet_count"] == 200
    assert author["like_count"] == 300
    assert author["listed_count"] == 4
    assert author["verified"] is True


@pytest.mark.asyncio
async def test_pack_includes_author_on_tweet():
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
    packed = await scraper._pack([tweet])
    tw = packed["tweets"][0]
    assert tw["kind"] == "post"
    assert tw["tweet_type"] == "original"
    assert tw["twitter_username"] == "bob_x"
    assert tw["twitter_id"] == "123"
    assert tw["raw_payload"]["data"]["text"] == "hello"
