"use client";

import { create } from "zustand";
import type { CanvasBlock, CanvasState, DataSource, LayoutMode } from "@canvasium/types";

type CanvasStore = {
  canvas: CanvasState;
  setCanvas: (canvas: CanvasState) => void;
  setMode: (mode: LayoutMode) => void;
  replaceBlocks: (blocks: CanvasBlock[], title: string, mode: LayoutMode) => void;
  updateText: (id: string, content: string) => void;
  addSource: (source: DataSource, attachment: Extract<CanvasBlock, { type: "file_attachment" }>) => void;
  updateSource: (source: DataSource) => void;
  updateLayout: (id: string, layout: Extract<CanvasBlock, { type: "bi_widget" | "image" | "gallery" }>["layout"]) => void;
};

const initialCanvas: CanvasState = {
  canvasId: "canvasium-home",
  title: "Untitled canvas",
  connectedSources: [],
  activeLayoutMode: "document",
  blocks: [],
};

export const useCanvasStore = create<CanvasStore>((set) => ({
  canvas: initialCanvas,
  setCanvas: (canvas) => set({ canvas }),
  setMode: (activeLayoutMode) => set((state) => ({
    canvas: { ...state.canvas, activeLayoutMode },
  })),
  replaceBlocks: (blocks, title, activeLayoutMode) => set((state) => ({
    canvas: { ...state.canvas, blocks, title, activeLayoutMode },
  })),
  updateText: (id, content) => set((state) => ({
    canvas: {
      ...state.canvas,
      blocks: state.canvas.blocks.map((block) =>
      block.id === id && (block.type === "paragraph" || block.type === "heading")
        ? { ...block, content }
        : block,
      ),
    },
  })),
  addSource: (source, attachment) => set((state) => ({
    canvas: {
      ...state.canvas,
      connectedSources: [...state.canvas.connectedSources, source],
      blocks: [...state.canvas.blocks, attachment],
    },
  })),
  updateSource: (source) => set((state) => ({
    canvas: {
      ...state.canvas,
      connectedSources: state.canvas.connectedSources.map((current) =>
        current.id === source.id ? source : current,
      ),
    },
  })),
  updateLayout: (id, layout) => set((state) => ({
    canvas: {
      ...state.canvas,
      blocks: state.canvas.blocks.map((block) =>
      block.id === id && (block.type === "bi_widget" || block.type === "image" || block.type === "gallery")
        ? { ...block, layout }
        : block,
      ),
    },
  })),
}));
