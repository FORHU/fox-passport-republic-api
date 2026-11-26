-- Listings can use the Provider subcategories added in 20261127100000
-- (api#503 follow-up). Additive: new enum values only; no row changes.
-- ADD VALUE IF NOT EXISTS keeps a re-run harmless.
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'lighting';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'led_screens';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'stage_truss';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'special_effects';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'tents';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'linens_tableware';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'generators_power';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'backdrops_props';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'gowns_suits';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'photo_booth';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'drone_coverage';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'live_streaming';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'solo_performer';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'dancers';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'kids_entertainers';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'cakes_desserts';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'mobile_bar';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'food_carts';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'flowers';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'balloons';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'event_coordinators';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'ushers';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'cleaning';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'hair_makeup';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'bridal_cars';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'guest_shuttles';
