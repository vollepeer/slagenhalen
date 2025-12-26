import { z } from "zod";

export const createPlayerSchema = z.object({
  name: z.string().min(1)
});

export const updatePlayerSchema = z.object({
  name: z.string().min(1).optional(),
  isArchived: z.boolean().optional()
});

export const createSeasonSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional()
});

export const updateSeasonSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isArchived: z.boolean().optional()
});

export const createEventSchema = z.object({
  seasonId: z.number().int(),
  eventDate: z.string().min(1),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const updateEventSchema = z.object({
  eventDate: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isArchived: z.boolean().optional()
});

export const addParticipantSchema = z.object({
  playerId: z.number().int()
});

export const updateParticipantSchema = z.object({
  pointsR1: z.number().int().min(0).nullable().optional(),
  pointsR2: z.number().int().min(0).nullable().optional(),
  pointsR3: z.number().int().min(0).nullable().optional()
});
