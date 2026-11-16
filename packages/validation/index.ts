import { z } from "zod";
import { project } from "../domain";
const name = z.string().trim().min(2).max(100),
  id = z.string().min(1).max(100);
export const stopSchema = z
  .object({
    id,
    name,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    dwellSeconds: z.number().int().min(0).max(300),
    reference: z
      .object({
        id: z.string().max(100),
        name: z.string().min(1).max(100),
        source: z.enum(["OpenStreetMap", "Google Maps"]),
      })
      .strict()
      .refine(
        (r) => r.source !== "Google Maps" || r.name === "Referência Google",
        "Salve somente o identificador do local Google; nomes e detalhes são consultados no mapa.",
      )
      .optional(),
  })
  .strict();
export const routeSchema = z
  .object({
    name,
    description: z.string().max(500).default(""),
    shift: z.enum(["Manhã", "Tarde", "Noite"]),
    departureTime: z
      .string()
      .regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .default(""),
    stops: z.array(stopSchema).min(2).max(50),
    active: z.boolean().default(true),
    expectedVersion: z.number().int().positive().optional(),
    drawing: z
      .array(
        z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      )
      .min(2)
      .max(1000)
      .optional(),
    adjustDrawing: z.boolean().default(false),
  })
  .strict()
  .superRefine((r, c) => {
    if (r.drawing && r.stops.some((s) => project(s, r.drawing!).offset > 150))
      c.addIssue({
        code: "custom",
        message:
          "Todas as paradas devem ficar a até 150 m do desenho. Ajuste as paradas ou limpe o desenho.",
      });
    if (
      new Set(r.stops.map((s) => s.id)).size !== r.stops.length ||
      new Set(r.stops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`))
        .size !== r.stops.length
    )
      c.addIssue({ code: "custom", message: "Paradas duplicadas" });
  });
export const vehicleSchema = z
  .object({
    name,
    plate: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, "Placa inválida"),
    model: name,
    year: z.number().int().min(1980).max(2100),
    capacity: z.number().int().min(1).max(100),
    status: z.enum(["available", "maintenance", "inactive"]),
  })
  .strict();
export const driverSchema = z
  .object({
    name,
    contact: z.string().max(100).default(""),
    userId: z.string().max(100).nullable().default(null),
    status: z.enum(["active", "inactive"]),
  })
  .strict();
export const studentSchema = z
  .object({
    name,
    enrollment: name,
    className: name,
    shift: z.enum(["Manhã", "Tarde", "Noite"]),
    routeId: id,
    stopId: id,
    userId: z.string().max(100).nullable().default(null),
    status: z.enum(["active", "inactive"]),
  })
  .strict();
export const tripSchema = z
  .object({
    name,
    routeId: id,
    vehicleId: id,
    driverId: id,
    monitorId: z.string().max(100).nullable().default(null),
    plannedStart: z.number().int().positive(),
    plannedEnd: z.number().int().positive(),
    trackingMode: z.enum(["gps", "simulation"]).default("gps"),
  })
  .strict()
  .refine(
    (t) =>
      t.plannedEnd > t.plannedStart &&
      t.plannedEnd - t.plannedStart <= 43200000,
    "Intervalo inválido",
  );
export const positionSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(1000),
    timestamp: z.number().int(),
    speed: z.number().min(0).max(60).nullable(),
    heading: z.number().min(0).max(360).nullable(),
    source: z.enum(["gps", "simulation"]),
  })
  .strict();
export const noticeSchema = z
  .object({
    tripId: id,
    category: z.enum([
      "delay",
      "mechanical",
      "traffic",
      "interruption",
      "resumed",
      "information",
      "assistance",
      "early",
    ]),
    message: z.string().trim().min(3).max(500),
    delayMinutes: z.number().int().min(0).max(120).default(0),
    simulated: z.boolean().default(false),
    safeStop: z.boolean().optional(),
  })
  .strict();
