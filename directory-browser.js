// Keep the legacy inline UI contract; the policy itself has no global side effects.
window.INSAYA_DIRECTORY_READY = import('./directory-policy.js').then(policy => {
  window.INSAYA_DIRECTORY = Object.freeze({rank:policy.rank,sponsored:policy.sponsored,verified:policy.verified});
  return window.INSAYA_DIRECTORY;
});
