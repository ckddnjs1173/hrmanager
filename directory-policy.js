// Shared by browser, SQLite and PostgreSQL; filters are applied before ranking.
(() => {
  const flag = value => value === true || value === 1;
  const sponsored = item => flag(item.featured);
  const verified = item => flag(item.v);
  const rank = (items, {region = '', field = ''} = {}) => [...items].sort((a, b) => {
    const score = item => [Number(sponsored(item)), Number(verified(item)),
      Number(!!region && String(item.loc || '').includes(region)),
      Number(!!field && (item.tags || []).includes(field))];
    const left = score(a), right = score(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
    const label = item => String(item.n || item.name || '') + '\u0000' + String(item.id || '');
    return label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : 0;
  });
  globalThis.INSAYA_DIRECTORY = Object.freeze({rank, sponsored, verified});
})();
