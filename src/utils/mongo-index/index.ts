import { createBookingIndex } from "./booking";
import { createFavoriteIndex } from "./favorite";
import { createPricingIndex } from "./pricing";
import { createSpaceIndex } from "./space";
import { createUserLogsIndex } from "./user-logs";
import { createUserIndex } from "./users";
import { createVenueIndex } from "./venue";

export const InitializeCreateIndex = (db: any) => {
  return Promise.allSettled([
    createSpaceIndex(db),
    createUserIndex(db),
    createVenueIndex(db),
    createBookingIndex(db),
    createFavoriteIndex(db),
    createPricingIndex(db),
    createUserLogsIndex(db),
  ]);
};
