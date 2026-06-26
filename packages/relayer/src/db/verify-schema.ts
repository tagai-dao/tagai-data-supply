import { verifyBscTweetSchema, REQUIRED_INSERT_COLUMNS } from './client';
import { logger } from '../utils/logger';

async function main() {
  const check = await verifyBscTweetSchema();
  logger.info(
    { hasTweetIdUnique: check.hasTweetIdUnique, hasTickNotNull: check.hasTickNotNull, columns: check.columns },
    'bsc_tweet schema check',
  );

  if (!check.hasTweetIdUnique) {
    logger.error('bsc_tweet 缺少 UNIQUE(tweet_id) — 去重终判策略需改！spec §5.1');
    process.exit(1);
  }
  if (!check.hasTickNotNull) {
    logger.warn('bsc_tweet.tick 非 NOT NULL，与 spec 假设不符，请复核');
  }

  const missing = REQUIRED_INSERT_COLUMNS.filter((c) => !check.columns.includes(c));
  if (missing.length) {
    logger.error({ missing }, 'bsc_tweet 缺少 INSERT 契约所需列，需以线上 schema 为准更新 client.ts');
    process.exit(1);
  }

  logger.info('bsc_tweet schema OK');
  process.exit(0);
}

main().catch((e) => {
  logger.error(e, 'verify-schema failed');
  process.exit(1);
});
