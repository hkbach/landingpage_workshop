// The kinds of the messages of the Contact form and their states, shared by the server (contact-store.ts) and the admin pages.
export const CONTACT_TOPICS = ["general", "demo", "support", "partnership"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const MESSAGE_STATUSES = ["NEW", "IN_PROGRESS", "DONE"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
