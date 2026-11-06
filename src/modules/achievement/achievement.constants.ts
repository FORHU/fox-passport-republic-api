import { UserPath } from "@prisma/client";
import { AchievementDefinition } from "./achievement.types";

export const CITIZEN_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: "regular",
    name: "Regular",
    description: "Attend events across the Republic",
    category: "citizen",
    path: UserPath.user,
    tiers: [
      { tier: 1, target: 1, xp: 50, coins: 25 },
      { tier: 2, target: 10, xp: 150, coins: 75 },
      { tier: 3, target: 50, xp: 400, coins: 200, badgeName: "Regular" },
    ],
  },
  {
    key: "stamp_collector",
    name: "Stamp Collector",
    description: "Collect stamps from distinct venues",
    category: "citizen",
    path: UserPath.user,
    tiers: [
      { tier: 1, target: 5, xp: 50, coins: 25, badgeName: "Manila Explorer" },
      {
        tier: 2,
        target: 10,
        xp: 150,
        coins: 75,
        badgeName: "Venue Connoisseur",
      },
      { tier: 3, target: 25, xp: 400, coins: 200, badgeName: "Explorer" },
    ],
  },
  {
    key: "city_hopper",
    name: "City Hopper",
    description: "Collect stamps in multiple distinct cities",
    category: "citizen",
    path: UserPath.user,
    tiers: [
      { tier: 1, target: 2, xp: 50, coins: 25 },
      { tier: 2, target: 5, xp: 150, coins: 75 },
      { tier: 3, target: 10, xp: 400, coins: 200, badgeName: "City Hopper" },
    ],
  },
  {
    key: "critic",
    name: "Critic",
    description: "Leave verified ratings and reviews",
    category: "citizen",
    path: UserPath.user,
    tiers: [
      { tier: 1, target: 1, xp: 50, coins: 25, badgeName: "First Review" },
      { tier: 2, target: 10, xp: 150, coins: 75 },
      { tier: 3, target: 50, xp: 400, coins: 200, badgeName: "Master Critic" },
    ],
  },
  {
    key: "storyteller",
    name: "Storyteller",
    description: "Publish engaging posts on the Republic feed",
    category: "citizen",
    path: UserPath.user,
    isSocialOnly: true, // §6.2: Social achievements award XP only
    tiers: [
      { tier: 1, target: 5, xp: 50, coins: 0 },
      { tier: 2, target: 25, xp: 150, coins: 0 },
      { tier: 3, target: 100, xp: 400, coins: 0, badgeName: "Storyteller" },
    ],
  },
  {
    key: "conversationalist",
    name: "Conversationalist",
    description: "Contribute to discussions with comments",
    category: "citizen",
    path: UserPath.user,
    isSocialOnly: true,
    tiers: [
      { tier: 1, target: 25, xp: 50, coins: 0 },
      { tier: 2, target: 100, xp: 150, coins: 0 },
      {
        tier: 3,
        target: 500,
        xp: 400,
        coins: 0,
        badgeName: "Conversationalist",
      },
    ],
  },
  {
    key: "crowd_favorite",
    name: "Crowd Favorite",
    description: "Receive likes from fellow community members",
    category: "citizen",
    path: UserPath.user,
    isSocialOnly: true,
    tiers: [
      { tier: 1, target: 50, xp: 50, coins: 0 },
      { tier: 2, target: 250, xp: 150, coins: 0 },
      { tier: 3, target: 1000, xp: 400, coins: 0, badgeName: "Crowd Favorite" },
    ],
  },
];

export const FOXER_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: "open_for_business",
    name: "Open for Business",
    description: "Maintain published listings for venues, gear, or services",
    category: "foxer",
    path: UserPath.providerFoxer,
    tiers: [
      { tier: 1, target: 1, xp: 50, coins: 25 },
      { tier: 2, target: 5, xp: 150, coins: 75 },
      {
        tier: 3,
        target: 25,
        xp: 400,
        coins: 200,
        badgeName: "Open for Business",
      },
    ],
  },
  {
    key: "fully_booked",
    name: "Fully Booked",
    description: "Complete client bookings successfully",
    category: "foxer",
    path: UserPath.eventFoxer,
    tiers: [
      { tier: 1, target: 10, xp: 50, coins: 25 },
      { tier: 2, target: 50, xp: 150, coins: 75, badgeName: "Host Master" },
      { tier: 3, target: 250, xp: 400, coins: 200, badgeName: "Legend" },
    ],
  },
  {
    key: "five_stars",
    name: "Five Stars",
    description: "Receive top 5-star ratings from verified clients",
    category: "foxer",
    path: UserPath.providerFoxer,
    tiers: [
      { tier: 1, target: 10, xp: 50, coins: 25 },
      { tier: 2, target: 50, xp: 150, coins: 75 },
      { tier: 3, target: 200, xp: 400, coins: 200, badgeName: "Five Stars" },
    ],
  },
  {
    key: "quick_responder",
    name: "Quick Responder",
    description: "Answer match requests and inquiries within 24 hours",
    category: "foxer",
    path: UserPath.providerFoxer,
    tiers: [
      { tier: 1, target: 20, xp: 50, coins: 25 },
      { tier: 2, target: 100, xp: 150, coins: 75 },
      {
        tier: 3,
        target: 500,
        xp: 400,
        coins: 200,
        badgeName: "Quick Responder",
      },
    ],
  },
  {
    key: "reliable",
    name: "Reliable",
    description: "Fulfill bookings with zero host cancellations",
    category: "foxer",
    path: UserPath.providerFoxer,
    tiers: [
      { tier: 1, target: 20, xp: 50, coins: 25 },
      { tier: 2, target: 100, xp: 150, coins: 75 },
      { tier: 3, target: 500, xp: 400, coins: 200, badgeName: "Reliable" },
    ],
  },
];

export const ALL_ACHIEVEMENTS = [
  ...CITIZEN_ACHIEVEMENTS,
  ...FOXER_ACHIEVEMENTS,
];
