import { r2MediaUploader } from "./r2-uploader";
import type { MediaUploader } from "./uploader";

/** Upload of a session image: the same checks and the same upload to R2 as every other image, in the folder `session` of the shop. */
export const sessionImageUploader: MediaUploader = { upload: (file) => r2MediaUploader.upload(file, "session") };
