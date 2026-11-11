export type FoxerLeaderboardTab = "top_rated" | "most_booked" | "rising";

export interface FoxerLeaderboardEntry {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  city: string | null;
  /** The star rating, one decimal; null with fewer than 5 reviews ("New"). */
  paws: number | null;
  /** Kept for clients that still read it; same average, never null. */
  starRating: number;
  reviewCount: number;
  completedBookings: number;
  /** Role approval date, falling back to account creation (ISO). */
  foxerSince: string;
  /** Identity check approved. */
  isVerified: boolean;
}

export interface FoxerLeaderboardResponse {
  entries: FoxerLeaderboardEntry[];
  userPosition: FoxerLeaderboardEntry | null;
  tab: FoxerLeaderboardTab;
  role?: string;
  city?: string;
  specialty?: string;
}
