import { addDays, setHours, setMinutes, startOfWeek } from "date-fns";

export type JobStatus = "accepted" | "pending" | "declined" | "change-request";

export interface Technician {
  id: string;
  name: string;
  email: string;
  role: "admin" | "montør";
}

export interface Job {
  id: string;
  microsoftEventId: string;
  technicianIds: string[];
  title: string;
  customer: string;
  address: string;
  description: string;
  start: Date;
  end: Date;
  status: JobStatus;
  proposedStart?: Date;
  proposedEnd?: Date;
  attachments?: { name: string; url: string }[];
}

const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

export const technicians: Technician[] = [
  { id: "1", name: "Erik Hansen", email: "erik@mcs.no", role: "montør" },
  { id: "2", name: "Lars Johansen", email: "lars@mcs.no", role: "montør" },
  { id: "3", name: "Kari Olsen", email: "kari@mcs.no", role: "montør" },
  { id: "4", name: "Thomas Berg", email: "thomas@mcs.no", role: "montør" },
];

export const jobs: Job[] = [
  {
    id: "j1",
    microsoftEventId: "ms-1",
    technicianIds: ["1"],
    title: "SERVICE – Varmepumpe vedlikehold",
    customer: "Norsk Bolig AS",
    address: "Storgata 15, 0182 Oslo",
    description: "Årlig vedlikehold av varmepumpe",
    start: setMinutes(setHours(addDays(weekStart, 0), 9), 0),
    end: setMinutes(setHours(addDays(weekStart, 0), 12), 0),
    status: "accepted",
  },
  {
    id: "j2",
    microsoftEventId: "ms-2",
    technicianIds: ["1"],
    title: "SERVICE – Ventilasjon inspeksjon",
    customer: "Fjord Eiendom",
    address: "Havnegata 8, 0150 Oslo",
    description: "Inspeksjon av ventilasjonsanlegg",
    start: setMinutes(setHours(addDays(weekStart, 1), 10), 0),
    end: setMinutes(setHours(addDays(weekStart, 1), 14), 0),
    status: "pending",
  },
  {
    id: "j3",
    microsoftEventId: "ms-3",
    technicianIds: ["2"],
    title: "SERVICE – Kjøling reparasjon",
    customer: "Bergen Handelshus",
    address: "Bryggen 22, 5003 Bergen",
    description: "Reparasjon av kjøleanlegg i serverrom",
    start: setMinutes(setHours(addDays(weekStart, 0), 8), 0),
    end: setMinutes(setHours(addDays(weekStart, 0), 11), 0),
    status: "accepted",
  },
  {
    id: "j4",
    microsoftEventId: "ms-4",
    technicianIds: ["2"],
    title: "SERVICE – Varmeanlegg feil",
    customer: "Solsiden Senter",
    address: "Beddingen 10, 7014 Trondheim",
    description: "Feilsøking varmeanlegg",
    start: setMinutes(setHours(addDays(weekStart, 2), 13), 0),
    end: setMinutes(setHours(addDays(weekStart, 2), 16), 0),
    status: "change-request",
    proposedStart: setMinutes(setHours(addDays(weekStart, 3), 9), 0),
    proposedEnd: setMinutes(setHours(addDays(weekStart, 3), 12), 0),
  },
  {
    id: "j5",
    microsoftEventId: "ms-5",
    technicianIds: ["1", "3"],
    title: "SERVICE – Installasjon varmepumpe",
    customer: "Privatkunde Nilsen",
    address: "Løkkeveien 45, 4008 Stavanger",
    description: "Ny installasjon luft-til-luft",
    start: setMinutes(setHours(addDays(weekStart, 1), 8), 0),
    end: setMinutes(setHours(addDays(weekStart, 1), 16), 0),
    status: "accepted",
  },
  {
    id: "j6",
    microsoftEventId: "ms-6",
    technicianIds: ["3"],
    title: "SERVICE – Akutt lekkasje",
    customer: "Hotell Nordlys",
    address: "Sjøgata 12, 8006 Bodø",
    description: "Akutt lekkasje i kjølerør",
    start: setMinutes(setHours(addDays(weekStart, 3), 9), 0),
    end: setMinutes(setHours(addDays(weekStart, 3), 12), 0),
    status: "declined",
  },
  {
    id: "j7",
    microsoftEventId: "ms-7",
    technicianIds: ["4"],
    title: "SERVICE – Preventiv vedlikehold",
    customer: "Kommunale bygg",
    address: "Rådhusplassen 1, 0037 Oslo",
    description: "Kvartalsvis vedlikehold HVAC",
    start: setMinutes(setHours(addDays(weekStart, 0), 7), 30),
    end: setMinutes(setHours(addDays(weekStart, 0), 15), 30),
    status: "pending",
  },
  {
    id: "j8",
    microsoftEventId: "ms-8",
    technicianIds: ["4"],
    title: "SERVICE – Garanti inspeksjon",
    customer: "Nybygg Prosjekt AS",
    address: "Ensjøveien 34, 0661 Oslo",
    description: "Garantiinspeksjon varmepumpe installert 2024",
    start: setMinutes(setHours(addDays(weekStart, 4), 10), 0),
    end: setMinutes(setHours(addDays(weekStart, 4), 13), 0),
    status: "accepted",
  },
];

export function getJobsForTechnician(techId: string): Job[] {
  return jobs.filter((j) => j.technicianIds.includes(techId));
}

export function getJobsForDay(techId: string, date: Date): Job[] {
  return jobs.filter(
    (j) =>
      j.technicianIds.includes(techId) &&
      j.start.toDateString() === date.toDateString()
  );
}
