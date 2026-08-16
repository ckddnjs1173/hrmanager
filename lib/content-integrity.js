function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateContentIntegrity({ topics = {}, articles = {}, extras = {} } = {}) {
  const errors = [];
  const workerTopics = Array.isArray(topics.worker) ? topics.worker : [];
  const employerTopics = Array.isArray(topics.employer) ? topics.employer : [];
  const topicItems = [...workerTopics, ...employerTopics];
  const topicKeys = [];
  const seen = new Set();

  for (const item of topicItems) {
    const key = text(item?.k);
    if (!key) {
      errors.push("topic_missing_key");
      continue;
    }
    if (seen.has(key)) errors.push(`duplicate_topic_key:${key}`);
    seen.add(key);
    topicKeys.push(key);

    if (!articles[key]) errors.push(`topic_missing_article:${key}`);
  }

  const articleEntries = Object.entries(articles || {});
  for (const [key, article] of articleEntries) {
    if (!text(article?.title)) errors.push(`article_missing_title:${key}`);
    if (!text(article?.cat)) errors.push(`article_missing_category:${key}`);
    if (!text(article?.from)) errors.push(`article_missing_audience:${key}`);
    if (!text(article?.lead)) errors.push(`article_missing_lead:${key}`);
  }

  for (const [key, extra] of Object.entries(extras || {})) {
    if (!articles[key]) errors.push(`extra_missing_article:${key}`);
    if (!Array.isArray(extra?.related)) continue;
    for (const relatedKey of extra.related) {
      if (!articles[relatedKey]) errors.push(`related_article_missing:${key}->${relatedKey}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      workerTopics: workerTopics.length,
      employerTopics: employerTopics.length,
      topics: topicKeys.length,
      articles: articleEntries.length,
      extras: Object.keys(extras || {}).length,
    },
  };
}
