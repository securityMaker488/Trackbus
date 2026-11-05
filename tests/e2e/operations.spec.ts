import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/signin-with-chatgpt?return_to=/");
  await expect(
    page
      .getByRole("button", { name: "Abrir demonstração" })
      .or(page.getByRole("heading", { name: "Sua operação, em movimento." })),
  ).toBeVisible();
  if (
    await page.getByRole("button", { name: "Abrir demonstração" }).isVisible()
  )
    await page.getByRole("button", { name: "Abrir demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Sua operação, em movimento." }),
  ).toBeVisible();
}
test.beforeAll(async({browser})=>{const ctx=await browser.newContext({baseURL:"http://127.0.0.1:5173"});try{const page=await ctx.newPage();await login(page);const state=await (await page.request.get("/api/state")).json();const headers={Origin:"http://127.0.0.1:5173"};for(const route of state.routes.filter((r:{name:string})=>r.name.includes("Rota 01")))expect((await page.request.post(`/api/routes/${route.id}/visibility`,{headers,data:{published:true}})).status()).toBe(200);expect((await page.request.post("/api/journey/prepare",{headers,data:{}})).status()).toBe(200);}finally{await ctx.close();}});
test("cadastro persiste após recarregar; mapa, editor e páginas abrem", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
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
    "Alunos e responsáveis",
    "Embarques",
    "Calendário",
    "Manutenção",
    "Despesas",
    "Relatórios",
    "Auditoria",
    "Configurações",
  ]) {
    await page.getByRole("link", { name: new RegExp("^" + label) }).click();
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
    .selectOption({ label: "Ida · Rota 01 · Federação" });
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
test("apelido, rota e parada persistem; simulador, caminhada sobre ruas e posição privada em outro navegador",async({browser})=>{
 const adminContext=await browser.newContext({baseURL:"http://127.0.0.1:5173"}),guestContext=await browser.newContext({baseURL:"http://127.0.0.1:5173",viewport:{width:390,height:844},geolocation:{latitude:-12.9978788,longitude:-38.5130599,accuracy:5},permissions:["geolocation"]});
 try{const admin=await adminContext.newPage(),guest=await guestContext.newPage();await login(admin);const d=await(await admin.request.get("/api/state")).json();await guest.route("https://tile.openstreetmap.org/**",r=>r.abort());await guest.goto("/#/participar");await guest.getByLabel("Como podemos te chamar?").fill("Lia");await guest.getByLabel("Escola demonstrativa").selectOption(d.organization.id);await guest.getByRole("button",{name:"Entrar no TrackBus"}).click();await expect(guest.getByRole("heading",{name:"Sua viagem, Lia."})).toBeVisible();expect((await guest.request.get("/api/state")).status()).toBe(403);
 const sample=d.routes.find((r:{name:string})=>r.name.includes("Rota 01"));await guest.getByLabel("Rota da escola").selectOption(sample.id);await guest.getByLabel("Parada de embarque").selectOption(sample.stops[1].id);await guest.getByLabel("Favoritar rota e parada").check();await guest.getByRole("button",{name:"Salvar escolha"}).click();await admin.locator(".trip-card").filter({hasText:"Horizonte 01"}).click();await admin.getByRole("button",{name:"Iniciar simulação",exact:true}).click();await expect(guest.locator(".eta-big")).toContainText("minutos · simulado",{timeout:20000});await admin.getByRole("button",{name:"Pausar simulação",exact:true}).click();await guest.reload();await expect(guest.locator(".eta-big")).toContainText("minutos · simulado");
 await guest.getByText(/Escolha de rota ·/).click();const field=d.routes.find((r:{name:string})=>r.name==="Circuito Congretech · GPS real");await guest.getByLabel("Rota da escola").selectOption(field.id);await guest.getByLabel("Parada de embarque").selectOption(field.stops[2].id);await guest.getByRole("button",{name:"Salvar escolha"}).click();await expect(guest.getByRole("heading",{name:"Viagem programada"})).toBeVisible();await guest.getByRole("button",{name:"Caminho até minha parada"}).click();await expect(guest.locator(".walking-result")).toContainText("727 m");await expect(guest.locator(".student-marker")).toBeVisible();expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await guest.screenshot({path:"work/smart-journey-v3.png",fullPage:true});
 }finally{await guestContext.close();await adminContext.close();}
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
