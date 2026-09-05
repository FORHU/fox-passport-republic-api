/**
 * Shared lat/lng lookup for seed data. Previously copy-pasted (with drifting
 * subsets) across asset.seeder.ts, service.seeder.ts, venue.seeder.ts and
 * partner.seeder.ts; this is their union, so every city any seeder already
 * referenced still resolves the same coordinates it did before.
 */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Manila: { lat: 14.5995, lng: 120.9842 },
  Taguig: { lat: 14.5176, lng: 121.0509 },
  "Cebu City": { lat: 10.3157, lng: 123.8854 },
  Pasig: { lat: 14.5764, lng: 121.0851 },
  "Quezon City": { lat: 14.676, lng: 121.0437 },
  Pasay: { lat: 14.5378, lng: 121.0014 },
  Makati: { lat: 14.5547, lng: 121.0244 },
  Tagaytay: { lat: 14.1152, lng: 120.9624 },
  "Baguio City": { lat: 16.4023, lng: 120.596 },
  Mandaluyong: { lat: 14.5794, lng: 121.0359 },
  "Angeles City": { lat: 15.145, lng: 120.5887 },
  Tanauan: { lat: 14.0856, lng: 121.1511 },
  Antipolo: { lat: 14.5872, lng: 121.1761 },
  Angono: { lat: 14.5236, lng: 121.1528 },
  Lian: { lat: 13.9592, lng: 120.6565 },
  "San Fernando": { lat: 15.029, lng: 120.6899 },
  Malolos: { lat: 14.8428, lng: 120.8128 },
  Silang: { lat: 14.2302, lng: 120.9758 },
  Dasmariñas: { lat: 14.3294, lng: 120.9367 },
  "San Miguel": { lat: 15.1588, lng: 120.9774 },
  Marikina: { lat: 14.6507, lng: 121.1029 },
  Boracay: { lat: 11.9674, lng: 121.9248 },
  "General Luna": { lat: 9.7977, lng: 126.0939 },
  "Davao City": { lat: 7.1907, lng: 125.4553 },
  "El Nido": { lat: 11.1859, lng: 119.4083 },
  "Puerto Princesa": { lat: 9.7391, lng: 118.7353 },
  Aparri: { lat: 18.3535, lng: 121.636 },
  Panglao: { lat: 9.5843, lng: 123.7568 },
  Nasugbu: { lat: 13.9303, lng: 120.63 },
  "San Juan": { lat: 16.6583, lng: 120.3308 },
  Iba: { lat: 15.3296, lng: 119.9752 },
  Pagudpud: { lat: 18.5598, lng: 120.793 },
};
