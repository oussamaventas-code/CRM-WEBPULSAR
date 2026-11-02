-- DESTRUCTIVO: elimina estas tablas y todos sus datos del esquema public.
-- CASCADE también elimina dependencias como restricciones FK y vistas que las usen.
-- No borra otras tablas, Supabase Auth, Storage ni la SQLite local.

BEGIN;

DROP TABLE IF EXISTS
  public.auth_limits,
  public.cash_closings,
  public.customers,
  public.discounts,
  public.drivers,
  public.menu_ingredient_soldout,
  public.menu_overrides,
  public.menu_soldout,
  public.orders,
  public.points_ledger,
  public.print_jobs,
  public.push_subscriptions,
  public.stock_counts,
  public.stock_items,
  public.store_status
CASCADE;

COMMIT;

-- Verificación: debe devolver cero filas.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'auth_limits', 'cash_closings', 'customers', 'discounts', 'drivers',
    'menu_ingredient_soldout', 'menu_overrides', 'menu_soldout', 'orders',
    'points_ledger', 'print_jobs', 'push_subscriptions', 'stock_counts',
    'stock_items', 'store_status'
  );
