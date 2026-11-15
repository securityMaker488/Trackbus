import type { Point } from "../domain";
export const poiCategories = {
  school: "Escolas",
  university: "Universidades",
  bank: "Bancos",
  health: "Saúde",
  pharmacy: "Farmácias",
  commerce: "Comércio",
  park: "Praças e parques",
  transport: "Terminais",
  worship: "Igrejas",
  government: "Serviços públicos",
} as const;
export type Poi = Point & {
  id: string;
  name: string;
  category: keyof typeof poiCategories;
  municipality: string;
  source: "OpenStreetMap";
  meters?: number;
};
export type PoiResult = {
  points: Poi[];
  attribution: string;
  dataDate: string;
  coverage: string;
  truncated: boolean;
};
