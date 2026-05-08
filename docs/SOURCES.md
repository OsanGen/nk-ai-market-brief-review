# Sources

Sources live in `newsletter-sources.json`.

Each enabled source has:

- `id`
- `name`
- `mode`
- `query`
- `homepageUrl`
- `weight`
- `enabled`
- `categories`

Default source mode is `google_news_rss`, which turns `query` into:

```text
https://news.google.com/rss/search?q=<encoded_query>&hl=en-US&gl=US&ceid=US:en
```

To disable a source, set `enabled` to `false`.

The MVP uses only RSS metadata: title, source, URL, date, and summary/description. It does not scrape article pages.
