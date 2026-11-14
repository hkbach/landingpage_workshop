// What the shop owner reads of the ratings the guests gave: the ratings that are not removed, newest first, with the workshop and the guest.
export interface OwnerRating { id: string; bookingCode: string; workshopId: string; workshopTitle: string | Record<string, string>; guestName: string; stars: number; comment: string; createdAt: string }
