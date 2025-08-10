import { useEffect, useMemo, useState } from "react";
import { addMinutes, format, isSameDay, parseISO } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const TZ = "Europe/Madrid";

const ENDPOINTS = {
  padel: "https://api.appointlet.com/bookables/194780/available_times?service=570818",
  frontenis: "https://api.appointlet.com/bookables/195640/available_times?service=570852",
} as const;

const DURATIONS = { padel: 90, frontenis: 60 } as const;

type Sport = keyof typeof ENDPOINTS;

type AppSettings = {
  email: string;
  nom: string;
  lastName: string;
  localitat: string;
  telefon: string;
};

type BookingResponse = {
  id: string;
  url: string;
  email: string;
  start: string;
  end: string;
  timezone: string;
  service: { id: number; name: string; duration: number };
  bookable: { id: number; name: string };
};

type ScheduledJob = {
  id: string;
  sport: Sport;
  desiredStart: string; // ISO (Z)
  scheduleAt: string; // ISO (Z)
};

const LS_KEYS = {
  settings: "app_settings",
  bookings: "app_bookings",
  jobs: "app_scheduled_jobs",
} as const;

function loadSettings(): AppSettings {
  const raw = localStorage.getItem(LS_KEYS.settings);
  if (!raw) return { email: "", nom: "", lastName: "", localitat: "", telefon: "" };
  try { return JSON.parse(raw); } catch { return { email: "", nom: "", lastName: "", localitat: "", telefon: "" }; }
}

function saveSettings(val: AppSettings) {
  localStorage.setItem(LS_KEYS.settings, JSON.stringify(val));
}

function loadBookings(): BookingResponse[] {
  const raw = localStorage.getItem(LS_KEYS.bookings);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveBookings(list: BookingResponse[]) {
  localStorage.setItem(LS_KEYS.bookings, JSON.stringify(list));
}

function loadJobs(): ScheduledJob[] {
  const raw = localStorage.getItem(LS_KEYS.jobs);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveJobs(list: ScheduledJob[]) {
  localStorage.setItem(LS_KEYS.jobs, JSON.stringify(list));
}

const Index = () => {
  const { toast } = useToast();

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // Reserva online state
  const [sport, setSport] = useState<Sport>("padel");
  const [date, setDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<string[]>([]); // ISO strings from API

  // Programación state
  const [jobs, setJobs] = useState<ScheduledJob[]>(() => loadJobs());

  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { saveJobs(jobs); }, [jobs]);

  // Signature subtle gradient background
  const headerBg = "bg-gradient-primary";

  // Fetch available times
  async function fetchSlots() {
    setLoadingSlots(true);
    try {
      const res = await fetch(ENDPOINTS[sport]);
      if (!res.ok) throw new Error("No se pudieron cargar horarios");
      const data: string[] = await res.json();
      const selectedDate = new Date(date + "T00:00:00");
      const filtered = data.filter((iso) => {
        const d = parseISO(iso);
        const inMadrid = toZonedTime(d, TZ);
        return isSameDay(inMadrid, selectedDate);
      });
      setSlots(filtered);
    } catch (e: any) {
      toast({ title: "Error cargando horarios", description: e?.message ?? "Inténtalo de nuevo" });
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    // Auto cargar al entrar
    fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, date]);

  // Booking
  async function bookNow(startISO: string, chosenSport: Sport) {
    // Validate settings
    if (!settings.email || !settings.nom || !settings.lastName || !settings.localitat || !settings.telefon) {
      toast({ title: "Completa tus ajustes", description: "Rellena email, nombre, apellidos, localitat y teléfono" });
      return;
    }
    const duration = DURATIONS[chosenSport];
    const endISO = addMinutes(parseISO(startISO), duration).toISOString();

    const isPadel = chosenSport === "padel";

    const body = {
      organization: 130103,
      timezone: TZ,
      email: settings.email,
      fields: {
        nom: settings.nom,
        "last-name": settings.lastName,
        localitat: settings.localitat,
        telefon: settings.telefon,
      },
      bookable: isPadel ? 194780 : 195640,
      service: isPadel ? 570818 : 570852,
      start: parseISO(startISO).toISOString(),
      end: endISO,
    } as const;

    try {
      const res = await fetch("https://api.appointlet.com/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }
      const payload: BookingResponse = await res.json();
      const updated = [payload, ...loadBookings()];
      saveBookings(updated);
      toast({ title: "Reserva confirmada", description: "La verás en Mis reservas" });
      // refresh list implicitly
    } catch (e: any) {
      toast({ title: "No se pudo reservar", description: e?.message ?? "Revisa los datos" });
    }
  }

  // Load bookings for list
  const bookings = useMemo(() => loadBookings(), [slots, settings]);

  // Programar reserva (local – requiere app abierta)
  function scheduleJob(s: Sport, desiredStartISO: string, scheduleAtISO: string) {
    const job: ScheduledJob = {
      id: Math.random().toString(36).slice(2),
      sport: s,
      desiredStart: desiredStartISO,
      scheduleAt: scheduleAtISO,
    };
    setJobs((prev) => [job, ...prev]);
    toast({ title: "Programación creada", description: "La app intentará reservar automáticamente" });
  }

  // Runner para trabajos locales mientras la app está abierta
  useEffect(() => {
    const timers: number[] = [];
    const now = Date.now();
    jobs.forEach((job) => {
      const runAt = new Date(job.scheduleAt).getTime();
      const delay = Math.max(0, runAt - now);
      const t = window.setTimeout(async () => {
        await bookNow(job.desiredStart, job.sport);
        // Remove job after attempt
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      }, delay);
      timers.push(t);
    });
    return () => { timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.length]);

  // Helpers
  const todayISO = format(new Date(), "yyyy-MM-dd");
  const maxDateISO = format(addMinutes(new Date(), 60 * 24 * 2), "yyyy-MM-dd");

  return (
    <main className="min-h-screen">
      <header className={`${headerBg} py-10 text-center text-primary-foreground`}>
        <h1 className="text-3xl font-bold">Reserva Pistas Pádel y Frontenis</h1>
        <p className="opacity-90 mt-1">Ajuntament d'Estivella</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button variant="hero" onClick={() => document.getElementById("tab-reservar")?.click()}>Reservar ahora</Button>
          <Button variant="outline" onClick={() => document.getElementById("tab-programar")?.click()}>Programar</Button>
        </div>
      </header>

      <div className="container py-6">
        <Tabs defaultValue="reservar" className="w-full">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger id="tab-reservar" value="reservar">Reservar</TabsTrigger>
            <TabsTrigger id="tab-programar" value="programar">Programar</TabsTrigger>
            <TabsTrigger value="mis-reservas">Mis reservas</TabsTrigger>
            <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          </TabsList>

          <TabsContent value="reservar" className="mt-4">
            <Card className="card-surface">
              <CardHeader>
                <CardTitle>Reserva online</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Tipo de pista</Label>
                    <Select value={sport} onValueChange={(v) => setSport(v as Sport)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padel">Pádel (90 min)</SelectItem>
                        <SelectItem value="frontenis">Frontenis (60 min)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fecha</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={todayISO} max={maxDateISO} />
                    <p className="text-xs text-muted-foreground mt-1">Máximo 2 días desde hoy</p>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={fetchSlots} disabled={loadingSlots}>{loadingSlots ? "Cargando..." : "Actualizar"}</Button>
                  </div>
                </div>

                <section>
                  <h3 className="font-medium mb-2">Horarios disponibles</h3>
                  {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay horarios disponibles para la fecha seleccionada.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {slots.map((iso) => {
                        const label = formatInTimeZone(parseISO(iso), TZ, "HH:mm");
                        return (
                          <Button key={iso} variant="secondary" onClick={() => bookNow(iso, sport)}>
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="programar" className="mt-4">
            <Card className="card-surface">
              <CardHeader>
                <CardTitle>Programar reserva (experimental)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Esta programación funciona sólo con la app abierta. Para programación fiable en segundo plano, conecta Supabase.
                </p>
                <ProgramarForm onSchedule={scheduleJob} />

                <section className="pt-2">
                  <h3 className="font-medium mb-2">Programaciones activas</h3>
                  {jobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay programaciones.</p>
                  ) : (
                    <ul className="space-y-2">
                      {jobs.map((j) => (
                        <li key={j.id} className="flex items-center justify-between rounded-md border p-3">
                          <div>
                            <p className="text-sm font-medium">{j.sport === "padel" ? "Pádel" : "Frontenis"} → {formatInTimeZone(parseISO(j.desiredStart), TZ, "dd/MM HH:mm")}</p>
                            <p className="text-xs text-muted-foreground">Se intentará a las {formatInTimeZone(parseISO(j.scheduleAt), TZ, "dd/MM HH:mm")} (hora local)</p>
                          </div>
                          <Button variant="ghost" onClick={() => setJobs((prev) => prev.filter((x) => x.id !== j.id))}>Cancelar</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </CardContent>
            </Card>

            <div className="mt-3 text-sm">
              <a className="underline" href="https://docs.lovable.dev/integrations/supabase/" target="_blank" rel="noreferrer">Cómo activar Supabase para programar de verdad</a>
            </div>
          </TabsContent>

          <TabsContent value="mis-reservas" className="mt-4">
            <Card className="card-surface">
              <CardHeader>
                <CardTitle>Mis reservas</CardTitle>
              </CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no hay reservas.</p>
                ) : (
                  <ul className="space-y-3">
                    {bookings.map((b) => (
                      <li key={b.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <p className="font-medium text-sm">{b.service?.name ?? "Reserva"}</p>
                          <p className="text-xs text-muted-foreground">{formatInTimeZone(parseISO(b.start), TZ, "dd/MM HH:mm")} - {formatInTimeZone(parseISO(b.end), TZ, "HH:mm")} ({b.timezone})</p>
                        </div>
                        <a href={b.url} target="_blank" rel="noreferrer">
                          <Button variant="outline">Ver</Button>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ajustes" className="mt-4">
            <Card className="card-surface">
              <CardHeader>
                <CardTitle>Ajustes</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
                </div>
                <div>
                  <Label>Nombre</Label>
                  <Input value={settings.nom} onChange={(e) => setSettings({ ...settings, nom: e.target.value })} />
                </div>
                <div>
                  <Label>Apellidos</Label>
                  <Input value={settings.lastName} onChange={(e) => setSettings({ ...settings, lastName: e.target.value })} />
                </div>
                <div>
                  <Label>Localitat</Label>
                  <Input value={settings.localitat} onChange={(e) => setSettings({ ...settings, localitat: e.target.value })} />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input type="tel" value={settings.telefon} onChange={(e) => setSettings({ ...settings, telefon: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => toast({ title: "Ajustes guardados" })}>Guardar</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

function ProgramarForm({ onSchedule }: { onSchedule: (sport: Sport, desiredStartISO: string, scheduleAtISO: string) => void }) {
  const [sport, setSport] = useState<Sport>("padel");
  const [date, setDate] = useState<string>(() => format(addMinutes(new Date(), 60 * 24 * 2), "yyyy-MM-dd"));
  const [time, setTime] = useState("06:00");
  const [scheduleDate, setScheduleDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [scheduleTime, setScheduleTime] = useState("00:00");

  const desiredStartISO = useMemo(() => {
    // Date chosen interpreted in Madrid TZ, then convert to Z
    const localString = `${date}T${time}:00`;
    const z = new Date(localString);
    return z.toISOString();
  }, [date, time]);

  const scheduleAtISO = useMemo(() => {
    const localString = `${scheduleDate}T${scheduleTime}:00`;
    const z = new Date(localString);
    return z.toISOString();
  }, [scheduleDate, scheduleTime]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <Label>Tipo de pista</Label>
        <Select value={sport} onValueChange={(v) => setSport(v as Sport)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="padel">Pádel (90 min)</SelectItem>
            <SelectItem value="frontenis">Frontenis (60 min)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Fecha/hora deseada</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Recomendado elegir el día actual + 2</p>
      </div>
      <div>
        <Label>Programar a las</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
        </div>
      </div>
      <div className="sm:col-span-3">
        <Button variant="hero" onClick={() => onSchedule(sport, desiredStartISO, scheduleAtISO)}>Programar</Button>
      </div>
    </div>
  );
}

export default Index;

