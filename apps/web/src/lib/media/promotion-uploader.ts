import { r2MediaUploader } from "./r2-uploader";
import type { MediaUploader } from "./uploader";

/** Upload of a promotion image: the same checks and the same upload to R2 as every other image, in the folder `promotion` of the shop. */
export const promotionImageUploader: MediaUploader = { upload: (file) => r2MediaUploader.upload(file, "promotion") };
