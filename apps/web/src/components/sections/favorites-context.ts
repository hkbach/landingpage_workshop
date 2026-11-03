"use client";

import { createContext, useContext } from "react";

/** Lets the workshop cards save a workshop as a favorite without knowing about the login popup. Not `enabled` where there is no provider. */
export interface FavoritesActions {
  enabled: boolean;
  isFavorite: (workshopId: string) => boolean;
  /** Saves or removes the workshop; a guest who is not logged in is asked to log in first and the workshop is saved once they have. */
  toggle: (workshopId: string) => void;
}

export const FavoritesContext = createContext<FavoritesActions>({ enabled: false, isFavorite: () => false, toggle: () => {} });
export function useFavorites(): FavoritesActions {
  return useContext(FavoritesContext);
}
