// Shared by browser, SQLite and PostgreSQL; filters are applied before ranking.
const flag = value => value === true || value === 1;
const sponsored = item => flag(item.featured);
const verified = item => flag(item.v);
// field는 문자열(단일 분야, 기존 호환) 또는 배열/Set(체크박스 다중 선택)을 모두 받는다.
const fieldMatch = (tags, field) => {
  if (!field) return false;
  if (typeof field === 'string') return tags.includes(field);
  const set = field instanceof Set ? field : new Set(field);
  return set.size > 0 && tags.some(t => set.has(t));
};
const rank = (items, {region = '', field = ''} = {}) => [...items].sort((a, b) => {
  const score = item => [Number(sponsored(item)), Number(verified(item)),
    Number(!!region && String(item.loc || '').includes(region)),
    Number(fieldMatch(item.tags || [], field))];
  const left = score(a), right = score(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
  const label = item => String(item.n || item.name || '') + '\u0000' + String(item.id || '');
  return label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : 0;
});
export {rank, sponsored, verified};
