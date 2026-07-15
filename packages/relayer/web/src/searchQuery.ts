/** 构造 X 标签查询，同时支持 hashtag (#tag) 与 cashtag ($TAG)。 */
export function buildTagQuery(content: string): string {
  return content
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map((value) => {
      if (value.startsWith('#$')) return value.slice(1);
      if (value.startsWith('#') || value.startsWith('$')) return value;
      return `#${value}`;
    })
    .join(' OR ');
}
