import { test, expect, type Page } from "@playwright/test";
const createdRoutes: string[] = [];
async function login(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/signin-with-chatgpt?return_to=/");
  await expect(
    page
      .getByRole("button", { name: "Configurar apresentação" })
      .or(page.getByRole("heading", { name: "Sua operação, em movimento." })),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Configurar apresentação" })
      .isVisible()
  )
    await page.getByRole("button", { name: "Configurar apresentação" }).click();
  await expect(
    page.getByRole("heading", { name: "Sua operação, em movimento." }),
  ).toBeVisible();
}
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:5173" });
  try {
    const page = await ctx.newPage();
    await login(page);
    const state = await (await page.request.get("/api/state")).json();
    const headers = { Origin: "http://127.0.0.1:5173" };
    async function post(path: string, data: unknown) {
      const r = await page.request.post("/api" + path, { headers, data });
      expect(r.status(), await r.text()).toBeLessThan(300);
      return r.json();
    }
    const vehicle = state.vehicles.find(
      (v: { name: string }) => v.name === "Horizonte 01",
    ) || {
      id: (
        await post("/vehicles", {
          name: "Horizonte 01",
          plate: "E2E0A01".replace("E2E", "EET"),
          model: "Teste",
          year: 2026,
          capacity: 44,
          status: "available",
        })
      ).id,
    };
    const gpsVehicle = state.vehicles.find(
      (v: { id: string }) =>
        v.id !== vehicle.id &&
        state.vehicles.find(
          (x: { id: string; status: string }) => x.id === v.id,
        )?.status === "available",
    ) || {
      id: (
        await post("/vehicles", {
          name: "GPS de teste",
          plate: "EET0A02",
          model: "Teste",
          year: 2026,
          capacity: 44,
          status: "available",
        })
      ).id,
    };
    const gpsDriver =
      state.drivers.find(
        (d: { userId: string }) =>
          d.userId === state.organization.id + ":driver-user-0",
      ) || state.drivers[0];
    const simDriver = state.drivers.find(
      (d: { id: string; status: string }) =>
        d.id !== gpsDriver.id && d.status === "active",
    ) || {
      id: (await post("/drivers", { name: "Motorista E2E", status: "active" }))
        .id,
    };
    const stops = [
      {
        id: "a",
        name: "Origem no Açude",
        lat: -7.2227228,
        lng: -35.8774256,
        dwellSeconds: 30,
      },
      {
        id: "b",
        name: "Parada intermediária",
        lat: -7.2249866,
        lng: -35.8807931,
        dwellSeconds: 30,
      },
      {
        id: "c",
        name: "Destino no Açude",
        lat: -7.2257942,
        lng: -35.8845174,
        dwellSeconds: 30,
      },
    ];
    for (const mode of ["simulation", "gps"]) {
      const name =
        mode === "simulation"
          ? "Rota 01 · Açude Velho"
          : "Circuito Congretech · Campina Grande · GPS real";
      const route = await post("/routes", {
        name,
        shift: "Manhã",
        departureTime: "07:00",
        stops,
      });
      createdRoutes.push(route.id);
      await post(`/routes/${route.id}/visibility`, { published: true });
      const trip = await post("/trips", {
        name: mode === "simulation" ? "Ida · Rota 01 · E2E" : "Viagem GPS E2E",
        routeId: route.id,
        vehicleId: mode === "simulation" ? vehicle.id : gpsVehicle.id,
        driverId: mode === "simulation" ? simDriver.id : gpsDriver.id,
        plannedStart: Date.now(),
        plannedEnd: Date.now() + 3600000,
        trackingMode: mode,
      });
      if (mode === "simulation") {
        await post(`/trips/${trip.id}/status`, { status: "in_progress" });
        await post(`/trips/${trip.id}/simulate`, { speed: 7 });
      }
    }
  } finally {
    await ctx.close();
  }
});
test("cadastro persiste após recarregar; mapa, editor e páginas abrem", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await expect(page.locator(".sidebar img[alt='TrackBus']")).toBeVisible();
  expect(
    await page
      .locator(".sidebar img[alt='TrackBus']")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth === 1254,
      ),
  ).toBe(true);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".stop-marker").first()).toBeVisible();
  await page.getByRole("link", { name: "Veículos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar registro" }).click();
  const suffix = String(Date.now()).slice(-3);
  await page.getByLabel("Nome", { exact: true }).fill("Veículo E2E " + suffix);
  await page
    .getByLabel("Placa (sem hífen)")
    .fill("EET" + suffix[0] + "A" + suffix.slice(1));
  await page.getByLabel("Marca e modelo").fill("Teste Volare");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.getByText("Veículo E2E " + suffix)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Veículo E2E " + suffix)).toBeVisible();
  await page.getByRole("link", { name: "Rotas e paradas" }).click();
  await page.getByRole("button", { name: "Editar itinerário" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Editar itinerário" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome da parada 1")).not.toHaveValue("");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  for (const label of [
    "Viagens",
    "Central de avisos",
    "Ocorrências",
    "Motoristas",
    "Alunos",
    "Embarques",
    "Calendário",
    "Manutenção",
    "Despesas",
    "Relatórios",
    "Auditoria",
    "Configurações",
  ]) {
    const link = page.getByRole("link", { name: new RegExp("^" + label) });
    if (!(await link.isVisible()))
      await page.locator(".more-tools summary").click();
    await link.click();
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Visão geral" }).click();
  await expect(page.locator(".bus-marker").first()).toBeVisible();
  await page.screenshot({ path: "work/desktop.png", fullPage: true });
});
test("comunicação entre dois contextos; perfil de aluno restringe gestão", async ({
  browser,
}) => {
  const adminContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
    }),
    studentContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
    });
  const admin = await adminContext.newPage(),
    student = await studentContext.newPage();
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await login(admin);
  await login(student);
  await student.getByLabel("Perfil de demonstração").selectOption("student");
  await expect(
    student.getByRole("heading", { name: "Monitoramento", exact: true }),
  ).toBeVisible();
  await expect(
    student.getByRole("link", { name: "Veículos", exact: true }),
  ).toHaveCount(0);
  await admin.getByRole("link", { name: /Central de avisos/ }).click();
  await admin.getByRole("button", { name: "Novo aviso" }).click();
  await admin
    .getByRole("combobox", { name: "Viagem", exact: true })
    .selectOption({
      label: (await (await admin.request.get("/api/state")).json()).trips.find(
        (t: { name: string }) => t.name.includes("Ida · Rota 01"),
      ).name,
    });
  await admin
    .getByRole("combobox", { name: "Categoria", exact: true })
    .selectOption("information");
  await admin.getByLabel("Atraso estimado (min)").fill("0");
  const message = "Aviso entre dispositivos " + Date.now();
  await admin.getByLabel("Mensagem aos passageiros").fill(message);
  await admin.getByRole("button", { name: "Salvar registro" }).click();
  await expect(admin.getByText(message, { exact: true })).toBeVisible();
  await student.getByRole("link", { name: /Central de avisos/ }).click();
  await expect(student.getByText(message, { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await student.getByLabel("Perfil de demonstração").selectOption("admin");
  await adminContext.close();
  await studentContext.close();
});
test("apelido, rota e parada persistem; simulador, caminhada sobre ruas e posição privada em outro navegador", async ({
  browser,
}) => {
  const adminContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
    }),
    guestContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
      viewport: { width: 390, height: 844 },
      geolocation: {
        latitude: -7.2227228,
        longitude: -35.8774256,
        accuracy: 5,
      },
      permissions: ["geolocation"],
    });
  try {
    const admin = await adminContext.newPage(),
      guest = await guestContext.newPage();
    await login(admin);
    const d = await (await admin.request.get("/api/state")).json();
    await guest.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await guest.goto("/#/participar");
    await guest.getByLabel("Como podemos te chamar?").fill("Lia");
    await guest
      .getByLabel("Escola demonstrativa")
      .selectOption(d.organization.id);
    await guest.getByRole("button", { name: "Entrar no TrackBus" }).click();
    await expect(
      guest.getByRole("heading", { name: "Sua viagem, Lia." }),
    ).toBeVisible();
    expect((await guest.request.get("/api/state")).status()).toBe(403);
    const sample = d.routes.find((r: { name: string }) =>
      r.name.includes("Rota 01"),
    );
    await guest.getByLabel("Rota da escola").selectOption(sample.id);
    await guest
      .getByLabel("Parada de embarque")
      .selectOption(sample.stops[1].id);
    await guest.getByLabel("Favoritar rota e parada").check();
    await guest.getByRole("button", { name: "Salvar escolha" }).click();
    await admin
      .locator(".trip-card")
      .filter({ hasText: "Horizonte 01" })
      .click();
    await admin
      .getByRole("button", { name: "Iniciar simulação", exact: true })
      .click();
    await expect(guest.locator(".eta-big")).toContainText(
      "minutos · simulado",
      { timeout: 20000 },
    );
    const remaining = guest.locator(".route-progress");
    await expect(remaining).toContainText("m de trajeto restante");
    const initialMeters = Number(
      (await remaining.innerText()).match(/^\d+/)?.[0],
    );
    await expect
      .poll(
        async () => Number((await remaining.innerText()).match(/^\d+/)?.[0]),
        { timeout: 20000 },
      )
      .toBeLessThan(initialMeters);
    await admin
      .getByRole("button", { name: "Pausar simulação", exact: true })
      .click();
    await guest.reload();
    await expect(guest.locator(".eta-big")).toContainText("minutos · simulado");
    await guest.getByText(/Escolha de rota ·/).click();
    const field = d.routes.find(
      (r: { name: string }) =>
        r.name === "Circuito Congretech · Campina Grande · GPS real",
    );
    await guest.getByLabel("Rota da escola").selectOption(field.id);
    await guest
      .getByLabel("Parada de embarque")
      .selectOption(field.stops[2].id);
    await guest.getByRole("button", { name: "Salvar escolha" }).click();
    await expect(
      guest.getByRole("heading", { name: "Viagem programada" }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Caminho até minha parada" })
      .click();
    await expect(guest.locator(".walking-result")).toContainText("871 m");
    await expect(guest.locator(".student-marker")).toBeVisible();
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: "work/smart-journey-v3.png",
      fullPage: true,
    });
  } finally {
    await guestContext.close();
    await adminContext.close();
  }
});
test("nova rota por cliques persiste no D1 e aparece em sessão independente do aluno", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
      viewport: { width: 1440, height: 1000 },
    }),
    other = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
      viewport: { width: 390, height: 844 },
    });
  try {
    const admin = await ctx.newPage(),
      student = await other.newPage();
    await login(admin);
    const initial = await (await admin.request.get("/api/state")).json(),
      name = "Rota PB por clique " + Date.now();
    await admin.getByRole("link", { name: "Rotas e paradas" }).click();
    await admin
      .getByRole("button", { name: "Criar rota", exact: true })
      .click();
    await admin.getByLabel("Nome da rota", { exact: true }).fill(name);
    await admin.getByLabel("Horário de referência").fill("06:30");
    const dialog = admin.getByRole("dialog"),
      canvas = dialog.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible();
    await expect(
      dialog.getByLabel("Buscar cidade ou coordenadas"),
    ).toBeVisible();
    await dialog.getByLabel("Buscar cidade ou coordenadas").fill("Guarabira");
    await dialog.getByRole("button", { name: "Buscar no mapa" }).click();
    await expect(
      dialog.getByRole("button", { name: "Guarabira · PB" }),
    ).toBeVisible();
    await dialog
      .getByLabel("Buscar cidade ou coordenadas")
      .fill("Campina Grande");
    await dialog.getByRole("button", { name: "Buscar no mapa" }).click();
    await dialog.getByRole("button", { name: "Campina Grande · PB" }).click();
    await admin.waitForTimeout(500);
    const box = (await canvas.boundingBox())!;
    await canvas.click({
      position: { x: box.width * 0.36, y: box.height * 0.56 },
    });
    await expect(dialog.locator(".stop-marker")).toHaveCount(1);
    let lat = Number(
      await admin.getByLabel("Latitude 1", { exact: true }).inputValue(),
    );
    expect(lat).toBeGreaterThan(-7.3);
    expect(lat).toBeLessThan(-7.1);
    const marker = (await dialog
      .locator(".stop-marker")
      .first()
      .boundingBox())!;
    await admin.mouse.move(
      marker.x + marker.width / 2,
      marker.y + marker.height / 2,
    );
    await admin.mouse.down();
    await admin.mouse.move(marker.x + 35, marker.y + 30, { steps: 8 });
    await admin.mouse.up();
    await expect(
      admin.getByLabel("Latitude 1", { exact: true }),
    ).not.toHaveValue(String(lat));
    lat = Number(
      await admin.getByLabel("Latitude 1", { exact: true }).inputValue(),
    );
    await expect(dialog.locator(".stop-marker")).toHaveCount(1);
    await canvas.click({
      position: { x: box.width * 0.68, y: box.height * 0.72 },
    });
    await expect(dialog.locator(".stop-marker")).toHaveCount(2);
    await admin.getByLabel("Nome da parada 1").fill("Origem Campina");
    await admin.getByLabel("Nome da parada 2").fill("Destino Campina");
    await admin.screenshot({ path: "work/v6-editor.png", fullPage: true });
    await admin.getByRole("button", { name: "Salvar itinerário" }).click();
    await expect(dialog).toHaveCount(0);
    await admin.reload();
    const card = admin.locator(".route-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card).toContainText("06:30");
    await card.getByRole("button", { name: "Publicar para alunos" }).click();
    await expect(
      card.getByRole("button", { name: "Ocultar dos alunos" }),
    ).toBeVisible();
    const after = await (await admin.request.get("/api/state")).json(),
      route = after.routes.find((r: { name: string }) => r.name === name);
    createdRoutes.push(route.id);
    expect(route.stops[0].name).toBe("Origem Campina");
    expect(route.stops[0].lat).toBe(lat);
    await student.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await student.goto("/#/participar");
    await student.getByLabel("Como podemos te chamar?").fill("Aluno PB");
    await student
      .getByLabel("Escola demonstrativa")
      .selectOption(initial.organization.id);
    await student.getByRole("button", { name: "Entrar no TrackBus" }).click();
    await expect(
      student.getByRole("button", { name: new RegExp(name) }),
    ).toBeVisible();
    await student.getByLabel("Rota da escola").selectOption(route.id);
    await student
      .getByLabel("Parada de embarque")
      .selectOption(route.stops[1].id);
    await student.getByLabel("Favoritar rota e parada").check();
    await student.getByRole("button", { name: "Salvar escolha" }).click();
    await expect(
      student.getByRole("heading", { name: "Aguardando viagem" }),
    ).toBeVisible();
    await student.reload();
    await expect(
      student
        .locator(".journey-grid")
        .getByText("Destino Campina", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await student.request.post("/api/routes/" + route.id + "/visibility", {
          headers: { Origin: "http://127.0.0.1:5173" },
          data: { published: false },
        })
      ).status(),
    ).toBe(403);
    await student.getByText(/Escolha de rota ·/).click();
    await student.screenshot({
      path: "work/v6-student-routes.png",
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await other.close();
  }
});
test("mobile sem transbordamento, navegação e acessibilidade básica", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "work/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "Veículos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Veículos", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar registro" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("três perfis e início de rota no navegador com GPS controlado de teste", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -7.2227228, longitude: -35.8774256, accuracy: 5 },
    permissions: ["geolocation"],
  });
  try {
    const page = await context.newPage();
    await login(page);
    expect(
      await page
        .getByLabel("Perfil de demonstração")
        .locator("option")
        .evaluateAll((options) =>
          options.map((o) => (o as HTMLOptionElement).value),
        ),
    ).toEqual(["admin", "driver", "student"]);
    await page.getByLabel("Perfil de demonstração").selectOption("driver");
    await page.getByRole("button", { name: /Abrir minha viagem/ }).click();
    await page.getByLabel("O veículo está parado em local seguro.").check();
    await page
      .getByRole("button", { name: "Iniciar rota com GPS", exact: true })
      .click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get("/api/state")).json();
        return s.locations.find(
          (l: { position: { source: string } }) => l.position.source === "gps",
        )?.position.lat;
      })
      .toBe(-7.2227228);
    await expect(page.getByText("GPS ativo", { exact: true })).toBeVisible();
    await page.screenshot({ path: "work/v7-driver-web.png", fullPage: true });
  } finally {
    await context.close();
  }
});
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
  });
  try {
    const page = await context.newPage();
    await login(page);
    for (const id of createdRoutes) {
      const response = await page.request.post(`/api/routes/${id}/archive`, {
        headers: { Origin: "http://127.0.0.1:5173" },
        data: {},
      });
      expect(response.status()).toBe(200);
    }
  } finally {
    await context.close();
  }
});
