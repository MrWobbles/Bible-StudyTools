(function () {
  async function runGuard() {
    if (!window.BSTApi || typeof window.BSTApi.ensureAuthenticated !== 'function') {
      window.location.replace('/auth.html');
      return;
    }

    await window.BSTApi.ensureAuthenticated({ redirectTo: '/auth.html' });
  }

  void runGuard();
})();
