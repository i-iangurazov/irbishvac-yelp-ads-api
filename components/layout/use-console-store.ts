"use client";

import { create } from "zustand";

type ConsoleStore = {
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
};

export const useConsoleStore = create<ConsoleStore>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen })
}));
