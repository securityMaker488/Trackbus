"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  HashRouter,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { Dialog } from "radix-ui";
import { Toaster, toast } from "sonner";
import {
  LayoutDashboard,
  Radio,
  Route as RouteIcon,
  Users,
  BusFront,
  CalendarDays,
  Bell,
  ShieldCheck,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Plus,
  Search,
  Clock,
  MapPin,
  ArrowRight,
  Play,
  Pause,
  Check,
  CheckCircle2,
  TriangleAlert,
  Activity,
  Download,
  Navigation,
  Menu,
  X,
  LogOut,
  Wrench,
  Wallet,
  BarChart3,
  GraduationCap,
  UserRound,
  FlaskConical,
  RefreshCw,
  Footprints,
  Copy,
  Trash2,
  Satellite,
  CalendarCheck,
  Shield,
  type LucideIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MapView, { BusIcon } from "./Map";
import type { State, Trip, Route } from "../../packages/shared/types";
import {
  transitions,
  type Role,
  type Stop,
  type Point,
  project,
} from "../../packages/domain";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    `/api${path}`,
    body === undefined
      ? { credentials: "same-origin", cache: "no-store" }
      : {
          method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir");
  return data as T;
}
const statusLabels: Record<string, string> = {
  scheduled: "Programada",
  in_progress: "Em andamento",
  paused: "Pausada",
  interrupted: "Interrompida",
  completed: "Concluída",
  cancelled: "Cancelada",
  available: "Disponível",
  maintenance: "Manutenção",
  inactive: "Inativo",
  active: "Ativo",
  open: "Aberta",
  resolved: "Resolvida",
  preventive: "Preventiva",
  corrective: "Corretiva",
  fuel: "Combustível",
  service: "Serviços",
  other: "Outros",
  delay: "Atraso",
  mechanical: "Pane mecânica",
  traffic: "Trânsito",
  interruption: "Interrupção",
  resumed: "Retomada",
  information: "Informação",
  assistance: "Assistência",
};
const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  driver: "Motorista",
  student: "Aluno",
  guardian: "Responsável",
  monitor: "Monitor",
};
const time = (n: number | null) =>
  n
    ? new Date(n).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Bahia",
      })
    : "—";
const date = (n: number) =>
  new Date(n).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Bahia",
  });
const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const today = () => new Date(Date.now() - 10800000).toISOString().slice(0, 10);
function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${status || ""}`}>
      <span />
      {children || statusLabels[status || ""] || status}
    </span>
  );
}
function Empty({
  text = "Nenhum registro encontrado.",
  icon: Icon = Search,
}: {
  text?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <strong>{text}</strong>
      <span>Os registros aparecerão aqui quando forem adicionados.</span>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "wide" : ""}`}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {subtitle || "Preencha os dados abaixo."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Fechar">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
};
type FormSpec = {
  title: string;
  subtitle?: string;
  fields: Field[];
  path: string;
  method?: string;
  transform?: (data: Record<string, string>) => unknown;
};
function RecordForm({
  spec,
  onClose,
  onSaved,
}: {
  spec: FormSpec;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      spec.fields.map((f) => [
        f.name,
        String(
          f.value ?? (f.required === false ? "" : f.options?.[0]?.value) ?? "",
        ),
      ]),
    ),
  });
  return (
    <Modal title={spec.title} subtitle={spec.subtitle} onClose={onClose}>
      <form
        onSubmit={handleSubmit(async (data) => {
          try {
            await api(
              spec.path,
              spec.transform ? spec.transform(data) : data,
              spec.method,
            );
            toast.success("Registro salvo");
            onSaved();
            onClose();
          } catch (e) {
            toast.error((e as Error).message);
          }
        })}
      >
        <div className="form-grid">
          {spec.fields.map((f) => (
            <label key={f.name} className={f.type === "textarea" ? "full" : ""}>
              {f.label}
              {f.options ? (
                <select
                  aria-label={f.label}
                  aria-invalid={Boolean(errors[f.name])}
                  {...register(f.name, { required: f.required !== false })}
                >
                  {f.required === false && (
                    <option value="">Não informado</option>
                  )}
                  {f.options.map((o) => (
                    <option value={o.value} key={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  aria-invalid={Boolean(errors[f.name])}
                  rows={3}
                  {...register(f.name, { required: f.required !== false })}
                />
              ) : (
                <input
                  aria-label={f.label}
                  aria-invalid={Boolean(errors[f.name])}
                  type={f.type || "text"}
                  step={f.type === "number" ? "any" : undefined}
                  min={f.min}
                  max={f.max}
                  {...register(f.name, { required: f.required !== false })}
                />
              )}
              {errors[f.name] && (
                <small role="alert">Preencha este campo.</small>
              )}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando…" : "Salvar registro"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Stats({
  items,
}: {
  items: {
    label: string;
    value: ReactNode;
    detail: string;
    icon: LucideIcon;
    accent?: boolean;
  }[];
}) {
  return (
    <div className="stats-grid">
      {items.map(({ label, value, detail, icon: Icon, accent }) => (
        <div className={`stat ${accent ? "accent" : ""}`} key={label}>
          <div className="stat-title">
            {label}
            <span className="stat-icon">
              <Icon size={19} />
            </span>
          </div>
          <strong>{value}</strong>
          <span className="stat-detail">{detail}</span>
        </div>
      ))}
    </div>
  );
}
const menu: {
  path: string;
  label: string;
  icon: LucideIcon;
  section: string;
  roles: Role[];
}[] = [
  {
    path: "/",
    label: "Visão geral",
    icon: LayoutDashboard,
    section: "OPERAÇÃO",
    roles: ["admin"],
  },
  {
    path: "/map",
    label: "Monitoramento",
    icon: Radio,
    section: "OPERAÇÃO",
    roles: ["admin", "driver", "monitor", "student", "guardian"],
  },
  {
    path: "/trips",
    label: "Viagens",
    icon: Navigation,
    section: "OPERAÇÃO",
    roles: ["admin", "driver", "monitor"],
  },
  {
    path: "/routes",
    label: "Rotas e paradas",
    icon: RouteIcon,
    section: "OPERAÇÃO",
    roles: ["admin"],
  },
  {
    path: "/notices",
    label: "Central de avisos",
    icon: Bell,
    section: "OPERAÇÃO",
    roles: ["admin", "driver", "student", "guardian", "monitor"],
  },
  {
    path: "/incidents",
    label: "Ocorrências",
    icon: TriangleAlert,
    section: "OPERAÇÃO",
    roles: ["admin", "driver", "monitor"],
  },
  {
    path: "/vehicles",
    label: "Veículos",
    icon: BusFront,
    section: "GESTÃO",
    roles: ["admin"],
  },
  {
    path: "/drivers",
    label: "Motoristas",
    icon: UserRound,
    section: "GESTÃO",
    roles: ["admin"],
  },
  {
    path: "/students",
    label: "Alunos e responsáveis",
    icon: GraduationCap,
    section: "GESTÃO",
    roles: ["admin", "guardian", "student"],
  },
  {
    path: "/boarding",
    label: "Embarques",
    icon: CalendarCheck,
    section: "GESTÃO",
    roles: ["admin", "monitor", "guardian", "student"],
  },
  {
    path: "/calendar",
    label: "Calendário",
    icon: CalendarDays,
    section: "GESTÃO",
    roles: ["admin", "guardian", "student", "driver"],
  },
  {
    path: "/maintenance",
    label: "Manutenção",
    icon: Wrench,
    section: "GESTÃO",
    roles: ["admin"],
  },
  {
    path: "/expenses",
    label: "Despesas",
    icon: Wallet,
    section: "GESTÃO",
    roles: ["admin"],
  },
  {
    path: "/reports",
    label: "Relatórios",
    icon: BarChart3,
    section: "ANÁLISE",
    roles: ["admin"],
  },
  {
    path: "/audit",
    label: "Auditoria",
    icon: ShieldCheck,
    section: "ANÁLISE",
    roles: ["admin"],
  },
  {
    path: "/settings",
    label: "Configurações",
    icon: Settings,
    section: "ANÁLISE",
    roles: ["admin"],
  },
];
export default function TrackBus() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if ("serviceWorker" in navigator && location.protocol === "https:")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      {mounted ? (
        <HashRouter>
          <App />
        </HashRouter>
      ) : (
        <div className="splash">
          <BusIcon size={44} />
          <strong>TrackBus</strong>
          <span>Conectando sua operação…</span>
        </div>
      )}
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
function App() {
  const qc = useQueryClient(),
    nav = useNavigate(),
    location = useLocation(),
    [mobile, setMobile] = useState(false),
    [form, setForm] = useState<FormSpec | null>(null),
    [routeEdit, setRouteEdit] = useState<Route | "new" | null>(null),
    [tripId, setTripId] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ actor?: State["actor"]; needsSetup?: boolean; identity?: string }>(
        "/me",
      ),
    retry: false,
  });
  const state = useQuery({
    queryKey: ["state"],
    queryFn: () => api<State>("/state"),
    enabled: Boolean(me.data?.actor),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["state"] });
  };
  const act = async (path: string, body: unknown = {}) => {
    try {
      await api(path, body);
      refresh();
      toast.success("Operação registrada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  useEffect(() => {
    setSearch("");
    setFilter("all");
    setMobile(false);
  }, [location.pathname]);
  useEffect(() => {
    if (
      state.data &&
      state.data.actor.role !== "admin" &&
      location.pathname === "/"
    )
      nav("/map", { replace: true });
  }, [state.data?.actor.role, location.pathname, nav]);
  if (me.isPending)
    return (
      <div className="splash">
        <BusIcon size={44} />
        <strong>TrackBus</strong>
        <span>Conectando sua operação…</span>
      </div>
    );
  if (me.error || me.data?.needsSetup)
    return (
      <div className="welcome">
        <div className="welcome-copy">
          <div className="brand">
            <span>
              <BusIcon />
            </span>
            trackbus<span className="brand-period">.</span>
          </div>
          <span className="eyebrow">MOBILIDADE ESCOLAR INTELIGENTE</span>
          <h1>
            Cada trajeto.
            <br />
            Mais próximo.
          </h1>
          <p>
            Uma operação conectada. Da primeira parada ao último desembarque,
            acompanhe o que importa.
          </p>
          <div className="welcome-features">
            <span>
              <Radio /> Acompanhamento de viagens
            </span>
            <span>
              <ShieldCheck /> Acesso por instituição
            </span>
            <span>
              <RouteIcon /> Rotas e paradas organizadas
            </span>
          </div>
          {me.data?.needsSetup ? (
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await api("/bootstrap", {});
                  await qc.invalidateQueries({ queryKey: ["me"] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Abrir demonstração <ArrowRight size={18} />
            </button>
          ) : (
            <a
              className="button primary"
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
            >
              Entrar com sua conta <ArrowRight size={18} />
            </a>
          )}
          <small>FECT & Congretech · Dados fictícios · Acesso privado</small>
        </div>
        <div className="welcome-art">
          <div className="orb">
            <BusIcon size={130} />
          </div>
          <span className="orbit one" />
          <span className="orbit two" />
          <div className="welcome-float">
            <span className="live-dot" /> Sua operação, em um só lugar.
          </div>
        </div>
        <footer>TRACKBUS / I.SEE TECHNOLOGIES</footer>
      </div>
    );
  if (!state.data)
    return (
      <div className="splash">
        <RefreshCw className="spin" />
        <strong>
          {state.error
            ? "Falha ao carregar a operação"
            : "Carregando sua instituição…"}
        </strong>
        {state.error && (
          <>
            <p>{state.error.message}</p>
            <button className="button primary" onClick={() => state.refetch()}>
              Tentar novamente
            </button>
          </>
        )}
      </div>
    );
  const d = state.data,
    admin = d.actor.role === "admin",
    role = d.actor.role,
    navItems = menu.filter((m) => m.roles.includes(role)),
    page = navItems.find((m) => m.path === location.pathname) || navItems[0],
    path = page.path,
    unread = d.notices.filter((n) => !n.read).length,
    selectedTrip = d.trips.find((t) => t.id === tripId),
    tripOpts = d.trips
      .filter((t) => !["completed", "cancelled"].includes(t.status))
      .map((t) => ({ value: t.id, label: t.name })),
    vehicleOpts = d.vehicles.map((v) => ({
      value: v.id,
      label: `${v.name} · ${v.plate}`,
    })),
    routeOpts = d.routes.map((r) => ({ value: r.id, label: r.name }));
  const openTripForm = () =>
    setForm({
      title: "Programar viagem",
      subtitle: "A escala e a disponibilidade serão verificadas ao salvar.",
      path: "/trips",
      fields: [
        { name: "name", label: "Nome da viagem", value: "Ida · Manhã" },
        { name: "routeId", label: "Rota", options: routeOpts },
        { name: "vehicleId", label: "Veículo", options: vehicleOpts },
        {
          name: "driverId",
          label: "Motorista",
          options: d.drivers
            .filter((x) => x.status === "active")
            .map((x) => ({ value: x.id, label: x.name })),
        },
        {
          name: "plannedStart",
          label: "Início previsto",
          type: "datetime-local",
          value: `${today()}T07:00`,
        },
        {
          name: "plannedEnd",
          label: "Fim previsto",
          type: "datetime-local",
          value: `${today()}T08:00`,
        },
      ],
      transform: (x) => ({
        ...x,
        monitorId: null,
        plannedStart: Date.parse(`${x.plannedStart}:00-03:00`),
        plannedEnd: Date.parse(`${x.plannedEnd}:00-03:00`),
      }),
    });
  const openNotice = (trip?: string) =>
    setForm({
      title: "Avisar passageiros",
      subtitle:
        "Use os controles somente com o veículo parado em segurança. O aviso será visível aos usuários vinculados.",
      path: "/notices",
      fields: [
        { name: "tripId", label: "Viagem", value: trip, options: tripOpts },
        {
          name: "category",
          label: "Categoria",
          options: [
            "delay",
            "mechanical",
            "traffic",
            "interruption",
            "resumed",
            "information",
            "assistance",
          ].map((k) => ({ value: k, label: statusLabels[k] })),
        },
        {
          name: "delayMinutes",
          label: "Atraso estimado (min)",
          type: "number",
          value: 10,
          min: 0,
          max: 120,
        },
        {
          name: "message",
          label: "Mensagem aos passageiros",
          type: "textarea",
          value: d.organization.demo
            ? "Demonstração: atraso estimado de 10 minutos."
            : "",
        },
      ],
      transform: (x) => ({
        ...x,
        delayMinutes: Number(x.delayMinutes),
        simulated: d.organization.demo,
      }),
    });
  const openVehicle = (v?: State["vehicles"][number]) =>
    setForm({
      title: v ? "Editar veículo" : "Adicionar veículo",
      path: v ? `/vehicles/${v.id}` : "/vehicles",
      method: v ? "PUT" : "POST",
      fields: [
        { name: "name", label: "Nome", value: v?.name },
        { name: "plate", label: "Placa (sem hífen)", value: v?.plate },
        { name: "model", label: "Marca e modelo", value: v?.model },
        {
          name: "year",
          label: "Ano",
          type: "number",
          value: v?.year || 2026,
          min: 1980,
          max: 2100,
        },
        {
          name: "capacity",
          label: "Capacidade",
          type: "number",
          value: v?.capacity || 44,
          min: 1,
          max: 100,
        },
        {
          name: "status",
          label: "Situação",
          value: v?.status,
          options: ["available", "maintenance", "inactive"].map((k) => ({
            value: k,
            label: statusLabels[k],
          })),
        },
      ],
      transform: (x) => ({
        ...x,
        plate: x.plate.toUpperCase(),
        year: Number(x.year),
        capacity: Number(x.capacity),
      }),
    });
  const openDriver = (v?: State["drivers"][number]) =>
    setForm({
      title: v ? "Editar motorista" : "Adicionar motorista",
      path: v ? `/drivers/${v.id}` : "/drivers",
      method: v ? "PUT" : "POST",
      fields: [
        { name: "name", label: "Nome", value: v?.name },
        {
          name: "contact",
          label: "Contato autorizado",
          value: v?.contact,
          required: false,
        },
        {
          name: "userId",
          label: "ID da conta vinculada",
          value: v?.userId || "",
          required: false,
        },
        {
          name: "status",
          label: "Situação",
          value: v?.status,
          options: ["active", "inactive"].map((k) => ({
            value: k,
            label: statusLabels[k],
          })),
        },
      ],
      transform: (x) => ({ ...x, userId: x.userId || null }),
    });
  const openStudent = (st?: State["students"][number]) =>
    setForm({
      title: st ? "Editar aluno" : "Adicionar aluno",
      subtitle: "Escolha uma parada que pertença à rota selecionada.",
      path: st ? `/students/${st.id}` : "/students",
      method: st ? "PUT" : "POST",
      fields: [
        { name: "name", label: "Nome", value: st?.name },
        { name: "enrollment", label: "Matrícula", value: st?.enrollment },
        { name: "className", label: "Turma", value: st?.className || "6º ano" },
        {
          name: "shift",
          label: "Turno",
          value: st?.shift,
          options: ["Manhã", "Tarde", "Noite"].map((x) => ({
            value: x,
            label: x,
          })),
        },
        {
          name: "routeId",
          label: "Rota",
          value: st?.routeId,
          options: routeOpts,
        },
        {
          name: "stopId",
          label: "Parada de embarque",
          value: st?.stopId,
          options: d.routes.flatMap((r) =>
            r.stops.map((s) => ({
              value: s.id,
              label: `${r.name} / ${s.name}`,
            })),
          ),
        },
        {
          name: "userId",
          label: "ID da conta do aluno",
          value: st?.userId || "",
          required: false,
        },
        {
          name: "status",
          label: "Situação",
          value: st?.status,
          options: ["active", "inactive"].map((k) => ({
            value: k,
            label: statusLabels[k],
          })),
        },
      ],
      transform: (x) => ({ ...x, userId: x.userId || null }),
    });
  const filtered = <T,>(rows: T[]) =>
    rows.filter((r) =>
      JSON.stringify(r)
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
    );
  const active = d.trips.filter((t) =>
      ["in_progress", "paused", "interrupted"].includes(t.status),
    ),
    positions = d.locations
      .filter((l) => active.some((t) => t.id === l.tripId))
      .map((l) => ({
        id: l.tripId,
        label:
          d.vehicles.find(
            (v) => v.id === d.trips.find((t) => t.id === l.tripId)?.vehicleId,
          )?.name || "Ônibus",
        position: l.position,
      }));
  const newActions: Record<string, () => void> = {
    "/vehicles": () => openVehicle(),
    "/drivers": () => openDriver(),
    "/students": () => openStudent(),
    "/routes": () => setRouteEdit("new"),
    "/trips": openTripForm,
    "/notices": () => openNotice(),
    "/calendar": () =>
      setForm({
        title: "Evento do calendário",
        path: "/calendar",
        fields: [
          { name: "title", label: "Título" },
          { name: "date", label: "Data", type: "date", value: today() },
          {
            name: "suspended",
            label: "Transporte",
            options: [
              { value: "false", label: "Dia letivo" },
              { value: "true", label: "Transporte suspenso" },
            ],
          },
        ],
        transform: (x) => ({ ...x, suspended: x.suspended === "true" }),
      }),
    "/maintenance": () =>
      setForm({
        title: "Registrar manutenção",
        path: "/maintenance",
        fields: [
          { name: "vehicleId", label: "Veículo", options: vehicleOpts },
          {
            name: "kind",
            label: "Tipo",
            options: [
              { value: "preventive", label: "Preventiva" },
              { value: "corrective", label: "Corretiva" },
            ],
          },
          { name: "date", label: "Data", type: "date", value: today() },
          {
            name: "costCents",
            label: "Custo (R$)",
            type: "number",
            value: 0,
            min: 0,
          },
          { name: "description", label: "Descrição", type: "textarea" },
        ],
        transform: (x) => ({
          ...x,
          costCents: Math.round(Number(x.costCents) * 100),
        }),
      }),
    "/expenses": () =>
      setForm({
        title: "Registrar despesa",
        path: "/expenses",
        fields: [
          { name: "vehicleId", label: "Veículo", options: vehicleOpts },
          {
            name: "category",
            label: "Categoria",
            options: ["fuel", "maintenance", "service", "other"].map((k) => ({
              value: k,
              label: statusLabels[k],
            })),
          },
          { name: "date", label: "Data", type: "date", value: today() },
          {
            name: "amountCents",
            label: "Valor em reais",
            type: "number",
            min: 0.01,
          },
          { name: "description", label: "Descrição", type: "textarea" },
        ],
        transform: (x) => ({
          ...x,
          routeId: null,
          amountCents: Math.round(Number(x.amountCents) * 100),
        }),
      }),
  };
  const listTools = (
    <div className="list-tools">
      <div className="search-input">
        <Search size={17} />
        <input
          placeholder="Buscar registros…"
          aria-label="Buscar registros"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <span>{date(d.serverTime)} · horário da Bahia</span>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <NavLink to="/" className="brand">
          <span>
            <BusIcon />
          </span>
          trackbus<span className="brand-period">.</span>
        </NavLink>
        <div className="organization">
          <span className="school-logo">
            <GraduationCap size={20} />
          </span>
          <div>
            <strong>{d.organization.name}</strong>
            <small>Gestão de transporte</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          {navItems.map((m, i) => (
            <div key={m.path}>
              {i === 0 || navItems[i - 1].section !== m.section ? (
                <div className="nav-section">{m.section}</div>
              ) : null}
              <NavLink
                to={m.path}
                end
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <m.icon size={18} />
                <span>{m.label}</span>
                {m.path === "/notices" && unread > 0 ? (
                  <b className="nav-count">{unread}</b>
                ) : m.path === "/map" ? (
                  <span className="nav-live" />
                ) : null}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Operação protegida</strong>
              <small>Acesso por instituição</small>
            </div>
          </div>
          <span>
            I.SEE TECHNOLOGIES <span>↗</span>
          </span>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Fechar menu"
          className="sidebar-scrim"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page.label}</strong>
          </div>
          <div className="top-actions">
            <span className={`connection ${state.error ? "lost" : ""}`}>
              <span />
              {state.error ? "Conexão perdida" : "Sincronizado"}
            </span>
            <button
              className="icon-button bell-button"
              aria-label="Abrir avisos"
              onClick={() => nav("/notices")}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <span className="top-divider" />
            <span className="avatar">
              {d.actor.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="profile-select">
              <strong>{d.actor.name}</strong>
              {d.organization.demo ? (
                <select
                  aria-label="Perfil de demonstração"
                  value={role}
                  onChange={async (e) => {
                    try {
                      await api("/demo/profile", { role: e.target.value });
                      await qc.invalidateQueries({ queryKey: ["me"] });
                      await qc.invalidateQueries({ queryKey: ["state"] });
                      nav(e.target.value === "admin" ? "/" : "/map");
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <small>{roleLabels[role]}</small>
              )}
            </div>
          </div>
        </header>
        <main>
          <div className="demo-banner">
            <FlaskConical size={15} />
            <strong>Modo demonstração</strong>
            <span>
              FECT & Congretech · Dados fictícios. Posições simuladas
              identificadas no mapa.
            </span>
            <span className="demo-pill">AMBIENTE ISOLADO</span>
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {path === "/" ? "CENTRAL DE OPERAÇÕES" : page.section}
              </span>
              <h1>
                {path === "/" ? "Sua operação, em movimento." : page.label}
              </h1>
              <p>
                {path === "/"
                  ? "Acompanhe cada rota. Cuide de cada chegada."
                  : path === "/map"
                    ? "Acompanhe as viagens autorizadas e a última posição recebida."
                    : path === "/routes"
                      ? "Conecte pontos, organize percursos e preserve cada itinerário."
                      : "Informações conectadas à operação da sua instituição."}
              </p>
            </div>
            <div className="heading-actions">
              {path === "/" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => nav("/reports")}
                  >
                    <Download size={16} /> Relatórios
                  </button>
                  <button className="button primary" onClick={openTripForm}>
                    <Plus size={17} /> Programar viagem
                  </button>
                </>
              ) : newActions[path] &&
                (admin || (path === "/notices" && role === "driver")) ? (
                <button className="button primary" onClick={newActions[path]}>
                  <Plus size={17} />
                  {path === "/trips"
                    ? "Programar viagem"
                    : path === "/notices"
                      ? "Novo aviso"
                      : path === "/routes"
                        ? "Criar rota"
                        : "Adicionar registro"}
                </button>
              ) : null}
            </div>
          </div>
          {state.error && (
            <div className="error-banner">
              <TriangleAlert size={18} /> Não foi possível atualizar. Exibindo a
              última resposta recebida.
              <button onClick={() => state.refetch()}>Reconectar</button>
            </div>
          )}
          {path === "/" && (
            <>
              <Stats
                items={[
                  {
                    label: "Veículos em operação",
                    value: String(active.length).padStart(2, "0"),
                    detail: `${d.vehicles.length} veículos na frota`,
                    icon: BusFront,
                    accent: true,
                  },
                  {
                    label: "Alunos cadastrados",
                    value: String(
                      d.students.filter((s) => s.status === "active").length,
                    ).padStart(2, "0"),
                    detail: `${d.routes.length} rotas conectadas`,
                    icon: GraduationCap,
                  },
                  {
                    label: "Viagens hoje",
                    value: String(
                      d.trips.filter(
                        (t) =>
                          new Date(t.plannedStart).toDateString() ===
                          new Date(d.serverTime).toDateString(),
                      ).length,
                    ).padStart(2, "0"),
                    detail: `${d.trips.filter((t) => t.status === "completed").length} concluídas no histórico`,
                    icon: Navigation,
                  },
                  {
                    label: "Ocorrências abertas",
                    value: String(
                      d.incidents.filter((i) => i.status === "open").length,
                    ).padStart(2, "0"),
                    detail: d.incidents.some((i) => i.status === "open")
                      ? "Acompanhamento necessário"
                      : "Nenhuma ocorrência em aberto",
                    icon: ShieldCheck,
                  },
                ]}
              />
              <div className="dashboard-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Monitoramento da frota{" "}
                        <span className="live-label">
                          <span /> ATUALIZAÇÃO · 5S
                        </span>
                      </h2>
                      <p>Uma visão completa dos trajetos em operação</p>
                    </div>
                    <button className="text-button" onClick={() => nav("/map")}>
                      Expandir mapa <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <MapView
                    routes={active.map((t) => t.snapshot)}
                    positions={positions}
                  />
                  <div className="map-footer">
                    <span>
                      <i className="dot green" />
                      {active.length} viagens ativas
                    </span>
                    <span>
                      <i className="dot yellow" />
                      {
                        d.trips.filter(
                          (t) => (t.delayUntil || 0) > d.serverTime,
                        ).length
                      }{" "}
                      com atraso informado
                    </span>
                    <span>
                      <i className="dot gray" />
                      {
                        d.locations.filter(
                          (l) => d.serverTime - l.position.timestamp > 60000,
                        ).length
                      }{" "}
                      posições desatualizadas
                    </span>
                  </div>
                </section>
                <section className="panel active-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Viagens em curso</h2>
                      <p>Acompanhe os próximos passos</p>
                    </div>
                    <span className="number-tag">{active.length}</span>
                  </div>
                  <div className="active-trips">
                    {active.length ? (
                      active.map((t, i) => (
                        <TripCard
                          key={t.id}
                          trip={t}
                          d={d}
                          index={i}
                          onClick={() => setTripId(t.id)}
                        />
                      ))
                    ) : (
                      <Empty text="Nenhuma viagem em curso" icon={BusFront} />
                    )}
                  </div>
                  <button className="panel-link" onClick={() => nav("/trips")}>
                    Ver todas as viagens <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="dashboard-bottom">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Programação de viagens</h2>
                      <p>Itinerários e horários da operação</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => nav("/trips")}
                    >
                      Ver programação <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <TripTable
                    trips={d.trips.slice(0, 4)}
                    d={d}
                    onSelect={setTripId}
                  />
                </section>
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <h2>Últimas atividades</h2>
                    <Activity size={17} />
                  </div>
                  {d.events.slice(0, 4).map((e, i) => (
                    <div className="activity-item" key={e.id}>
                      <span
                        className={`activity-icon ${i === 0 ? "yellow-bg" : ""}`}
                      >
                        <Check size={14} />
                      </span>
                      <div>
                        <strong>{e.message}</strong>
                        <small>
                          {time(e.createdAt)} ·{" "}
                          {e.simulated ? "Demonstração" : "Operação"}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!d.events.length && <Empty text="Nenhuma atividade" />}
                </section>
              </div>
            </>
          )}
          {path === "/map" && (
            <>
              {role === "student" || role === "guardian" ? (
                <Portal d={d} refresh={refresh} />
              ) : (
                <div className="monitor-layout">
                  <div className="panel">
                    <MapView
                      large
                      routes={d.trips
                        .filter(
                          (t) => !["completed", "cancelled"].includes(t.status),
                        )
                        .map((t) => t.snapshot)}
                      positions={positions}
                    />
                  </div>
                  <div className="panel">
                    <div className="panel-heading">
                      <h2>Viagens autorizadas</h2>
                      <Badge>{d.trips.length}</Badge>
                    </div>
                    {d.trips.map((t, i) => (
                      <TripCard
                        key={t.id}
                        trip={t}
                        d={d}
                        index={i}
                        onClick={() => setTripId(t.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {path === "/trips" && (
            <section className="panel">
              {listTools}
              <div className="tabs">
                {[
                  "all",
                  "scheduled",
                  "in_progress",
                  "completed",
                  "cancelled",
                ].map((s) => (
                  <button
                    key={s}
                    className={filter === s ? "selected" : ""}
                    onClick={() => setFilter(s)}
                  >
                    {s === "all" ? "Todas" : statusLabels[s]}
                  </button>
                ))}
              </div>
              <TripTable
                trips={filtered(d.trips).filter(
                  (t) => filter === "all" || t.status === filter,
                )}
                d={d}
                onSelect={setTripId}
              />
            </section>
          )}
          {path === "/routes" && (
            <>
              {listTools}
              <div className="route-grid">
                {filtered(d.routes).map((r, i) => (
                  <section className="panel route-card" key={r.id}>
                    <div className="route-card-top">
                      <span className="route-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Badge status={r.active ? "active" : "inactive"} />
                    </div>
                    <h2>{r.name}</h2>
                    <p>{r.description}</p>
                    <div className="route-line">
                      <span />
                      {r.stops[0]?.name}
                      <ArrowRight size={16} />
                      {r.stops.at(-1)?.name}
                      <span />
                    </div>
                    <div className="route-meta">
                      <span>
                        <MapPin size={15} />
                        {r.stops.length} paradas
                      </span>
                      <span>
                        <Clock size={15} />
                        {r.shift}
                      </span>
                      <span>v{r.version}</span>
                    </div>
                    <div className="route-card-actions">
                      <button
                        className="text-button"
                        disabled={!d.routingConfigured}
                        title={
                          d.routingConfigured
                            ? "Calcular com Valhalla"
                            : "Provedor geográfico não configurado"
                        }
                        onClick={() => act(`/routes/${r.id}/calculate`)}
                      >
                        {r.routed ? "Recalcular vias" : "Calcular vias"}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => setRouteEdit(r)}
                      >
                        Editar itinerário <ArrowUpRight size={15} />
                      </button>
                      <button
                        className="icon-button"
                        title="Duplicar rota"
                        onClick={async () => {
                          await act("/routes", {
                            name: `${r.name} · cópia`,
                            description: r.description,
                            shift: r.shift,
                            stops: r.stops.map((st) => ({
                              ...st,
                              id: crypto.randomUUID(),
                            })),
                            active: true,
                          });
                        }}
                      >
                        <Copy size={17} />
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              {!d.routes.length && <Empty text="Cadastre sua primeira rota" />}
            </>
          )}
          {path === "/vehicles" && (
            <>
              <Stats
                items={[
                  {
                    label: "Frota cadastrada",
                    value: d.vehicles.length,
                    detail: "Veículos da instituição",
                    icon: BusFront,
                    accent: true,
                  },
                  {
                    label: "Disponíveis",
                    value: d.vehicles.filter((v) => v.status === "available")
                      .length,
                    detail: "Situação operacional disponível",
                    icon: CheckCircle2,
                  },
                  {
                    label: "Em manutenção",
                    value: d.vehicles.filter((v) => v.status === "maintenance")
                      .length,
                    detail: "Indisponíveis para novas viagens",
                    icon: Wrench,
                  },
                  {
                    label: "Capacidade total",
                    value: d.vehicles.reduce((a, v) => a + v.capacity, 0),
                    detail: "Assentos cadastrados",
                    icon: Users,
                  },
                ]}
              />
              <section className="panel">
                {listTools}
                <DataTable
                  headers={[
                    "Veículo",
                    "Placa",
                    "Modelo / ano",
                    "Capacidade",
                    "Situação",
                    "",
                  ]}
                  rows={filtered(d.vehicles).map((v) => [
                    <div className="cell-identity">
                      <span className="cell-icon">
                        <BusFront size={20} />
                      </span>
                      <strong>{v.name}</strong>
                    </div>,
                    <code>{v.plate}</code>,
                    `${v.model} · ${v.year}`,
                    `${v.capacity} lugares`,
                    <Badge status={v.status} />,
                    <button
                      className="text-button"
                      onClick={() => openVehicle(v)}
                    >
                      Editar <ArrowUpRight size={15} />
                    </button>,
                  ])}
                />
              </section>
            </>
          )}
          {path === "/drivers" && (
            <section className="panel">
              {listTools}
              <DataTable
                headers={[
                  "Motorista",
                  "Contato autorizado",
                  "Viagens atribuídas",
                  "Situação",
                  "",
                ]}
                rows={filtered(d.drivers).map((v) => [
                  <div className="cell-identity">
                    <span className="avatar">
                      {v.name
                        .split(" ")
                        .map((x) => x[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <strong>{v.name}</strong>
                  </div>,
                  v.contact || "Não informado",
                  d.trips.filter((t) => t.driverId === v.id).length,
                  <Badge status={v.status} />,
                  <button className="text-button" onClick={() => openDriver(v)}>
                    Editar <ArrowUpRight size={15} />
                  </button>,
                ])}
              />
            </section>
          )}
          {path === "/students" && (
            <section className="panel">
              {listTools}
              <DataTable
                headers={[
                  "Aluno",
                  "Matrícula / turma",
                  "Rota",
                  "Parada",
                  "Situação",
                  "",
                ]}
                rows={filtered(d.students).map((st) => [
                  <div className="cell-identity">
                    <span className="avatar soft">{st.name.slice(0, 1)}</span>
                    <strong>{st.name}</strong>
                  </div>,
                  <div>
                    {st.enrollment}
                    <small>
                      {st.className} · {st.shift}
                    </small>
                  </div>,
                  d.routes.find((r) => r.id === st.routeId)?.name,
                  d.routes
                    .find((r) => r.id === st.routeId)
                    ?.stops.find((p) => p.id === st.stopId)?.name,
                  <Badge status={st.status} />,
                  admin ? (
                    <div className="inline-actions">
                      <button
                        className="text-button"
                        onClick={() => openStudent(st)}
                      >
                        Editar
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          setForm({
                            title: "Vincular responsável",
                            subtitle:
                              "Confirme previamente a relação legal. Este registro declara que a instituição verificou o vínculo.",
                            path: "/guardians",
                            fields: [
                              { name: "name", label: "Nome do responsável" },
                              {
                                name: "userId",
                                label: "ID da conta do responsável",
                              },
                            ],
                            transform: (x) => ({
                              ...x,
                              studentId: st.id,
                              verified: true,
                            }),
                          })
                        }
                      >
                        Vincular
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() =>
                        setForm({
                          title: "Informar ausência",
                          subtitle: "Nenhum motivo sensível será solicitado.",
                          path: "/absences",
                          fields: [
                            {
                              name: "date",
                              label: "Data",
                              type: "date",
                              value: today(),
                            },
                            {
                              name: "shift",
                              label: "Turno",
                              value: st.shift,
                              options: ["Manhã", "Tarde", "Noite"].map((x) => ({
                                value: x,
                                label: x,
                              })),
                            },
                          ],
                          transform: (x) => ({
                            ...x,
                            studentId: st.id,
                            active: true,
                          }),
                        })
                      }
                    >
                      Informar ausência
                    </button>
                  ),
                ])}
              />
              {d.absences.length > 0 && (
                <div className="subsection">
                  <h3>Ausências programadas</h3>
                  {d.absences
                    .filter((a) => a.active)
                    .map((a) => (
                      <div className="line-record" key={a.id}>
                        <span>
                          {d.students.find((s) => s.id === a.studentId)?.name} ·{" "}
                          {a.date} · {a.shift}
                        </span>
                        <button
                          className="text-button"
                          onClick={() =>
                            act("/absences", {
                              studentId: a.studentId,
                              date: a.date,
                              shift: a.shift,
                              active: false,
                            })
                          }
                        >
                          Cancelar ausência
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
          {path === "/notices" && (
            <section className="panel">
              {listTools}
              {filtered(d.notices).length ? (
                filtered(d.notices).map((n) => (
                  <div
                    className={`notice-row ${n.read ? "" : "unread"}`}
                    key={n.id}
                  >
                    <span
                      className={`notice-icon ${n.category === "mechanical" ? "danger" : ""}`}
                    >
                      <Bell size={21} />
                    </span>
                    <div>
                      <div className="notice-title">
                        <strong>{statusLabels[n.category]}</strong>
                        <span>
                          {time(n.createdAt)} · {date(n.createdAt)}
                        </span>
                        {n.simulated && <Badge>SIMULADO</Badge>}
                      </div>
                      <p>{n.message}</p>
                      <small>
                        {d.trips.find((t) => t.id === n.tripId)?.name}
                      </small>
                    </div>
                    {!n.read && (
                      <button
                        className="icon-button"
                        title="Marcar como lido"
                        onClick={() => act(`/notices/${n.id}/read`)}
                      >
                        <Check size={18} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <Empty text="Nenhum aviso por aqui" icon={Bell} />
              )}
            </section>
          )}
          {path === "/incidents" && (
            <section className="panel">
              {listTools}
              {d.incidents.length ? (
                filtered(d.incidents).map((i) => (
                  <div className="notice-row" key={i.id}>
                    <span className="notice-icon danger">
                      <TriangleAlert size={22} />
                    </span>
                    <div>
                      <div className="notice-title">
                        <strong>{statusLabels[i.category]}</strong>
                        <Badge status={i.status} />
                        {i.simulated && <Badge>SIMULADO</Badge>}
                      </div>
                      <p>{i.description}</p>
                      <small>
                        {d.trips.find((t) => t.id === i.tripId)?.name} ·{" "}
                        {date(i.createdAt)} {time(i.createdAt)}
                      </small>
                      {i.resolution && (
                        <p className="resolution">Resolução: {i.resolution}</p>
                      )}
                    </div>
                    {i.status !== "resolved" && role !== "monitor" && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          setForm({
                            title: "Resolver ocorrência",
                            path: `/incidents/${i.id}/resolve`,
                            fields: [
                              {
                                name: "resolution",
                                label: "Como a situação foi resolvida?",
                                type: "textarea",
                              },
                            ],
                          })
                        }
                      >
                        Resolver
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <Empty
                  text="Nenhuma ocorrência registrada"
                  icon={ShieldCheck}
                />
              )}
            </section>
          )}
          {path === "/boarding" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Lista de passageiros</h2>
                  <p>Confirmações manuais por operador autorizado.</p>
                </div>
                <Badge>{d.boarding.length} registros</Badge>
              </div>
              {d.trips
                .filter((t) => ["in_progress", "paused"].includes(t.status))
                .map((t) => (
                  <div className="subsection" key={t.id}>
                    <h3>{t.name}</h3>
                    <DataTable
                      headers={["Aluno", "Embarque", "Desembarque", ""]}
                      rows={d.students
                        .filter((st) => st.routeId === t.routeId)
                        .map((st) => {
                          const board = d.boarding.find(
                              (b) =>
                                b.tripId === t.id &&
                                b.studentId === st.id &&
                                b.kind === "board",
                            ),
                            alight = d.boarding.find(
                              (b) =>
                                b.tripId === t.id &&
                                b.studentId === st.id &&
                                b.kind === "alight",
                            );
                          return [
                            st.name,
                            board ? (
                              <Badge status="completed">
                                {time(board.createdAt)}
                              </Badge>
                            ) : (
                              "Pendente"
                            ),
                            alight ? (
                              <Badge status="completed">
                                {time(alight.createdAt)}
                              </Badge>
                            ) : (
                              "Pendente"
                            ),
                            (admin || role === "monitor") && !alight ? (
                              <button
                                className="button secondary small"
                                onClick={() =>
                                  act("/boarding", {
                                    tripId: t.id,
                                    studentId: st.id,
                                    stopId: board
                                      ? t.snapshot.stops.at(-1)?.id
                                      : st.stopId,
                                    kind: board ? "alight" : "board",
                                  })
                                }
                              >
                                {board
                                  ? "Confirmar desembarque"
                                  : "Confirmar embarque"}
                              </button>
                            ) : null,
                          ];
                        })}
                    />
                  </div>
                ))}
              {!d.trips.some((t) =>
                ["in_progress", "paused"].includes(t.status),
              ) && <Empty text="Sem viagens em operação" />}
            </section>
          )}
          {path === "/calendar" && (
            <div className="dashboard-bottom">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Agenda da instituição</h2>
                  <CalendarDays size={20} />
                </div>
                {d.calendar.length ? (
                  d.calendar.map((c) => (
                    <div className="calendar-row" key={c.id}>
                      <span className="calendar-date">
                        <strong>{c.date.slice(8)}</strong>
                        <small>
                          {c.date.slice(5, 7)} / {c.date.slice(0, 4)}
                        </small>
                      </span>
                      <div>
                        <h3>{c.title}</h3>
                        <Badge status={c.suspended ? "interrupted" : "active"}>
                          {c.suspended ? "Transporte suspenso" : "Dia letivo"}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty
                    text="Nenhuma exceção no calendário"
                    icon={CalendarDays}
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Próximas viagens</h2>
                </div>
                {d.trips
                  .filter((t) => t.status === "scheduled")
                  .map((t) => (
                    <div className="calendar-row" key={t.id}>
                      <span className="calendar-date">
                        <strong>{time(t.plannedStart)}</strong>
                        <small>{date(t.plannedStart)}</small>
                      </span>
                      <div>
                        <h3>{t.name}</h3>
                        <span>
                          {time(t.plannedStart)} — {time(t.plannedEnd)}
                        </span>
                      </div>
                    </div>
                  ))}
              </section>
            </div>
          )}
          {path === "/maintenance" && (
            <section className="panel">
              {listTools}
              <DataTable
                headers={[
                  "Veículo",
                  "Descrição",
                  "Data",
                  "Tipo",
                  "Custo",
                  "Situação",
                  "",
                ]}
                rows={filtered(d.maintenance).map((m) => [
                  d.vehicles.find((v) => v.id === m.vehicleId)?.name,
                  m.description,
                  m.date,
                  statusLabels[m.kind],
                  currency(m.costCents),
                  <Badge status={m.status} />,
                  m.status === "open" ? (
                    <button
                      className="text-button"
                      onClick={() => act(`/maintenance/${m.id}/complete`)}
                    >
                      Concluir serviço <Check size={15} />
                    </button>
                  ) : null,
                ])}
              />
            </section>
          )}
          {path === "/expenses" && (
            <>
              <Stats
                items={[
                  {
                    label: "Despesas registradas",
                    value: currency(
                      d.expenses.reduce((a, e) => a + e.amountCents, 0),
                    ),
                    detail: "Total dos registros disponíveis",
                    icon: Wallet,
                    accent: true,
                  },
                  {
                    label: "Combustível",
                    value: currency(
                      d.expenses
                        .filter((e) => e.category === "fuel")
                        .reduce((a, e) => a + e.amountCents, 0),
                    ),
                    detail: "Abastecimentos registrados",
                    icon: BusFront,
                  },
                  {
                    label: "Manutenção",
                    value: currency(
                      d.expenses
                        .filter((e) => e.category === "maintenance")
                        .reduce((a, e) => a + e.amountCents, 0),
                    ),
                    detail: "Despesas lançadas na categoria",
                    icon: Wrench,
                  },
                  {
                    label: "Lançamentos",
                    value: d.expenses.length,
                    detail: "Controle financeiro operacional",
                    icon: BarChart3,
                  },
                ]}
              />
              <section className="panel">
                {listTools}
                <DataTable
                  headers={[
                    "Descrição",
                    "Veículo",
                    "Categoria",
                    "Data",
                    "Valor",
                  ]}
                  rows={filtered(d.expenses).map((e) => [
                    e.description,
                    d.vehicles.find((v) => v.id === e.vehicleId)?.name,
                    statusLabels[e.category],
                    e.date,
                    <strong>{currency(e.amountCents)}</strong>,
                  ])}
                />
              </section>
            </>
          )}
          {path === "/reports" && (
            <>
              <div className="report-toolbar">
                <span>
                  Indicadores calculados a partir dos registros da instituição.
                </span>
                <a href="/api/reports.csv" className="button primary">
                  <Download size={17} /> Exportar viagens · CSV
                </a>
              </div>
              <Stats
                items={[
                  {
                    label: "Viagens concluídas",
                    value: d.trips.filter((t) => t.status === "completed")
                      .length,
                    detail: "Histórico carregado",
                    icon: CheckCircle2,
                    accent: true,
                  },
                  {
                    label: "Pontualidade",
                    value: d.trips.filter((t) => t.startedAt).length
                      ? `${Math.round((d.trips.filter((t) => t.startedAt && t.startedAt <= t.plannedStart + 60000).length / d.trips.filter((t) => t.startedAt).length) * 100)}%`
                      : "—",
                    detail: "Início até 1 min após o previsto",
                    icon: Clock,
                  },
                  {
                    label: "Embarques confirmados",
                    value: d.boarding.filter((b) => b.kind === "board").length,
                    detail: "Confirmações manuais",
                    icon: Users,
                  },
                  {
                    label: "Esperas registradas",
                    value: d.events.filter((e) => e.type.startsWith("wait:"))
                      .length,
                    detail: "Eventos de espera autorizada",
                    icon: CalendarCheck,
                  },
                ]}
              />
              <div className="dashboard-bottom">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <h2>Viagens por situação</h2>
                    <BarChart3 size={18} />
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={Object.entries(statusLabels)
                        .filter(([k]) => k in transitions)
                        .map(([k, label]) => ({
                          name: label,
                          total: d.trips.filter((t) => t.status === k).length,
                        }))}
                      margin={{ top: 20, right: 25, left: -20, bottom: 20 }}
                    >
                      <CartesianGrid vertical={false} stroke="#eee" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="total"
                        name="Viagens"
                        fill="#facc15"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={46}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Confiabilidade do GPS</h2>
                    <Satellite size={18} />
                  </div>
                  <div className="report-facts">
                    <span>
                      Posições recebidas <strong>{d.locations.length}</strong>
                    </span>
                    <span>
                      Posições recentes (&lt; 60s)
                      <strong>
                        {
                          d.locations.filter(
                            (l) => d.serverTime - l.position.timestamp < 60000,
                          ).length
                        }
                      </strong>
                    </span>
                    <span>
                      Posições simuladas
                      <strong>
                        {
                          d.locations.filter(
                            (l) => l.position.source === "simulation",
                          ).length
                        }
                      </strong>
                    </span>
                    <span>
                      Ocorrências resolvidas
                      <strong>
                        {
                          d.incidents.filter((i) => i.status === "resolved")
                            .length
                        }
                      </strong>
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
          {path === "/audit" && (
            <section className="panel">
              {listTools}
              <DataTable
                headers={["Data / hora", "Ação", "Identificador", "Autor"]}
                rows={filtered(d.audit).map((a) => [
                  `${date(a.createdAt)} · ${time(a.createdAt)}`,
                  a.action,
                  <code className="truncate-id" title={a.entityId}>
                    {a.entityId}
                  </code>,
                  <code className="truncate-id" title={a.actorId}>
                    {a.actorId}
                  </code>,
                ])}
              />
            </section>
          )}
          {path === "/settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <span className="settings-icon">
                  <GraduationCap />
                </span>
                <h2>Instituição</h2>
                <p>{d.organization.name}</p>
                <div className="report-facts">
                  <span>
                    Espera máxima
                    <strong>{d.organization.maxWait / 60} min</strong>
                  </span>
                  <span>
                    Ambiente<strong>Demonstração</strong>
                  </span>
                  <span>
                    Roteamento a pé
                    <strong>
                      {d.routingConfigured ? "Configurado" : "Não configurado"}
                    </strong>
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    setForm({
                      title: "Configurações da instituição",
                      path: "/settings",
                      fields: [
                        {
                          name: "name",
                          label: "Nome",
                          value: d.organization.name,
                        },
                        {
                          name: "maxWait",
                          label: "Espera máxima (segundos)",
                          type: "number",
                          value: d.organization.maxWait,
                          min: 0,
                          max: 300,
                        },
                      ],
                      transform: (x) => ({ ...x, maxWait: Number(x.maxWait) }),
                    })
                  }
                >
                  Editar configurações
                </button>
              </section>
              <section className="panel settings-card">
                <span className="settings-icon">
                  <ShieldCheck />
                </span>
                <h2>Acesso e permissões</h2>
                <p>A identidade autentica. O vínculo institucional autoriza.</p>
                <div className="report-facts">
                  {d.memberships.map((m) => (
                    <span key={m.id}>
                      {m.name}
                      <strong>{roleLabels[m.role]}</strong>
                    </span>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    setForm({
                      title: "Adicionar vínculo de acesso",
                      subtitle:
                        "O usuário precisa também estar autorizado no acesso privado do Site. Vincule o mesmo ID ao cadastro operacional.",
                      path: "/memberships",
                      fields: [
                        { name: "name", label: "Nome" },
                        {
                          name: "userId",
                          label: "Identificador de identidade Sites",
                        },
                        {
                          name: "role",
                          label: "Perfil",
                          options: Object.entries(roleLabels).map(
                            ([value, label]) => ({ value, label }),
                          ),
                        },
                      ],
                    })
                  }
                >
                  Adicionar usuário
                </button>
              </section>
              <section className="panel settings-card">
                <span className="settings-icon">
                  <Shield />
                </span>
                <h2>Privacidade e sessões</h2>
                <p>
                  Posições de alunos não são armazenadas. O cache da PWA não
                  inclui respostas da API.
                </p>
                <button
                  className="button secondary"
                  onClick={() => act("/retention")}
                >
                  Limpar sessões expiradas
                </button>
                <button
                  className="text-button"
                  onClick={async () => {
                    await api("/logout", {});
                    window.location.href = "/signout-with-chatgpt?return_to=/";
                  }}
                >
                  <LogOut size={16} /> Sair da conta
                </button>
              </section>
            </div>
          )}
          <footer className="app-footer">
            <span>
              <BusIcon size={14} /> TrackBus <span>·</span> Mobilidade que
              conecta.
            </span>
            <span>
              I.See Technologies <span>© 2026</span>
            </span>
          </footer>
        </main>
      </div>
      {form && (
        <RecordForm
          spec={form}
          onClose={() => setForm(null)}
          onSaved={refresh}
        />
      )}{" "}
      {routeEdit && (
        <RouteEditor
          route={routeEdit === "new" ? undefined : routeEdit}
          onClose={() => setRouteEdit(null)}
          onSaved={refresh}
        />
      )}{" "}
      {selectedTrip && (
        <TripDetail
          trip={selectedTrip}
          d={d}
          onClose={() => setTripId(null)}
          refresh={refresh}
          openNotice={() => {
            setTripId(null);
            openNotice(selectedTrip.id);
          }}
        />
      )}
    </div>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  const [page, setPage] = useState(0),
    size = 10,
    count = Math.ceil(rows.length / size),
    current = Math.min(page, Math.max(0, count - 1));
  return (
    <>
      {rows.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(current * size, current * size + size)
                  .map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {count > 1 && (
            <div className="pagination">
              <span>
                {current * size + 1}–
                {Math.min(rows.length, (current + 1) * size)} de {rows.length}
              </span>
              <button
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Anterior
              </button>
              <button
                disabled={current + 1 >= count}
                onClick={() => setPage(current + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty />
      )}
    </>
  );
}
function TripTable({
  trips,
  d,
  onSelect,
}: {
  trips: Trip[];
  d: State;
  onSelect: (id: string) => void;
}) {
  return (
    <DataTable
      headers={["Rota / viagem", "Veículo", "Horário", "Situação", ""]}
      rows={trips.map((t) => [
        <div className="cell-identity">
          <span className="cell-icon">
            <RouteIcon size={18} />
          </span>
          <div>
            <strong>
              {d.routes.find((r) => r.id === t.routeId)?.name || t.name}
            </strong>
            <small>{d.drivers.find((dr) => dr.id === t.driverId)?.name}</small>
          </div>
        </div>,
        d.vehicles.find((v) => v.id === t.vehicleId)?.name,
        <div>
          {time(t.plannedStart)}
          <small>{date(t.plannedStart)}</small>
        </div>,
        <Badge status={t.status} />,
        <button
          className="icon-button"
          aria-label={`Abrir ${t.name}`}
          onClick={() => onSelect(t.id)}
        >
          <ArrowUpRight size={17} />
        </button>,
      ])}
    />
  );
}
function TripCard({
  trip: t,
  d,
  onClick,
}: {
  trip: Trip;
  d: State;
  index: number;
  onClick: () => void;
}) {
  const eta = d.estimates.find((e) => e.tripId === t.id),
    loc = d.locations.find((l) => l.tripId === t.id),
    progress = loc ? project(loc.position, t.snapshot.geometry) : null,
    nextStop = t.snapshot.stops.find(
      (stop) =>
        !progress ||
        project(stop, t.snapshot.geometry).along > progress.along + 30,
    );
  return (
    <button className="trip-card" onClick={onClick}>
      <div className="trip-card-title">
        <span className="trip-bus">
          <BusIcon size={21} />
        </span>
        <div>
          <strong>{d.vehicles.find((v) => v.id === t.vehicleId)?.name}</strong>
          <small>{d.routes.find((r) => r.id === t.routeId)?.name}</small>
        </div>
        <ChevronRight size={17} />
      </div>
      <div className="trip-card-info">
        <Badge status={t.status} />
        <span>
          {eta?.available
            ? `${eta.minMinutes}–${eta.maxMinutes} min`
            : "ETA indisponível"}
        </span>
      </div>
      <div className="mini-progress">
        <span
          style={{
            width: `${t.status === "completed" ? 100 : progress ? Math.round((progress.along / Math.max(1, progress.total)) * 100) : 0}%`,
          }}
        />
      </div>
      <div className="trip-card-bottom">
        <span>
          <MapPin size={12} />
          {nextStop?.name || "Fim do percurso"}
        </span>
        <span>
          {loc?.position.source === "simulation"
            ? "Simulado"
            : loc
              ? "GPS"
              : "Sem posição"}
        </span>
      </div>
    </button>
  );
}
function RouteEditor({
  route,
  onClose,
  onSaved,
}: {
  route?: Route;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(route?.name || ""),
    [shift, setShift] = useState(route?.shift || "Manhã"),
    [description, setDescription] = useState(route?.description || ""),
    [stops, setStops] = useState<Stop[]>(route?.stops || []),
    [saving, setSaving] = useState(false);
  const add = (p: Point) =>
    setStops((s) => [
      ...s,
      {
        ...p,
        id: crypto.randomUUID(),
        name: `Parada ${s.length + 1}`,
        dwellSeconds: 45,
      },
    ]);
  return (
    <Modal
      wide
      title={route ? "Editar itinerário" : "Criar rota"}
      subtitle="Clique no mapa para adicionar paradas. O traçado é esquemático; viagens existentes preservam sua versão."
      onClose={onClose}
    >
      <div className="route-editor">
        <div className="route-editor-form">
          <label>
            Nome da rota
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Rota 04 · Pituba"
            />
          </label>
          <label>
            Turno
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {["Manhã", "Tarde", "Noite"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </label>
          <div className="stops-heading">
            <h3>
              Paradas <span>{stops.length}</span>
            </h3>
            <button
              className="text-button"
              onClick={() =>
                add({ lat: -12.98 + stops.length * 0.001, lng: -38.49 })
              }
            >
              <Plus size={14} /> Manual
            </button>
          </div>
          <div className="stop-editor-list">
            {stops.map((s, i) => (
              <div className="stop-edit" key={s.id}>
                <span className="stop-index">{i + 1}</span>
                <div>
                  <input
                    aria-label={`Nome da parada ${i + 1}`}
                    value={s.name}
                    onChange={(e) =>
                      setStops(
                        stops.map((p) =>
                          p.id === s.id ? { ...p, name: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <div className="coordinate-inputs">
                    <input
                      aria-label={`Latitude ${i + 1}`}
                      type="number"
                      step="any"
                      value={s.lat}
                      onChange={(e) =>
                        setStops(
                          stops.map((p) =>
                            p.id === s.id
                              ? { ...p, lat: Number(e.target.value) }
                              : p,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`Longitude ${i + 1}`}
                      type="number"
                      step="any"
                      value={s.lng}
                      onChange={(e) =>
                        setStops(
                          stops.map((p) =>
                            p.id === s.id
                              ? { ...p, lng: Number(e.target.value) }
                              : p,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="stop-buttons">
                  <button
                    className="icon-button"
                    title="Subir parada"
                    disabled={i === 0}
                    onClick={() => {
                      const a = [...stops];
                      [a[i - 1], a[i]] = [a[i], a[i - 1]];
                      setStops(a);
                    }}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title="Descer parada"
                    disabled={i === stops.length - 1}
                    onClick={() => {
                      const a = [...stops];
                      [a[i], a[i + 1]] = [a[i + 1], a[i]];
                      setStops(a);
                    }}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title="Excluir parada"
                    onClick={() => setStops(stops.filter((p) => p.id !== s.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <MapView
          large
          routes={
            stops.length > 1
              ? [
                  {
                    name,
                    stops,
                    geometry: stops.map((s) => [s.lng, s.lat]),
                    routed: false,
                  },
                ]
              : []
          }
          onPick={add}
        />
      </div>
      <div className="form-actions">
        <span className="muted">
          {stops.length} paradas ·{" "}
          {route ? `Nova versão: ${route.version + 1}` : "Versão inicial"}
        </span>
        <button className="button secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api(
                route ? `/routes/${route.id}` : "/routes",
                {
                  name,
                  description,
                  shift,
                  stops,
                  active: route?.active ?? true,
                },
                route ? "PUT" : "POST",
              );
              toast.success("Itinerário salvo");
              onSaved();
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Salvando…" : "Salvar itinerário"}
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
function TripDetail({
  trip: t,
  d,
  onClose,
  refresh,
  openNotice,
}: {
  trip: Trip;
  d: State;
  onClose: () => void;
  refresh: () => void;
  openNotice: () => void;
}) {
  const [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(7),
    [safe, setSafe] = useState(false),
    [waitStop, setWaitStop] = useState(t.snapshot.stops[0]?.id || ""),
    [gps, setGps] = useState("GPS desativado"),
    watch = useRef<number | null>(null),
    lastSent = useRef(0),
    busy = useRef(false),
    loc = d.locations.find((l) => l.tripId === t.id),
    eta = d.estimates.find((e) => e.tripId === t.id),
    canOperate = ["admin", "driver"].includes(d.actor.role),
    terminal = ["completed", "cancelled"].includes(t.status);
  const run = async (path: string, body: unknown) => {
    try {
      await api(path, body);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  useEffect(() => {
    if (!running || t.status !== "in_progress") return;
    const timer = setInterval(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await api<{ finished: boolean }>(
          `/trips/${t.id}/simulate`,
          { speed },
        );
        refresh();
        if (res.finished) setRunning(false);
      } catch (e) {
        toast.error((e as Error).message);
        setRunning(false);
      } finally {
        busy.current = false;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [running, t.id, t.status, speed]);
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );
  useEffect(() => {
    if (terminal) {
      setRunning(false);
      if (watch.current !== null) {
        navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        setGps("GPS desativado");
      }
    }
  }, [terminal]);
  function toggleGps() {
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      setGps("GPS desativado");
      return;
    }
    if (!navigator.geolocation) {
      setGps("GPS indisponível");
      return;
    }
    setGps("Aguardando permissão…");
    watch.current = navigator.geolocation.watchPosition(
      async (p) => {
        if (Date.now() - lastSent.current < 5000) return;
        lastSent.current = Date.now();
        try {
          await api(`/trips/${t.id}/location`, {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            timestamp: p.timestamp,
            speed: p.coords.speed,
            heading: p.coords.heading,
            source: "gps",
          });
          setGps("GPS ativo");
          refresh();
        } catch (e) {
          setGps(`Falha: ${(e as Error).message}`);
        }
      },
      (e) => {
        setGps(e.code === 1 ? "GPS sem permissão" : "Localização indisponível");
        if (watch.current !== null)
          navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }
  return (
    <Modal
      wide
      title={t.name}
      subtitle={`${d.vehicles.find((v) => v.id === t.vehicleId)?.name} · ${d.drivers.find((v) => v.id === t.driverId)?.name}`}
      onClose={onClose}
    >
      <div className="trip-detail-layout">
        <div>
          <MapView
            routes={[t.snapshot]}
            positions={
              loc ? [{ id: t.id, label: t.name, position: loc.position }] : []
            }
          />
          <div className="detail-facts">
            <Badge status={t.status} />
            <span>
              <Clock size={16} />
              {eta?.available
                ? `${eta.minMinutes}–${eta.maxMinutes} min ${eta.simulated ? "· simulado" : ""}`
                : eta?.reason || "Previsão indisponível"}
            </span>
            <span>
              {loc
                ? `Última posição: ${time(loc.position.timestamp)}`
                : "Sem posição recebida"}
            </span>
          </div>
          {canOperate && !terminal && (
            <div className="operations">
              <label className="safe-checkbox">
                <input
                  type="checkbox"
                  checked={safe}
                  onChange={(e) => setSafe(e.target.checked)}
                />{" "}
                O veículo está parado em local seguro.
              </label>
              <div className="operation-buttons">
                {transitions[t.status]
                  .filter((s) => s !== "cancelled" || d.actor.role === "admin")
                  .map((s) => (
                    <button
                      key={s}
                      disabled={!safe}
                      className={`button ${s === "in_progress" ? "primary" : "secondary"}`}
                      onClick={() =>
                        run(`/trips/${t.id}/status`, { status: s })
                      }
                    >
                      {s === "in_progress" ? (
                        <Play size={15} />
                      ) : s === "completed" ? (
                        <Check size={15} />
                      ) : (
                        <Pause size={15} />
                      )}{" "}
                      {s === "in_progress"
                        ? "Iniciar / retomar"
                        : statusLabels[s]}
                    </button>
                  ))}
                <button
                  className="button secondary"
                  disabled={!safe}
                  onClick={openNotice}
                >
                  <Bell size={15} /> Avisar passageiros
                </button>
              </div>
              {d.actor.role === "driver" && t.status !== "scheduled" && (
                <div className="gps-control">
                  <button
                    className="button secondary"
                    disabled={!safe}
                    onClick={toggleGps}
                  >
                    <Satellite size={16} />
                    {watch.current === null ? "Ativar GPS" : "Desativar GPS"}
                  </button>
                  <span>{gps}</span>
                  <small>
                    Mantenha a página aberta. O navegador pode suspender a
                    transmissão em segundo plano.
                  </small>
                </div>
              )}
              <div className="wait-control">
                <select
                  id="wait-stop"
                  aria-label="Parada para espera"
                  value={waitStop}
                  onChange={(e) => setWaitStop(e.target.value)}
                >
                  {t.snapshot.stops.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={!safe}
                  onClick={() =>
                    run(`/trips/${t.id}/wait`, {
                      stopId: waitStop,
                      seconds: t.waitUntil ? 0 : d.organization.maxWait,
                      safeStop: true,
                    })
                  }
                >
                  <Clock size={15} />
                  {t.waitUntil
                    ? "Encerrar espera"
                    : `Aguardar ${d.organization.maxWait / 60} min`}
                </button>
              </div>
              {t.waitUntil && (
                <p className="muted">
                  Espera autorizada até {time(t.waitUntil)}. Não pode ser
                  renovada na mesma parada.
                </p>
              )}
            </div>
          )}
          {d.actor.role === "admin" && d.organization.demo && !terminal && (
            <div className="simulator">
              <div>
                <FlaskConical size={20} />
                <strong>Simulador de percurso</strong>
                <Badge>SIMULADO</Badge>
              </div>
              <p>
                Posições fictícias publicadas no mesmo fluxo de acompanhamento.
              </p>
              <div>
                <label>
                  Velocidade
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    <option value={2}>7 km/h</option>
                    <option value={7}>25 km/h</option>
                    <option value={14}>50 km/h</option>
                    <option value={20}>72 km/h</option>
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={t.status !== "in_progress"}
                  onClick={() => setRunning(!running)}
                >
                  {running ? <Pause size={16} /> : <Play size={16} />}{" "}
                  {running ? "Pausar simulação" : "Iniciar simulação"}
                </button>
              </div>
            </div>
          )}
        </div>
        <aside className="itinerary">
          <h3>Itinerário da viagem</h3>
          <p>Versão preservada na programação</p>
          {t.snapshot.stops.map((s, i) => (
            <div className="itinerary-stop" key={s.id}>
              <span>{i + 1}</span>
              <div>
                <strong>{s.name}</strong>
                <small>
                  {i === 0
                    ? "Origem"
                    : i === t.snapshot.stops.length - 1
                      ? "Destino"
                      : `${s.dwellSeconds}s de permanência prevista`}
                </small>
              </div>
            </div>
          ))}
          <h3 className="history-heading">Histórico</h3>
          {d.events
            .filter((e) => e.tripId === t.id)
            .slice(0, 8)
            .map((e) => (
              <div className="history-event" key={e.id}>
                <span>{time(e.createdAt)}</span>
                <p>{e.message}</p>
              </div>
            ))}
        </aside>
      </div>
    </Modal>
  );
}
function Portal({ d }: { d: State; refresh: () => void }) {
  const st = d.students[0],
    t = d.trips.find(
      (t) =>
        t.routeId === st?.routeId &&
        !["completed", "cancelled"].includes(t.status),
    ),
    [walking, setWalking] = useState<{
      available: boolean;
      reason?: string;
      seconds?: number;
      meters?: number;
      geometry?: [number, number][];
      recommendation?: { status: string; minutes: number | null };
    } | null>(null),
    [loading, setLoading] = useState(false);
  if (!st || !t)
    return (
      <Empty text="Nenhuma viagem vinculada neste momento" icon={BusFront} />
    );
  const loc = d.locations.find((l) => l.tripId === t.id),
    eta = d.estimates.find((e) => e.tripId === t.id),
    stop = t.snapshot.stops.find((s) => s.id === st.stopId);
  return (
    <div className="portal-grid">
      <section className="panel">
        <MapView
          large
          routes={[t.snapshot]}
          walking={walking?.geometry}
          positions={
            loc ? [{ id: t.id, label: t.name, position: loc.position }] : []
          }
        />
      </section>
      <section className="panel portal-card">
        <span className="eyebrow">
          {d.actor.role === "guardian"
            ? `ACOMPANHANDO ${st.name.toUpperCase()}`
            : "SUA PRÓXIMA VIAGEM"}
        </span>
        <h2>
          {t.status === "in_progress"
            ? "Seu ônibus está a caminho."
            : t.status === "scheduled"
              ? "Sua viagem está programada."
              : "Acompanhe o status da viagem."}
        </h2>
        <Badge status={t.status} />
        <div className="eta-big">
          {eta?.available ? (
            <>
              <strong>
                {eta.minMinutes}–{eta.maxMinutes}
              </strong>
              <span>minutos {eta.simulated ? "· simulado" : ""}</span>
            </>
          ) : (
            <>
              <strong>—</strong>
              <span>{eta?.reason || "Previsão indisponível"}</span>
            </>
          )}
        </div>
        <div className="portal-stop">
          <MapPin size={21} />
          <div>
            <small>Sua parada</small>
            <strong>{stop?.name}</strong>
          </div>
        </div>
        <div className="report-facts">
          <span>
            Veículo
            <strong>
              {d.vehicles.find((v) => v.id === t.vehicleId)?.name}
            </strong>
          </span>
          <span>
            Última posição
            <strong>{time(loc?.position.timestamp || null)}</strong>
          </span>
          <span>
            Margem de segurança<strong>3 minutos</strong>
          </span>
        </div>
        <button
          className="button primary"
          disabled={loading}
          onClick={() => {
            if (!d.routingConfigured) {
              setWalking({
                available: false,
                reason:
                  "Serviço de trajetos a pé ainda não configurado. Sua localização não foi solicitada.",
              });
              return;
            }
            setLoading(true);
            if (!navigator.geolocation) {
              setWalking({
                available: false,
                reason: "Geolocalização não suportada",
              });
              setLoading(false);
              return;
            }
            navigator.geolocation.getCurrentPosition(
              async (p) => {
                try {
                  setWalking(
                    await api("/walking", {
                      tripId: t.id,
                      studentId: st.id,
                      lat: p.coords.latitude,
                      lng: p.coords.longitude,
                    }),
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setLoading(false);
                }
              },
              () => {
                toast.error(
                  "Não foi possível obter sua posição. Verifique a permissão de localização.",
                );
                setLoading(false);
              },
              { enableHighAccuracy: true, timeout: 15000 },
            );
          }}
        >
          <Footprints size={18} />
          {loading ? "Calculando…" : "Caminho até minha parada"}
        </button>
        {walking && (
          <div className="walking-result">
            {walking.available ? (
              <>
                <strong>
                  {Math.ceil((walking.seconds || 0) / 60)} min a pé ·{" "}
                  {Math.round(walking.meters || 0)} m
                </strong>
                <p>
                  {walking.recommendation?.status === "on_time"
                    ? `Saída recomendada em até ${walking.recommendation.minutes} min.`
                    : walking.recommendation?.status === "leave_now"
                      ? "Recomenda-se sair agora."
                      : walking.recommendation?.status === "insufficient"
                        ? "Pode não haver tempo suficiente. Aguarde orientação."
                        : "Previsão do ônibus indisponível."}
                </p>
                <small>
                  Estimativa sujeita a variação. Não corra para alcançar o
                  ônibus.
                </small>
              </>
            ) : (
              <p>{walking.reason}</p>
            )}
          </div>
        )}
        <p className="privacy-note">
          <ShieldCheck size={14} /> Sua localização não é armazenada.
        </p>
      </section>
    </div>
  );
}
