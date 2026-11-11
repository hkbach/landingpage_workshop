import type { SupportContact } from "../support-contact";

// Platform-level settings (not per shop). How a shop owner and a customer reach the platform admin team for support.
// NOT the shop's own contact details and never shown on the shop's landing page or any public page.
// A platform admin will edit these in the admin area (developed later); the shop owner screens only read them.
// The values below are fake demo data.
export const platformSupport: SupportContact = {
  whatsapp: "+84 90 000 0001",
  phone: "+84 28 0000 0002",
  zalo: "0900000003",
  email: "support@workshopkit.example",
};
