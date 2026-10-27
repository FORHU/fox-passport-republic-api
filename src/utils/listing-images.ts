/** The most images a Gear or Talent listing may carry. */
export const MAX_LISTING_IMAGES = 5;

export const PUBLISH_NEEDS_IMAGE = "Add at least one image before publishing";

/**
 * A Gear or Talent listing may sit in `draft` with no image, so an owner can
 * save their progress; anything past draft needs one. One rule for assets and
 * services, so the two can't drift apart.
 */
export function assertListingImages(status: string, imageCount: number) {
  if (imageCount > MAX_LISTING_IMAGES) {
    throw new Error(`A maximum of ${MAX_LISTING_IMAGES} images is allowed`);
  }
  if (status !== "draft" && imageCount === 0) {
    throw new Error(PUBLISH_NEEDS_IMAGE);
  }
}
