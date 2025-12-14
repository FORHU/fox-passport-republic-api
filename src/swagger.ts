import { Express } from "express";
import { merge } from "lodash";
import path from "path";
// import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

import { API_URL } from "./config";
import { getVersionString } from "./utils/generate-version";

const API_VERSION = getVersionString();

// Helper function to replace placeholders in YAML doc
function replacePlaceholders(doc: any): any {
  const jsonString = JSON.stringify(doc)
    .replace(/\${API_VERSION}/g, API_VERSION)
    .replace(/\${API_URL}/g, API_URL);
  return JSON.parse(jsonString);
}

// Helper function to load and process a Swagger YAML file
// function loadSwaggerDoc(filePath: string): any {
//   const doc = YAML.load(path.join(process.cwd(), filePath));
//   return replacePlaceholders(doc);
// }

// Merge the two Swagger YAML files
// function mergeSwaggerDocs() {
//   const authDoc = loadSwaggerDoc("swagger-docs/auth.yml");
//   const adminDoc = loadSwaggerDoc("swagger-docs/admin-member/admin-member.yml");
//   const organizationDoc = loadSwaggerDoc("swagger-docs/organization-member/organization-member.yml");
//   const spaceDoc = loadSwaggerDoc("swagger-docs/spaces.yml");
//   const venueDoc = loadSwaggerDoc("swagger-docs/venue.yml");
//   const enquiriesDoc = loadSwaggerDoc("swagger-docs/enquiries.yml");
//   const bookingDoc = loadSwaggerDoc("swagger-docs/booking.yml");
//   const favoriteDoc = loadSwaggerDoc("swagger-docs/favorite.yml");
//   const userDoc = loadSwaggerDoc("swagger-docs/users/users.yml");
//   const paymentDoc = loadSwaggerDoc("swagger-docs/payment.yml");
//   const paymentTransactionDoc = loadSwaggerDoc("swagger-docs/payment-transaction.yml");
//   const filesDoc = loadSwaggerDoc("swagger-docs/files.yml");
//   const ratingDoc = loadSwaggerDoc("swagger-docs/rating.yml");
//   const settingDoc = loadSwaggerDoc("swagger-docs/setting.yml");
//   const subscriptionDoc = loadSwaggerDoc("swagger-docs/subscription.yml");



//   return merge(
//     {},
//     authDoc,
//     adminDoc,
//     enquiriesDoc,
//     organizationDoc,
//     spaceDoc,
//     userDoc,
//     venueDoc,
//     bookingDoc,
//     favoriteDoc,
//     paymentDoc,
//     paymentTransactionDoc,
//     filesDoc,
//     ratingDoc,
//     settingDoc,
//     subscriptionDoc

//   );
// }

// export function setupSwagger(app: Express): void {
//   const swaggerDocument = mergeSwaggerDocs();
//   app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// }
