// The kinds of the messages of the Contact form and their states, shared by the admin pages.
export const CONTACT_TOPICS = ["general", "demo", "support", "partnership"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const MESSAGE_STATUSES = ["NEW", "IN_PROGRESS", "DONE"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface ContactMessage { id: string; name: string; email: string; topic: ContactTopic; message: string; createdAt: string; status: MessageStatus; note: string; updatedAt: string }
