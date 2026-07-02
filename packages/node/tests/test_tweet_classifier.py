from types import SimpleNamespace

from tagai_data_supply.scraper.tweet_classifier import classify_tweet, is_retweet


def test_is_retweet_by_prefix():
    t = SimpleNamespace(text="RT @alice: hello", id="1")
    assert is_retweet(t) is True
    assert classify_tweet(t) == "retweet"


def test_classify_original():
    t = SimpleNamespace(text="hello #tag", id="1", conversation_id="1")
    assert classify_tweet(t) == "original"


def test_classify_quote():
    t = SimpleNamespace(text="my take", quoted_status_id="99", id="2", conversation_id="2")
    assert classify_tweet(t) == "quote"


def test_classify_reply():
    t = SimpleNamespace(text="@a hi", in_reply_to_status_id="88", id="3")
    assert classify_tweet(t) == "reply"
