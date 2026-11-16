'use client';

import { createContext, useContext } from 'react';

/** { user, store, reload } for the logged-in seller, provided by dashboard/layout.js. */
export const SellerContext = createContext(null);

export const useSeller = () => useContext(SellerContext);
