let initialization;

export function ensureDatabase() {
  if (!initialization) {
    initialization = (async () => {
      const [{ migrate }, { syncRbac }] = await Promise.all([
        import('./migrate.js'),
        import('../auth/rbac.js'),
      ]);
      await migrate({ log: () => {} });
      await syncRbac();
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}
